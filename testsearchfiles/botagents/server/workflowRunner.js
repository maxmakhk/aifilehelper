/**
 * Workflow Runner for Node.js
 *
 * Executes fnString in a sandbox created with `new Function('ctx', ...)`.
 * Provides two entrypoints:
 *  - `runWorkflow(socket, opts)` for socket-driven runs (emits events)
 *  - `executeWorkflow(opts)` for programmatic runs with callbacks
 */

import projectManager from './projectManager.js';

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function normalizeVarKey(name) {
  return String(name || '').toLowerCase().replace(/\./g, '_');
}

function sanitizeSource(src) {
  if (!src || typeof src !== 'string') return src;
  let s = src;
  // Remove ES module import lines
  s = s.replace(/^\s*import[\s\S]*?;?\s*$/gm, '');
  // Remove lone export {...} lines
  s = s.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');
  // Replace `export default async function` / `export default function`
  s = s.replace(/export\s+default\s+async\s+function\s*/g, 'async function ');
  s = s.replace(/export\s+default\s+function\s*/g, 'function ');
  // Remove `export` prefix from declarations (const/let/var/function)
  s = s.replace(/^\s*export\s+(const|let|var|function|async function)\s+/gm, '$1 ');
  // Remove any remaining `export default ` occurrences
  s = s.replace(/export\s+default\s+/g, '');
  return s;
}

async function runLoop({
  getNodes,
  getEdges,
  apis,
  stepDelay,
  storeVars,
  broadcastLog,
  broadcastState,
  checkAbort,
  makeCtx,
  projectId = null,
  waitResolvers
}) {
  const getApis = (typeof apis === 'function') ? apis : () => (Array.isArray(apis) ? apis : []);
  // Find start node
  const findStartNode = () => {
    const nodesArr = getNodes();
    const edgesArr = getEdges();
    const incoming = {};
    edgesArr.forEach((e) => {
      if (!e) return;
      const t = String(e.target || e.to || '');
      if (!t) return;
      incoming[t] = (incoming[t] || 0) + 1;
    });
    const startNodes = nodesArr.filter((n) => !incoming[String(n.id)]);
    return startNodes.length ? startNodes[0] : nodesArr[0];
  };

  const startNode = findStartNode();
  if (!startNode) {
    broadcastLog('workflow_complete', {});
    return;
  }

  const getFromStoreNorm = (name, path) => {
    const key = String(name || '').toLowerCase().replace(/\./g, '_');
    // check namespaced (project-scoped) key first
    const namespacedKey = projectId ? `${projectId}__${key}` : null;
    const base = (namespacedKey && Object.prototype.hasOwnProperty.call(storeVars, namespacedKey)) ? storeVars[namespacedKey] : storeVars[key];
    if (base == null) return undefined;
    if (!path) return base;
    const parts = String(path).split('.');
    let cur = base;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  };

  const isTransientKey = (k) => {
    if (!k) return false;
    const s = String(k).toLowerCase();
    return s === 'waiting_wait' || s.startsWith('node_');
  };

  //const GLOBAL_KEYS = new Set(['imageurl','outputviewdialogue1','outputviewdialogue2','outputviewdialogue3','outputviewdialogue4']);
  const getVar = (k) => {
    console.log(`[getVar] ${k}`, projectManager.getGlobalVars());
    try {
      const key = normalizeVarKey(k);
      const global = projectManager.getGlobalVars() || {};
      if (Object.prototype.hasOwnProperty.call(global, key)) return global[key];
      if (Object.prototype.hasOwnProperty.call(storeVars, key)) return storeVars[key];
      return undefined;
    } catch (e) { return undefined; }
  };
  
  const setVar = (name, value) => {
    const key = normalizeVarKey(name);

    projectManager.setGlobalVar(key, value);
    //broadcastLog('store_vars_update', { storeVars, projectId });
    //broadcastState({ storeVars, projectId });
    // transient keys (waiting/node_*) remain only in local storeVars
    if (projectId && isTransientKey(key)) {
      const namespaced = `${projectId}__${key}`;
      storeVars[namespaced] = value;
      // broadcast transient updates to project watchers
      //broadcastLog('store_vars_update', { storeVars, projectId });
      //broadcastState({ storeVars, projectId });
      return;
    }

    // default: write into local storeVars
    storeVars[key] = value;
    broadcastLog('store_vars_update', { storeVars, projectId });
    broadcastState({ storeVars, projectId });
  };

  const evaluateEdgeCondition = (edgeLabel) => {
    if (!edgeLabel) return null;
    const label = String(edgeLabel).trim();
    if (label.toLowerCase() === 'else') return 'else';

    const conditionMatch = label.match(/^([A-Za-z0-9_.]+)\s*(===|!==|==|!=|<=|>=|<|>)\s*(.+)$/);
    if (conditionMatch) {
      const [, varName, operator, expectedValueStr] = conditionMatch;
      const actualValueRaw = getFromStoreNorm(varName, null);
      const expectedValue = expectedValueStr.trim();

      let parsedExpected;
      if (expectedValue === 'true') parsedExpected = true;
      else if (expectedValue === 'false') parsedExpected = false;
      else if (expectedValue === 'null') parsedExpected = null;
      else if (expectedValue === 'undefined') parsedExpected = undefined;
      else if (!isNaN(expectedValue)) parsedExpected = Number(expectedValue);
      else parsedExpected = expectedValue.replace(/^['"]/g, '').replace(/['"]$/g, '');

      let actualValue = actualValueRaw;
      if (parsedExpected !== null && typeof parsedExpected === 'number') {
        const maybeNum = Number(actualValueRaw);
        actualValue = isNaN(maybeNum) ? actualValueRaw : maybeNum;
      }

      switch (operator) {
        case '===': return actualValue === parsedExpected;
        case '!==': return actualValue !== parsedExpected;
        case '==': return actualValue == parsedExpected;
        case '!=': return actualValue != parsedExpected;
        case '<=': return actualValue <= parsedExpected;
        case '>=': return actualValue >= parsedExpected;
        case '<': return actualValue < parsedExpected;
        case '>': return actualValue > parsedExpected;
        default: return null;
      }
    }
    return null;
  };

  const nodesArrHolder = { getNodes, getEdges };

  // Wrap makeCtx output with a Proxy so `ctx.someKey = value` can route to setVar for GLOBAL_KEYS
  const proxiedMakeCtx = (currentNode) => {
    const base = makeCtx(currentNode);
    const handler = {
      set(target, prop, value) {
        try {
          const p = String(prop || '');
          const key = normalizeVarKey(p);
          const isGlobal = GLOBAL_KEYS.has(key);
          console.log(`[Proxy] ctx assignment: prop=${p}, key=${key}, value=`, value, `isGlobal=${isGlobal}`);
          if (isGlobal) {
            // route to runner setVar (will write to projectManager for GLOBAL_KEYS)
            setVar(p, value);
            return true;
          }
        } catch (e) { /* ignore */ }
        // default behavior
        return Reflect.set(target, prop, value);
      }
    };
    return new Proxy(base, handler);
  };

  const runNodeById = async (nodeId) => {
    if (checkAbort && checkAbort()) return;

    const nodesArr = nodesArrHolder.getNodes();
    const edgesArr = nodesArrHolder.getEdges();

    const currentNode = nodesArr.find((n) => String(n.id) === String(nodeId));
    if (!currentNode) return;

    broadcastLog('node_start', { nodeId: currentNode.id });
    broadcastState({ activeNodeId: currentNode.id, activeEdgeId: null });
    //console.log(`Running node: ${currentNode.id}`);

    const resolveApiFnFromApis = (node) => {
      try {
        const apiList = getApis();

        if (!apiList || !Array.isArray(apiList) || apiList.length === 0) return null;
        const rawLabel = String(node?.data?.label || node?.label || node?.data?.labelText || '').trim();
        const normalized = rawLabel.replace(/^api[:\s-]*/i, '').trim().toLowerCase();
        if (!normalized){
          //console.warn(`Node ${node.id} has no label to resolve API function from`);
          return null;
        }
        for (const a of apiList) {
          const cand = String(a?.name || a?.label || a?.displayName || a?.id || '').trim().toLowerCase();
          if (!cand) continue;
          if (cand === normalized || cand.includes(normalized) || normalized.includes(cand)) {
            //console.log(`Resolved API function for node ${node.id} using label "${rawLabel}" to API "${a.name || a.label || a.displayName || a.id}"`);
            return a?.function || a?.fnString || a?.functionBody || null;
          }
        }
      } catch (e) { }
      return null;
    };

    let source = currentNode.data?.fnString || null;
    if (!source) {
      const apiFn = resolveApiFnFromApis(currentNode);
      if (apiFn) source = apiFn;
    }

    // Sanitize to remove ES module syntax that's invalid inside new Function
    if (source) source = sanitizeSource(source);

    if (source) {
      try {
        const wrapper = new Function('ctx', `
          return (async (ctx) => {
            // compatibility aliases
            const storeVars = ctx.storeVars;
            const setVar = ctx.setVar;
            const getVar = ctx.getVar;
            const node = ctx.node;
            const apis = ctx.apis;
            const fetch = ctx.fetch;
            const console = ctx.console;

            ${source}

            const _arg = (ctx && ctx.node && ctx.node.data && (ctx.node.data.input ?? ctx.node.data.config ?? ctx.node.data.payload)) || ctx.config || ctx;

            if (typeof processRequest === 'function') return await processRequest(_arg);
            if (typeof handler === 'function') return await handler(_arg);
            if (typeof main === 'function') return await main(_arg);
            if (typeof run === 'function') return await run(_arg);

            return undefined;
          })(ctx);
        `);

        const startTs = Date.now();
        //console.log(`Node ${currentNode.id} fn start - ${new Date(startTs).toISOString()}`);
        broadcastLog('node_log', { nodeId: currentNode.id, level: 'log', args: ['fn start', new Date(startTs).toISOString()] });
        // Log ctx snapshot before execution
        try {
          const baseCtx = makeCtx(currentNode);
          //console.log(`[Runner] ctx keys:`, Object.keys(baseCtx));
          //console.log(`[Runner] ctx.storeVars keys:`, Object.keys(baseCtx.storeVars || {}));
          //console.log(`[Runner] ctx.globalStoreVars keys:`, Object.keys(baseCtx.globalStoreVars || {}));
        } catch (e) { /* ignore logging errors */ }

        const result = await wrapper(proxiedMakeCtx(currentNode));

        // Check if result contains clientJS and broadcast it
        if (result && typeof result === 'object' && result.clientJS && typeof result.clientJS === 'string') {
          console.log(`clientJS:`, result.clientJS.length, currentNode.id);
          broadcastLog('client_js_exec', { nodeId: currentNode.id, clientJS: result.clientJS });
        }

        // Log store snapshots after execution
        try {
          //console.log(`[Runner] after node ${currentNode.id} storeVars keys:`, Object.keys(storeVars || {}));
          //console.log('[Runner] after node globalStoreVars keys:', Object.keys(projectManager.getGlobalVars() || {}));
        } catch (e) { /* ignore */ }
        const endTs = Date.now();
        const dur = endTs - startTs;
        //console.log(`Node ${currentNode.id} fn end - ${new Date(endTs).toISOString()} (duration ${dur}ms)`);
        broadcastLog('node_log', { nodeId: currentNode.id, level: 'log', args: ['fn end', new Date(endTs).toISOString(), dur] });

        // Check wait
        const isWaiting = getFromStoreNorm('waiting_wait');
        if (isWaiting) {
          setVar(`node_${currentNode.id}_status`, 'waiting_user_input');
          setVar(`node_${currentNode.id}_wait_start`, Date.now());
          broadcastLog('node_wait', { nodeId: currentNode.id, reason: 'waiting_user_input' });

          let resumeResolve;
          const resumePromise = new Promise((res) => { resumeResolve = res; });
          waitResolvers[String(currentNode.id)] = resumeResolve;
          await resumePromise;
          delete waitResolvers[String(currentNode.id)];
        }
      } catch (error) {
        console.error(`Node ${currentNode.id} execution error:`, error);
        setVar(`node_${currentNode.id}_error`, (error instanceof Error) ? error.message : String(error));
        broadcastLog('node_error', { nodeId: currentNode.id, error: (error instanceof Error) ? error.message : String(error) });
      }
    }

    if (checkAbort && checkAbort()) return;

    await sleep(stepDelay);

    const outgoing = edgesArr.filter((e) => String(e.source || e.from || '') === String(currentNode.id));
    if (!outgoing || outgoing.length === 0) return;

    let chosenEdge = null;
    let labelText = String(currentNode.data?.label || currentNode.data?.labelText || '').trim();

    if (outgoing.length === 1) {
      chosenEdge = outgoing[0];
    } else {
      for (const edge of outgoing) {
        if (evaluateEdgeCondition(edge.label) === true) {
          chosenEdge = edge; break;
        }
      }
      if (!chosenEdge) {
        const elseEdge = outgoing.find((e) => evaluateEdgeCondition(e.label) === 'else');
        if (elseEdge) chosenEdge = elseEdge;
        else chosenEdge = outgoing[0];
      }

      // metadata checkVar
      const metaVar = currentNode.data?.checkVar;
      const metaPath = currentNode.data?.checkPath;
      if (metaVar && !chosenEdge) {
        const actualValue = getFromStoreNorm(metaVar, metaPath);
        const actualStr = actualValue == null ? null : String(actualValue).trim().toLowerCase();
        if (actualStr != null) {
          const found = outgoing.find((e) => String(e.label || e.id || '').toLowerCase().includes(actualStr));
          if (found) chosenEdge = found;
        }
      }
    }

    if (!chosenEdge) return;

    broadcastLog('edge_start', { edgeId: chosenEdge.id || `edge_${chosenEdge.source}_${chosenEdge.target}` });
    broadcastState({ activeEdgeId: chosenEdge.id || `edge_${chosenEdge.source}_${chosenEdge.target}` });
    await sleep(Math.max(200, stepDelay - 150));

    const nextNode = nodesArrHolder.getNodes().find((n) => String(n.id) === String(chosenEdge.target || chosenEdge.to));
    if (!nextNode) return;

    await runNodeById(nextNode.id);
  };

  await runNodeById(startNode.id);
}

export async function runWorkflow(socket, { projectId, nodes, edges, apis = [], stepDelay = 1000, initialStoreVars = {} }) {
  // socket-run wrapper that uses runLoop
  const getNodes = (typeof nodes === 'function') ? nodes : () => (Array.isArray(nodes) ? nodes : []);
  const getEdges = (typeof edges === 'function') ? edges : () => (Array.isArray(edges) ? edges : []);

  let storeVars = { ...initialStoreVars };
  let abort = false;
  const waitResolvers = {};

  const broadcastLog = (event, data) => {
    try { socket.emit(event, data); } catch (e) { /* ignore */ }
  };
  const broadcastState = (updates) => {
    if (projectId) projectManager.updateProjectState(projectId, updates);
  };

  const makeCtx = (currentNode) => ({
    fetch: globalThis.fetch,
    console: {
      log: (...args) => { console.log(`[Node ${currentNode.id}]`, ...args); broadcastLog('node_log', { nodeId: currentNode.id, level: 'log', args }); },
      error: (...args) => { console.error(`[Node ${currentNode.id}] ERROR:`, ...args); broadcastLog('node_log', { nodeId: currentNode.id, level: 'error', args }); },
      warn: (...args) => { console.warn(`[Node ${currentNode.id}] WARN:`, ...args); broadcastLog('node_log', { nodeId: currentNode.id, level: 'warn', args }); }
    },
    alert: (msg) => { broadcastLog('node_log', { nodeId: currentNode.id, level: 'alert', args: [msg] }); },
    node: currentNode,
    storeVars: storeVars,
    globalStoreVars: projectManager.getGlobalVars(),
    setVar: (n, v) => {
      // use runner-level setVar so namespacing and broadcasts are consistent
      setVar(n, v);
    },
    // helper to read vars: checks global store first, then local storeVars
    getVar: (k) => {
      console.log(`[makeCtx.getVar] getVar called with key: ${k}`, projectManager.getGlobalVars());
      try {
        const key = normalizeVarKey(k);
        const global = projectManager.getGlobalVars() || {};
        if (Object.prototype.hasOwnProperty.call(global, key)) return global[key];
        if (Object.prototype.hasOwnProperty.call(storeVars, key)) return storeVars[key];
        return undefined;
      } catch (e) { return undefined; }
    },
    config: currentNode.data?.config || {},
    apis
  });

  // Wrap makeCtx output with a Proxy so `ctx.someKey = value` can route to setVar for GLOBAL_KEYS
  

  // socket controls
  socket.on('disconnect', () => { abort = true; });
  socket.on('stop_workflow', () => { abort = true; });

  socket.on('update_store_vars', (newVars) => {
    if (newVars && typeof newVars === 'object') {
      storeVars = { ...newVars };
      broadcastLog('store_vars_update', { storeVars });
    }
  });

  socket.on('update_workflow', (data) => {
    try {
      if (data && Array.isArray(data.nodes)) nodes = data.nodes;
      if (data && Array.isArray(data.edges)) edges = data.edges;
      broadcastLog('workflow_updated', { projectId, nodesCount: getNodes().length, edgesCount: getEdges().length });
    } catch (e) { }
  });

  socket.on('workflow_resume', (data) => {
    const nodeId = data?.nodeId; if (!nodeId) return;
    storeVars['waiting_wait'] = false; storeVars['node_' + String(nodeId) + '_status'] = 'user_continued';
    broadcastLog('store_vars_update', { storeVars });
    const resolver = waitResolvers[String(nodeId)]; if (typeof resolver === 'function') { try { resolver(); } catch (e) {} }
  });

  await runLoop({
    getNodes, getEdges, apis, stepDelay, storeVars,
    broadcastLog, broadcastState,
    checkAbort: () => abort,
    makeCtx,
    projectId,
    waitResolvers
  });

  broadcastLog('workflow_complete', {});
  if (projectId) projectManager.setProjectStatus(projectId, 'stopped');
}

export async function executeWorkflow({
  projectId,
  nodes,
  edges,
  apis = [],
  stepDelay = 1000,
  initialStoreVars = {},
  broadcastCallback = () => {},
  updateStateCallback = () => {},
  checkAbort = () => false
}) {
  const getNodes = (typeof nodes === 'function') ? nodes : () => (Array.isArray(nodes) ? nodes : []);
  const getEdges = (typeof edges === 'function') ? edges : () => (Array.isArray(edges) ? edges : []);

  let storeVars = { ...initialStoreVars };

  const broadcastLog = (event, data) => { try { broadcastCallback(event, data); } catch (e) { /* ignore */ } };
  const broadcastState = (updates) => { try { updateStateCallback(updates); } catch (e) { /* ignore */ } };

  const makeCtx = (currentNode) => ({
    fetch: globalThis.fetch,
    console: {
      log: (...args) => { console.log(`[Node ${currentNode.id}]`, ...args); broadcastLog('node_log', { nodeId: currentNode.id, level: 'log', args }); },
      error: (...args) => { console.error(`[Node ${currentNode.id}] ERROR:`, ...args); broadcastLog('node_log', { nodeId: currentNode.id, level: 'error', args }); },
      warn: (...args) => { console.warn(`[Node ${currentNode.id}] WARN:`, ...args); broadcastLog('node_log', { nodeId: currentNode.id, level: 'warn', args }); }
    },
    alert: (msg) => { broadcastLog('node_log', { nodeId: currentNode.id, level: 'alert', args: [msg] }); },
    node: currentNode,
    storeVars: storeVars,
    globalStoreVars: projectManager.getGlobalVars(),
    setVar: (n, v) => {
      const key = normalizeVarKey(n);
      const isTransientKey = (k) => {
        if (!k) return false;
        const s = String(k).toLowerCase();
        return s === 'waiting_wait' || s.startsWith('node_');
      };
      //don't filter any input, const GLOBAL_KEYS = new Set(['imageurl','outputviewdialogue1','outputviewdialogue2','outputviewdialogue3','outputviewdialogue4']);

      // transient keys (waiting/node_*) remain only in local storeVars
      if (projectId && isTransientKey(key)) {
        const namespaced = `${projectId}__${key}`;
        storeVars[namespaced] = v;
        broadcastLog('store_vars_update', { storeVars });
        broadcastState({ storeVars });
        return;
      }

      // global keys -> write to projectManager.globalStoreVars and broadcast separately
      //if (GLOBAL_KEYS.has(key)) {
        try {
          if (projectId && typeof projectManager?.setGlobalVar === 'function') {
            projectManager.setGlobalVar(key, v);
          } else if (typeof projectManager?.setGlobalVar === 'function') {
            projectManager.setGlobalVar(key, v);
          }
        } catch (e) { /* ignore */ }
        //return;
      //}

      // default: write into local storeVars
      storeVars[key] = v;
      broadcastLog('store_vars_update', { storeVars });
      broadcastState({ storeVars });
    },
    // helper to read vars: checks global store first, then local storeVars
    getVar: (k) => {
      try {
        const key = normalizeVarKey(k);
        const global = projectManager.getGlobalVars() || {};
        if (Object.prototype.hasOwnProperty.call(global, key)) return global[key];
        if (Object.prototype.hasOwnProperty.call(storeVars, key)) return storeVars[key];
        return undefined;
      } catch (e) { return undefined; }
    },
    config: currentNode.data?.config || {},
    apis
  });

  await runLoop({
    getNodes, getEdges, apis, stepDelay, storeVars,
    broadcastLog, broadcastState,
    checkAbort,
    makeCtx,
    projectId
  });
}
