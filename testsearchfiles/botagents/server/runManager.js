import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import EventEmitter from 'events';
import { runWorkflow } from './workflowRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, 'runs_store.json');

class RunManager {
  constructor() {
    this.io = null;
    this.runs = {}; // runId -> runObj
    this.handlers = {}; // runId -> event handlers registered by runner (via fakeSocket.on)
    this._loadFromDisk();
  }

  init(io) {
    this.io = io;
  }

  _persist() {
    try {
      // ensure directory exists
      try { fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true }); } catch (e) { }
      const data = Object.values(this.runs).map(r => ({ runId: r.runId, projectId: r.projectId, status: r.status, startedAt: r.startedAt, currentNodeId: r.currentNodeId, lastHeartbeat: r.lastHeartbeat }));
      fs.writeFileSync(STORE_PATH, JSON.stringify({ runs: data }, null, 2));
    } catch (e) { console.warn('Failed to persist runs:', e); }
  }

  _loadFromDisk() {
    try {
      if (!fs.existsSync(STORE_PATH)) return;
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      // We only load metadata; active runs must be restarted manually or left stopped.
      if (parsed && Array.isArray(parsed.runs)) {
        parsed.runs.forEach(r => {
          let loadedStatus = r.status || 'stopped';
          // If the server restarted while a run was active, we lost its execution context.
          // Force it to 'stopped' so the UI doesn't get stuck thinking it's still running.
          if (loadedStatus === 'running' || loadedStatus === 'starting') {
            loadedStatus = 'stopped';
          }
          this.runs[r.runId] = {
            runId: r.runId, projectId: r.projectId, status: loadedStatus,
            startedAt: r.startedAt || null, currentNodeId: r.currentNodeId || null,
            lastHeartbeat: r.lastHeartbeat || null
          };
        });
      }
    } catch (e) { console.warn('Failed to load runs from disk:', e); }
  }

  startRun({ projectId, nodes = [], edges = [], apis = [], options = {} }) {
    if (!projectId) throw new Error('projectId required');

    // If there's already a running run for this project, return it
    const existing = Object.values(this.runs).find(r => r.projectId === projectId && r.status === 'running');
    if (existing) return existing;

    const runId = 'run_' + randomUUID();
    const room = `run:${runId}`;

    // create fake socket object compatible with runWorkflow
    const handlers = {};
    const fakeSocket = {
      id: `backend_${runId}`,
      emit: (event, payload) => {
        try {
          // update run metadata for introspection
          if (event === 'store_vars_update') {
            runObj.storeVars = payload || runObj.storeVars || {};
            runObj.lastHeartbeat = new Date().toISOString();
            this._persist();
          }
          if (event === 'node_start' && payload && payload.nodeId) {
            runObj.currentNodeId = payload.nodeId;
            runObj.lastHeartbeat = new Date().toISOString();
            this._persist();
          }
          if (event === 'run_started') {
            runObj.status = 'running';
            runObj.lastHeartbeat = new Date().toISOString();
            this._persist();
          }
          if (event === 'run_completed' || event === 'workflow_complete') {
            runObj.status = 'completed';
            runObj.lastHeartbeat = new Date().toISOString();
            this._persist();
          }
          if (this.io) this.io.to(room).emit(event, payload);
        } catch (e) { }
      },
      on: (ev, fn) => {
        handlers[ev] = fn;
      },
      // utility to call registered handlers from external inputs
      __call: (ev, payload) => {
        try { if (typeof handlers[ev] === 'function') handlers[ev](payload); } catch (e) { console.warn('run handler error', e); }
      }
    };

    const runObj = {
      runId,
      projectId,
      room,
      status: 'starting',
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      currentNodeId: null,
      storeVars: {},
      nodes,
      edges,
      apis,
      options,
      fakeSocket,
      abort: false
    };

    this.runs[runId] = runObj;
    this._persist();

    console.log(`[RunManager] startRun -> projectId=${projectId} runId=${runId} nodes=${(nodes || []).length} edges=${(edges || []).length}`);

    // run asynchronously
    (async () => {
      try {
        runObj.status = 'running';
        this._persist();
        runObj.fakeSocket.emit('run_started', { runId, projectId });

        // supply socket-like object to existing runWorkflow implementation
        await runWorkflow(runObj.fakeSocket, { nodes, edges, apis, stepDelay: options.stepDelay || 800, initialStoreVars: options.initialStoreVars || {} });

        runObj.status = 'completed';
        runObj.lastHeartbeat = new Date().toISOString();
        this._persist();
        runObj.fakeSocket.emit('run_completed', { runId });
      } catch (err) {
        console.error('Run failed:', err);
        runObj.status = 'error';
        runObj.fakeSocket.emit('run_error', { runId, message: err?.message || String(err) });
        this._persist();
      }
    })();

    return runObj;
  }

  stopRun(runId) {
    const r = this.runs[runId];
    if (!r) return null;
    r.abort = true;
    r.status = 'stopping';
    // trigger stop_workflow handler inside runner if exists
    try { r.fakeSocket.__call('stop_workflow'); } catch (e) { }
    r.status = 'stopped';
    r.stoppedAt = new Date().toISOString();
    this._persist();
    try { r.fakeSocket.emit('run_stopped', { runId }); } catch (e) { }
    return r;
  }

  getRunStatusByProject(projectId) {
    const r = Object.values(this.runs).find(x => x.projectId === projectId);
    if (!r) return null;
    const isRunning = r.status === 'running' || r.status === 'starting';
    return {
      runId: r.runId, projectId: r.projectId, status: r.status,
      currentNodeId: r.currentNodeId, startedAt: r.startedAt,
      lastHeartbeat: r.lastHeartbeat, storeVars: r.storeVars || {},
      nodes: isRunning ? (r.nodes || []) : undefined,
      edges: isRunning ? (r.edges || []) : undefined
    };
  }

  getRun(runId) {
    const r = this.runs[runId] || null;
    if (!r) return null;
    const isRunning = r.status === 'running' || r.status === 'starting';
    return {
      runId: r.runId, projectId: r.projectId, status: r.status,
      currentNodeId: r.currentNodeId, startedAt: r.startedAt,
      lastHeartbeat: r.lastHeartbeat, storeVars: r.storeVars || {},
      nodes: isRunning ? (r.nodes || []) : undefined,
      edges: isRunning ? (r.edges || []) : undefined
    };
  }

  // called by server when a client sends a control message
  receiveClientEvent(runId, event, payload) {
    const r = this.runs[runId];
    if (!r) return false;
    try {
      // forward to runner handlers
      r.fakeSocket.__call(event, payload);
      // update heartbeat
      r.lastHeartbeat = new Date().toISOString();
      this._persist();
      return true;
    } catch (e) { return false; }
  }
}

const manager = new RunManager();
export default manager;
