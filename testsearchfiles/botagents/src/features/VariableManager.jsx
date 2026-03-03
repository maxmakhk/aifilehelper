import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import WorkflowGraph from './variableManager/components/WorkflowGraph';
import VariableTableContainer from './variableManager/components/VariableTableContainer';
import NodeDetailsModal from './variableManager/components/NodeDetailsModal';
import TabNavigation from './variableManager/components/TabNavigation';
import RuleCheckerPanel from './variableManager/components/RuleCheckerPanel';
import RuleCategoryPanel from './variableManager/components/RuleCategoryPanel';
import ManualEditPanel from './variableManager/components/ManualEditPanel';
import ExternalAPIPanel from './variableManager/components/ExternalAPIPanel';
import LogsPanel from './variableManager/components/LogsPanel';
import VariablePromptPanel from './variableManager/components/VariablePromptPanel';
import useVariables from './variableManager/hooks/useVariables';
import useRuleSources from './variableManager/hooks/useRuleSources';
import useExternalApis from './variableManager/hooks/useExternalApis';
import useLogs from './variableManager/hooks/useLogs';
import useAIPrompts from './variableManager/hooks/useAIPrompts';
import useWorkflowGraph from './variableManager/hooks/useWorkflowGraph';
import useRunDemo from './variableManager/hooks/useRunDemo';
import { AI_CHAT_ENDPOINT } from './variableManager/services/ai/aichatService';
import promptToFunctionUtil from './variableManager/utils/promptToFunction';
import normalizeFnUtil from './variableManager/utils/normalizeFn';
import fnToWorkflowUtil from './variableManager/utils/fnToWorkflow';
import applyPrefixToIdsUtil from './variableManager/utils/applyPrefixToIds';
import { getRandLightColor as getRandLightColorUtil, applyGroupColorToNodes as applyGroupColorToNodesUtil } from './variableManager/utils/colorUtils';
import applyRemodelResponseUtil from './variableManager/utils/applyRemodelResponse';
import StoreVarsFloating from './variableManager/components/StoreVarsFloating';
import ApiResultsFloating from './variableManager/components/ApiResultsFloating';
import ApiNodesFloating from './variableManager/components/ApiNodesFloating';
import { getTimeAgo, formatDate } from './variableManager/utils/dateUtils';
import { parseMaybeJson } from './variableManager/utils/jsonUtils';
import { getSingleFieldValue, renderSignalSummary } from './variableManager/utils/variableUtils';
import useProjectsWorkflow from './variableManager/hooks/useProjectsWorkflow';
import getLayoutedNodesAndEdges from './variableManager/utils/autoLayout';
import { collection, getDocs } from 'firebase/firestore';
import { loadRulesFromFirebaseService, saveRuleToFirebase, deleteRuleFromServer } from './variableManager/services/firebase';
import './variableManager.css';
import OutputView from '../components/OutputView.jsx';

const VariableManager = ({ onBack }) => {
  const db = window.db;

  // Variables hook
  const {
    variables,
    addVariable,
    updateVariable,
    deleteVariable,
    loadVariables,
    syncVariablesFromDatalist,
    runFilter,
    listStructure,
  } = useVariables(db);

  // Rule sources hook
  const {
    ruleSource,
    setRuleSource,
    rulePrompts,
    setRulePrompts,
    ruleNames,
    setRuleNames,
    ruleTypes,
    setRuleTypes,
    ruleSystemPrompts,
    setRuleSystemPrompts,
    ruleDetectPrompts,
    setRuleDetectPrompts,
    ruleRelatedFields,
    setRuleRelatedFields,
    ruleCategoryIds,
    setRuleCategoryIds,
    ruleExpressions,
    setExpression,
    functionsList,
    setFunctionsList,
    ruleCategories,
    selectedRuleCategoryId,
    setSelectedRuleCategoryId,
    categoriesLoading,
    newCategoryName,
    setNewCategoryName,
    editingCategoryId,
    setEditingCategoryId,
    saveRuleCategory,
    deleteRuleCategory,
    ruleGroups,
    selectedGroupId,
    setSelectedGroupId,
    groupsLoading,
    newGroupName,
    setNewGroupName,
    newGroupContent,
    setNewGroupContent,
    editingGroupId,
    setEditingGroupId,
    groupTesting,
    setGroupTesting,
    saveRuleGroup,
    deleteRuleGroup,
    createRuleId,
    normalizeLegacyFromFunctions,
  } = useRuleSources(db);

  // External APIs hook
  const {
    apis,
    setApis,
    apisLoading,
    newApiName,
    setNewApiName,
    newApiUrl,
    setNewApiUrl,
    selectedApiId,
    setSelectedApiId,
    testing,
    testResult,
    testInput,
    setTestInput,
    loadApis,
    addApi,
    deleteApi,
    saveApiPrompt,
    updateApiMetadata,
    testApi,
  } = useExternalApis(db);

  // Logs hook
  const {
    logs,
    logsLoading,
    logsAllLoaded,
    loadLogs,
    appendLog,
  } = useLogs(db);

  // AI prompts hook
  const {
    aiPrompt,
    setAiPrompt,
    aiResponse,
    setAiResponse,
    aiWarning,
    setAiWarning,
    aiLoading,
    setAiLoading,
    generatingRuleIndex,
    setGeneratingRuleIndex,
    workflowLoading,
    setWorkflowLoading,
    workflowError,
    setWorkflowError,
    generateRule,
    generateWorkflow,
  } = useAIPrompts();

  // Workflow graph hook
  const {
    rfNodes,
    setRfNodes,
    onRfNodesChange,
    rfEdges,
    setRfEdges,
    onRfEdgesChange,
    rfInstance,
    setRfInstance,
    selectedIds,
    setSelectedIds,
    onConnect,
    onSelectionChange,
    onEdgeDoubleClick,
    edgeEdit,
    commitEdgeLabel,
    cancelEdgeEdit,
    onNodeDoubleClick,
    onNodeClick,
    nodeModalOpen,
    setNodeModalOpen,
    selectedNodeDetails,
    setSelectedNodeDetails,
    workflowData,
    setWorkflowData,
    loadWorkflowIntoFlow,
    exportWorkflow,
    tabSwitchLockRef,
    layoutDirection,
    setLayoutDirection,
  } = useWorkflowGraph();

  // Run demo / prompt pipeline hook (must come before handleNodePromptSubmit)
  const {
    socketRef,
    runProject,
    runActive,
    activeNodeId: runCurrentNodeId,
    activeEdgeId: runCurrentEdgeId,
    storeVars,
    setStoreVars,
    submitPrompt,
    promptProcessing,
    promptStatus,
    setProjectId,
    allProjectStatuses,
    globalStoreVars,
  } = useRunDemo({ rfNodes, rfEdges, apis });
  

  // Prevent repeatedly applying the same merged workflow (guard against re-renders)
  const lastAppliedMergedRef = useRef(null);

  // API nodes floating picker visibility
  const [showApiNodes, setShowApiNodes] = useState(false);

  useEffect(() => {
    try {
      window.vm_toggleApiNodes = (val) => {
        try {
          if (typeof val === 'undefined') setShowApiNodes((s) => !s);
          else setShowApiNodes(!!val);
        } catch (e) { /* ignore */ }
      };
    } catch (e) { }
    return () => { try { delete window.vm_toggleApiNodes; } catch (e) { } };
  }, []);

  // Reload APIs when API nodes panel is opened
  useEffect(() => {
    if (showApiNodes) {
      loadApis();
    }
  }, [showApiNodes, loadApis]);

  // Auto-layout handler using dagre helper
  const handleAutoLayout = useCallback((nodes, edges) => {
    try {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedNodesAndEdges(nodes || rfNodes || [], edges || rfEdges || [], 'LR');
      try { if (typeof setLayoutDirection === 'function') setLayoutDirection('LR'); } catch (e) { /* ignore */ }
      if (Array.isArray(layoutedNodes)) {
        // log before/after positions for debugging layout application
        try {
          const before = (nodes || rfNodes || []).map((n) => ({ id: n.id, pos: n.position || null }));
          const after = layoutedNodes.map((n) => ({ id: n.id, pos: n.position || null }));
          console.debug('Auto-layout positions — before:', before, 'after:', after);
        } catch (e) { /* ignore logging errors */ }

        // apply rounded positions to avoid very small fractional differences
        const rounded = layoutedNodes.map((n) => ({ ...n, position: n.position ? { x: Math.round(n.position.x), y: Math.round(n.position.y) } : n.position }));
        setRfNodes(rounded);
      }
      if (Array.isArray(layoutedEdges)) setRfEdges(layoutedEdges);
      // keep current zoom level; do not auto-fit after layout
    } catch (err) {
      console.error('Auto layout failed:', err);
    }
  }, [rfNodes, rfEdges, setRfNodes, setRfEdges, setLayoutDirection]);

  // Helper: generate a light pastel HSL color
  const getRandLightColor = () => {
    const h = Math.floor(Math.random() * 360);
    const s = 60 + Math.floor(Math.random() * 20);
    const l = 85 + Math.floor(Math.random() * 8);
    return `hsl(${h}, ${s}%, ${l}%)`;
  };

  // Helper: apply a group/background color and default text color to nodes array
  const applyGroupColorToNodes = (nodes, color) => {
    if (!Array.isArray(nodes)) return nodes;
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        backgroundColor: color,
        textColor: '#0f172a',
      },
    }));
  };

  // Prepared stub for node prompt submit
  // Convert a normalized prompt into a JS arrow function using the AI endpoint
  const promptToFunction = useCallback((normalizedPrompt) => promptToFunctionUtil(normalizedPrompt), []);

  // Normalize generated function: search for storeVars usage and inject API calls
  const normalizeFn = useCallback((fnString) => {
    if (!fnString || typeof fnString !== 'string') {
      return fnString;
    }

    // Pattern to match variable declarations with storeVars
    // Matches: const varName = storeVars.storeName or let varName = storeVars.storeName
    const varPattern = /(\n\s*)(const|let)\s+(\w+)\s*=\s*storeVars\.(\w+)/g;

    let result = fnString;
    const replacements = [];
    let match;

    // Collect all matches first (to maintain correct indices)
    while ((match = varPattern.exec(fnString)) !== null) {
      replacements.push({
        index: match.index,
        fullMatch: match[0],
        indent: match[1],
        declaration: match[2], // 'const' or 'let'
        varName: match[3],
        storeVarName: match[4]
      });
    }

    // Process matches in reverse to keep indices correct when replacing
    for (let i = replacements.length - 1; i >= 0; i--) {
      const { index, fullMatch, indent, storeVarName } = replacements[i];

      // Try to find a matching API by name or tag
      let matchedApi = null;
      const searchName = storeVarName.toLowerCase();

      if (Array.isArray(apis) && apis.length > 0) {
        matchedApi = apis.find((api) => {
          if (!api) return false;

          // Check if API name matches storeVarName
          const apiName = (api.name || '').toLowerCase();
          console.log('Checking API match:', { apiName, searchName, apiTags: api.tag });
          if (apiName === searchName) return true;

          // Check if storeVarName is in API tags
          if (Array.isArray(api.tag)) {
            return api.tag.some((tag) => (tag || '').toLowerCase() === searchName);
          }

          return false;
        });
      }

      // If API found, insert console.log before the variable declaration
      if (matchedApi) {
        const apiName = matchedApi.name || '';
        const apiUrl = matchedApi.url || '';
        const storeLocation = `storeVars["${apiName}"]`;

        // Create the console.log statement with proper indentation
        const apiLog = `${indent}console.log("requestAPI", "${apiName}", "${apiUrl}", {}, "${storeLocation}");`;
        const replacement = `${apiLog}${fullMatch}`;

        // Replace in result
        result = result.substring(0, index) + replacement + result.substring(index + fullMatch.length);
      }
    }

    return result;
  }, [apis]);

  const applyPrefixToIds = (parsedFlow) => {
    const nodePrefix = Math.random().toString(36).slice(2, 8) + '_';

    for (let i in parsedFlow.edges) {
      parsedFlow.edges[i].id = nodePrefix + parsedFlow.edges[i].id;
      parsedFlow.edges[i].source = nodePrefix + parsedFlow.edges[i].source;
      parsedFlow.edges[i].target = nodePrefix + parsedFlow.edges[i].target;
    }
    for (let i in parsedFlow.nodes) {
      parsedFlow.nodes[i].id = nodePrefix + parsedFlow.nodes[i].id;
    }

    return parsedFlow;
  };


  const handleNodePromptSubmit = useCallback((nodeId, promptText, related = {}) => {
    console.log('Node prompt submitted (server-side pipeline):', { nodeId, promptText, related });
    submitPrompt(nodeId, promptText, apis, workflowData, (result) => {
      try {
        const groupColor = getRandLightColor();
        const coloredNodes = applyGroupColorToNodes(result.nodes || [], groupColor);
        // Prefer server-provided generation/system values when available
        const resolvedSystemPrompt = (result.metadata && (result.metadata.generation && result.metadata.generation.system))
          || (result.metadata && (result.metadata.systemPrompt || result.metadata.system_prompt))
          || ((result.nodes || []).find(n => String(n.id) === String(nodeId))?.metadata?.systemPrompt)
          || ((result.nodes || []).find(n => String(n.id) === String(nodeId))?.data?.metadata?.systemPrompt)
          || result.metadata?.normalizedPrompt
          || promptText
          || '';

        let resolvedSystemPromptToFn = (result.metadata && result.metadata.generation && result.metadata.generation.result)
          || result.metadata?.systemPromptToFn
          || result.metadata?.systemPromptFn
          || result.metadata?.system_prompt_to_fn
          || '';

        // If server didn't provide a function, try converting the resolved system prompt on the client
        try {
          if (!resolvedSystemPromptToFn && resolvedSystemPrompt) {
            const fnFromPrompt = promptToFunction(resolvedSystemPrompt);
            if (fnFromPrompt) resolvedSystemPromptToFn = fnFromPrompt;
          }
        } catch (e) {
          console.warn('Failed to convert systemPrompt to function:', e);
        }

        const workflowResult = {
          ...(result.workflowData || {}),
          nodes: coloredNodes,
          edges: result.edges || [],
          originalPrompt: result.metadata?.originalPrompt || promptText,
          normalizedPrompt: result.metadata?.normalizedPrompt,
          fnString: result.metadata?.fnString,
          normalizeFnString: result.metadata?.normalizeFnString,
          systemPrompt: resolvedSystemPrompt,
          systemPromptToFn: resolvedSystemPromptToFn
        };
        applyRemodelResponse(nodeId, workflowResult, related, workflowData);
        try { if (typeof setTaskFunctionText === 'function') setTaskFunctionText(result.metadata?.fnString); } catch (e) { /* ignore */ }
      } catch (err) {
        console.warn('Failed to apply server workflow result:', err);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitPrompt, apis, workflowData]);

  // v3
  const applyRemodelResponse = (centerNodeId, remodelJson, related, full = null) => {

    if (!remodelJson || !Array.isArray(remodelJson.nodes) || !Array.isArray(remodelJson.edges)) {
      console.warn('Invalid remodelJson, expected { nodes: [], edges: [] }');
      return;
    }

    // --- 1. 選 base graph ---
    const fullFlow =
      full || (workflowData && Array.isArray(workflowData.nodes) ? workflowData : null);

    let baseNodes = fullFlow && Array.isArray(fullFlow.nodes)
      ? JSON.parse(JSON.stringify(fullFlow.nodes))
      : JSON.parse(JSON.stringify(rfNodes || []));
    let baseEdges = fullFlow && Array.isArray(fullFlow.edges)
      ? JSON.parse(JSON.stringify(fullFlow.edges))
      : JSON.parse(JSON.stringify(rfEdges || []));

    // Normalize baseEdges to use {source, target} format (React Flow standard)
    // Handle edges that may come in {from, to} format from stored workflows
    baseEdges = baseEdges.map((e) => ({
      ...e,
      source: e.source !== undefined && e.source !== null ? String(e.source) : String(e.from || ''),
      target: e.target !== undefined && e.target !== null ? String(e.target) : String(e.to || '')
    }));

    console.log('Base nodes for remodel:', baseNodes);
    console.log('Base edges for remodel (normalized):', baseEdges);
    console.log('Remodel nodes (raw):', remodelJson.nodes);
    console.log('Remodel edges (raw):', remodelJson.edges);

    console.log('applyRemodelResponseV3 (extend_node)', centerNodeId, remodelJson, related, 'full baseNodes baseEdges', baseNodes, baseEdges);
    // Debug: show normalization/generation metadata and fnToWorkflow diagnostics if present
    try {
      console.log('extend_node metadata:', remodelJson.metadata || null);
      console.log('extend_node fnToWorkflow.levelBlocks:', (remodelJson.fnToWorkflow && remodelJson.fnToWorkflow.levelBlocks) || null);
    } catch (e) { /* ignore logging errors */ }

    // --- 2. clone remodel nodes 先，不直接 mutate remodelJson.nodes ---
    const remodelNodes = JSON.parse(JSON.stringify(remodelJson.nodes || []));
    const remodelEdges = JSON.parse(JSON.stringify(remodelJson.edges || []));

    // 2-1. 自動補 start / end（只在沒提供 entry/exit 時會用到）
    let startNodes = remodelNodes.filter(n => n.type === 'start');
    let endNodes = remodelNodes.filter(n => n.type === 'end');

    if (startNodes.length === 0 && remodelNodes.length > 0) {
      remodelNodes[0].type = 'start';
      startNodes = [remodelNodes[0]];
    }

    if (endNodes.length === 0 && remodelNodes.length > 1) {
      const lastIdx = remodelNodes.length - 1;
      if (remodelNodes[lastIdx].type !== 'start') {
        remodelNodes[lastIdx].type = 'end';
        endNodes = [remodelNodes[lastIdx]];
      } else if (remodelNodes.length > 2) {
        remodelNodes[lastIdx - 1].type = 'end';
        endNodes = [remodelNodes[lastIdx - 1]];
      }
    }

    // --- 3. merge 新 nodes/edges 進 base ---
    // Adjust remodel nodes' positions: scale them down and center around the original center node
    let centerPos = { x: 0, y: 0 };
    try {
      const existingCenter = baseNodes.find(n => String(n.id) === String(centerNodeId));
      if (existingCenter && existingCenter.position) centerPos = existingCenter.position;
    } catch (e) { /* ignore */ }

    // compute bounding box of remodelNodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasPos = false;
    for (const rn of remodelNodes) {
      const p = rn.position || { x: 0, y: 0 };
      if (typeof p.x === 'number' && typeof p.y === 'number') {
        hasPos = true;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }

    const bboxWidth = isFinite(minX) && isFinite(maxX) ? Math.max(1, maxX - minX) : 1;
    const bboxHeight = isFinite(minY) && isFinite(maxY) ? Math.max(1, maxY - minY) : 1;
    // desired max span after scaling (keeps nodes reasonably close)
    const desiredMax = 320; // pixels
    const scale = hasPos ? Math.min(1, desiredMax / Math.max(bboxWidth, bboxHeight)) : 0.6;
    const bboxCenterX = hasPos ? (minX + maxX) / 2 : 0;
    const bboxCenterY = hasPos ? (minY + maxY) / 2 : 0;

    baseNodes.push(
      ...remodelNodes.map((n, idx) => {
        const origPos = n.position || { x: 0, y: 0 };
        let newPos = { x: 0, y: 0 };
        if (hasPos) {
          newPos.x = centerPos.x + (origPos.x - bboxCenterX) * scale;
          newPos.y = centerPos.y + (origPos.y - bboxCenterY) * scale;
        } else {
          // fallback: arrange in a compact grid near center
          const gap = 0;
          const cols = Math.ceil(Math.sqrt(remodelNodes.length || 1));
          const r = idx;
          const col = r % cols;
          const row = Math.floor(r / cols);
          newPos.x = centerPos.x + (col - (cols - 1) / 2) * gap;
          newPos.y = centerPos.y + row * gap - 40;
        }

        return {
          id: String(n.id),
          type: n.type || 'action',
          data: n.data || {},
          position: newPos,
          width: n.width || (n.data && n.data.width),
          height: n.height || (n.data && n.data.height),
          metadata: n.metadata || (n.data && n.data.metadata) || {},
        };
      }),
    );

    baseEdges.push(
      ...remodelEdges.map((e, idx) => ({
        id: String(e.id || `edgeB_${idx}`),
        source: String(e.source || e.from || ''),
        target: String(e.target || e.to || ''),
        label: e.label || '',
        sourceHandle:
          e.sourceHandle !== undefined &&
            e.sourceHandle !== null &&
            String(e.sourceHandle) !== 'undefined' &&
            String(e.sourceHandle) !== ''
            ? String(e.sourceHandle)
            : undefined,
        targetHandle:
          e.targetHandle !== undefined &&
            e.targetHandle !== null &&
            String(e.targetHandle) !== 'undefined' &&
            String(e.targetHandle) !== ''
            ? String(e.targetHandle)
            : undefined,
      })),
    );

    // --- 4. 決定 entry/exit 陣列（統一一次就好，不要內外層重覆宣告） ---
    let entryArr = [];
    let exitArr = [];

    try {
      // 4-1. 優先用 remodelJson.entryNodeIds / exitNodeIds
      if (Array.isArray(remodelJson.entryNodeIds) && remodelJson.entryNodeIds.length) {
        entryArr = remodelJson.entryNodeIds.map(String);
      }
      if (Array.isArray(remodelJson.exitNodeIds) && remodelJson.exitNodeIds.length) {
        exitArr = remodelJson.exitNodeIds.map(String);
      }

      // 4-2. 如果沒給，就 fallback 用 start/end node
      if (entryArr.length === 0 && startNodes.length > 0) {
        entryArr = [String(startNodes[0].id)];
      }
      if (exitArr.length === 0 && endNodes.length > 0) {
        exitArr = [String(endNodes[0].id)];
      }

      console.log('Final entry/exit arrays:', {
        entryArr,
        exitArr,
        rawEntryNodeIds: remodelJson.entryNodeIds,
        rawExitNodeIds: remodelJson.exitNodeIds,
      });
    } catch (err) {
      console.warn('Failed to detect entry/exit from remodelJson:', err);
    }

    // --- 5. 重接 in/out edges ---
    try {
      const incomingIds = related?.connectedNodesIDs?.incoming || [];
      const outgoingIds = related?.connectedNodesIDs?.outgoing || [];

      console.log('Rewiring info:', {
        incomingIds,
        outgoingIds,
        centerNodeId: String(centerNodeId),
        entryArr,
        exitArr,
      });

      // 5-1. 處理「指向 centerNodeId」的 incoming edges
      try {
        const incomingEdges = baseEdges.filter(
          e =>
            incomingIds.includes(String(e.source)) &&
            String(e.target) === String(centerNodeId),
        );

        if (entryArr.length > 1 && incomingEdges.length) {
          // 多個 entry: 刪舊邊，for 每個 entry clone 一份
          baseEdges = baseEdges.filter(
            e =>
              !(
                incomingIds.includes(String(e.source)) &&
                String(e.target) === String(centerNodeId)
              ),
          );

          const clones = [];
          incomingEdges.forEach((origEdge, ei) => {
            entryArr.forEach((mappedEntry, ei2) => {
              const newId = `${String(origEdge.id)}__entry_clone_${ei}_${ei2}_${Date.now()}`;
              clones.push({
                ...origEdge,
                id: newId,
                target: String(mappedEntry),
              });
            });
          });

          console.log('Cloning incoming edges for multiple entry nodes:', clones);
          baseEdges = baseEdges.concat(clones);
        } else if (entryArr.length === 1 && incomingEdges.length) {
          // 單一 entry: 直接把 target 改成 entryArr[0]
          baseEdges = baseEdges.map(e => {
            if (
              incomingIds.includes(String(e.source)) &&
              String(e.target) === String(centerNodeId)
            ) {
              return { ...e, target: entryArr[0] };
            }
            return e;
          });
        }
      } catch (err) {
        console.warn('Failed to clone/rewire incoming edges:', err);
      }

      // 5-2. 處理「由 centerNodeId 出」的 outgoing edges
      try {
        const outgoingEdges = baseEdges.filter(
          e =>
            String(e.source) === String(centerNodeId) &&
            outgoingIds.includes(String(e.target)),
        );

        if (exitArr.length > 1 && outgoingEdges.length) {
          // 多個 exit: 刪舊邊，for 每個 exit clone 一份
          baseEdges = baseEdges.filter(
            e =>
              !(
                String(e.source) === String(centerNodeId) &&
                outgoingIds.includes(String(e.target))
              ),
          );

          const clones = [];
          outgoingEdges.forEach((origEdge, oi) => {
            exitArr.forEach((mappedExit, oi2) => {
              const newId = `${String(origEdge.id)}__exit_clone_${oi}_${oi2}_${Date.now()}`;
              clones.push({
                ...origEdge,
                id: newId,
                source: String(mappedExit),
              });
            });
          });

          console.log('Cloning outgoing edges for multiple exit nodes:', clones);
          baseEdges = baseEdges.concat(clones);
        } else if (exitArr.length === 1 && outgoingEdges.length) {
          // 單一 exit: 直接把 source 改成 exitArr[0]
          baseEdges = baseEdges.map(e => {
            if (
              String(e.source) === String(centerNodeId) &&
              outgoingIds.includes(String(e.target))
            ) {
              return { ...e, source: exitArr[0] };
            }
            return e;
          });
        }
      } catch (err) {
        console.warn('Failed to clone/rewire outgoing edges:', err);
      }
    } catch (err) {
      console.warn('Failed to hard-wire incoming/outgoing edges:', err);
    }

    // --- 6. 刪掉原本 center node ---
    baseNodes = baseNodes.filter(n => String(n.id) !== String(centerNodeId));

    // --- 7. 更新 React Flow 狀態 ---
    setRfNodes(baseNodes);
    setRfEdges(baseEdges);

    console.log('applyRemodelResponse result:', {
      nodes: baseNodes,
      edges: baseEdges,
    });

    // --- 8. Auto layout ---
    try {
      handleAutoLayout(baseNodes, baseEdges);
    } catch (err) {
      console.error('Auto-layout failed after remodel:', err);
      setTimeout(() => fitViewportToNodes(), 100);
    }
  }; // v3




  // Local state for UI/UX
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTags, setNewTags] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [manualSelectedId, setManualSelectedId] = useState('');

  const [tableFieldKey, setTableFieldKey] = useState('');
  const [selectedSignalVar, setSelectedSignalVar] = useState(null);
  const [selectedSignalDetail, setSelectedSignalDetail] = useState(null);

  // Track active tab
  const [activeTab, setActiveTab] = useState('variableTable'); // 'variableTable', 'ruleChecker', 'variablePrompt', 'logs', 'manualEdit'

  // Track which rule is being edited
  const [selectedRuleIndex, setSelectedRuleIndex] = useState(0);

  // Calculate projectId based on selected rule (memoized to avoid unnecessary recalculations)
  const projectIdForRun = useMemo(() => {
    const currentFn = (functionsList && typeof selectedRuleIndex !== 'undefined' && functionsList[selectedRuleIndex]) 
      ? functionsList[selectedRuleIndex] 
      : null;
    
    return currentFn?.id || currentFn?.ruleId || 
      (typeof selectedRuleIndex !== 'undefined' ? `rule_${selectedRuleIndex}` : null);
  }, [selectedRuleIndex, functionsList]);

  // When projectId changes, set it in useRunDemo and query backend status
  // Client acts as OBSERVER: retrieves current project progress when entering workflow
  // Server runs projects independently, client just watches and receives updates
  useEffect(() => {
    if (!projectIdForRun) return;

    console.log(`📌 [VariableManager] Selected project: ${projectIdForRun} (observer mode)`);
    
    // Set projectId in useRunDemo to begin watching this project
    if (typeof setProjectId === 'function') {
      setProjectId(projectIdForRun);
    }

    // Also query backend for existing run status
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    (async () => {
      try {
        const res = await fetch(`${backendUrl}/api/run/status?projectId=${encodeURIComponent(projectIdForRun)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.runId) return;

        // Join run room via socket
        if (socketRef && socketRef.current) {
          socketRef.current.emit('run.subscribe', { runId: data.runId });
        }
        
        // Hydrate storeVars immediately if present
        if (data.storeVars && typeof setStoreVars === 'function') {
          setStoreVars(data.storeVars);
        }

        // Hydrate executing nodes/edges so we don't lose them on page refresh
        if ((data.status === 'running' || data.status === 'starting') && data.nodes && data.nodes.length > 0) {
          if (typeof setRfNodes === 'function') setRfNodes(data.nodes);
          if (data.edges && typeof setRfEdges === 'function') setRfEdges(data.edges);
        }
      } catch (e) { /* ignore */ }
    })();
  }, [projectIdForRun, setProjectId]);

  const {
    taskFunctionText,
    setTaskFunctionText,
    pendingActions,
    pendingTaskFunction,
    execProgress,
    execLog,
    filteredVariables,
    handleAiSubmit,
    handlePromptToWorkflow,
    handleGenerateWorkflow,
    generateFunctionFromFlow,
    createFnPromptFromFunction,
    confirmPreview,
    cancelPreview,
  } = useProjectsWorkflow({
    db,
    variables,
    listStructure,
    runFilter,
    ruleExpressions,
    ruleRelatedFields,
    ruleNames,
    rulePrompts,
    ruleDetectPrompts,
    ruleSystemPrompts,
    functionsList,
    selectedRuleIndex,
    aiPrompt,
    setAiPrompt,
    aiResponse,
    setAiResponse,
    setAiWarning,
    setAiLoading,
    setWorkflowLoading,
    setWorkflowError,
    setWorkflowData,
    workflowData,
    syncVariablesFromDatalist,
    appendLog,
    tabSwitchLockRef,
    setActiveTab,
    rfNodes,
    rfEdges,
    getDocs,
    collection
  });

  // Load workflow data into React Flow
  useEffect(() => {
    if (workflowData) {
      try {
        // Merge API metadata into nodes where possible so api nodes render with info
        const merged = JSON.parse(JSON.stringify(workflowData));
        if (Array.isArray(merged.nodes) && Array.isArray(apis) && apis.length > 0) {
          for (const n of merged.nodes) {
            try {
              if (String(n.type || '').toLowerCase() === 'api') {
                const rawLabel = String(n.label || n.data?.label || n.labelText || '').trim();
                const normalized = rawLabel.replace(/^api[:\s-]*/i, '').trim().toLowerCase();
                if (normalized) {
                  const found = apis.find((a) => {
                    if (!a) return false;
                    const name = String(a.name || a.label || a.displayName || '').trim().toLowerCase();
                    if (name && name === normalized) return true;
                    if (name && name.includes(normalized)) return true;
                    // tags can be string or array
                    const tags = Array.isArray(a.tags) ? a.tags : (a.tags ? String(a.tags).split(',') : []);
                    if (tags && tags.map) {
                      if (tags.map(t => String(t).trim().toLowerCase()).includes(normalized)) return true;
                    }
                    // also try matching by id
                    if (String(a.id || '').toLowerCase() === normalized) return true;
                    return false;
                  });
                  if (found) {
                    n.metadata = n.metadata || {};
                    // attach a small subset of API metadata to node.metadata
                    n.metadata.apiId = found.id || found._id || null;
                    n.metadata.apiName = found.name || found.label || null;
                    n.metadata.apiUrl = found.url || found.apiUrl || null;
                    n.metadata.image = found.metadata?.image || found.image || found.icon || found.imageName || found.new_name || found.newName || found.filename || found.fileName || found.file || null;
                    n.metadata.function = found.function || found.fnString || found.functionBody || null;
                    n.metadata.cssStyle = found.metadata?.cssStyle || found.cssStyle || found.style || null;
                    n.metadata.size = found.metadata?.size || found.size || n.metadata.size || '1:1';
                    n.metadata.tags = Array.isArray(found.tags) ? found.tags : (found.tags ? String(found.tags).split(',').map(t => t.trim()) : []);
                  }
                }
              }
            } catch (e) { /* ignore per-node merge errors */ }
          }
        }
        // Avoid repeatedly re-applying the same merged workflow (can cause update loops)
        try {
          const mergedJson = JSON.stringify(merged);
          if (!lastAppliedMergedRef.current || lastAppliedMergedRef.current !== mergedJson) {
            loadWorkflowIntoFlow(merged);
            lastAppliedMergedRef.current = mergedJson;
          } else {
            console.log('Skipping loadWorkflowIntoFlow — merged workflow unchanged');
          }
        } catch (err) {
          // fallback to safe call
          loadWorkflowIntoFlow(merged);
        }
      } catch (e) {
        const wfJson = JSON.stringify(workflowData || {});
        if (!lastAppliedMergedRef.current || lastAppliedMergedRef.current !== wfJson) {
          loadWorkflowIntoFlow(workflowData);
          lastAppliedMergedRef.current = wfJson;
        } else {
          console.log('Skipping loadWorkflowIntoFlow — workflowData unchanged');
        }
      }
    }
  }, [workflowData, loadWorkflowIntoFlow, apis]);

  // Attach minimap click + drag handlers to control main viewport (click-to-center and drag-to-pan)
  useEffect(() => {
    if (!rfInstance) return undefined;
    // try to find the minimap element inside the React Flow container
    const minimapEl = document.querySelector('[class*="minimap"]');
    if (!minimapEl) return undefined;

    let dragging = false;

    const getBounds = () => {
      // compute current workflow bounds from rfNodes
      const nodes = Array.isArray(rfNodes) ? rfNodes : [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach((n) => {
        const x = Number(n?.position?.x ?? 0);
        const y = Number(n?.position?.y ?? 0);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      });
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        return { minX: 0, minY: 0, maxX: 600, maxY: 400 };
      }
      return { minX, minY, maxX, maxY };
    };

    const onPointerMove = (ev) => {
      if (!dragging) return;
      try {
        const rect = minimapEl.getBoundingClientRect();
        const mx = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
        const my = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
        const bounds = getBounds();
        const rx = rect.width > 0 ? mx / rect.width : 0;
        const ry = rect.height > 0 ? my / rect.height : 0;
        const worldX = bounds.minX + rx * (bounds.maxX - bounds.minX);
        const worldY = bounds.minY + ry * (bounds.maxY - bounds.minY);
        // prefer using react-flow instance center API when available
        const vp = rfInstance && rfInstance.getViewport ? rfInstance.getViewport() : { zoom: 1 };
        const zoom = (vp && vp.zoom) ? vp.zoom : 1;
        // find the react-flow container to compute accurate center offsets
        const flowContainer = minimapEl.closest('.react-flow') || document.querySelector('.reactflow-wrapper') || document.querySelector('.react-flow');
        const containerRect = flowContainer ? flowContainer.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
        if (rfInstance && typeof rfInstance.setCenter === 'function') {
          rfInstance.setCenter(worldX, worldY, { zoom });
        } else if (rfInstance && typeof rfInstance.setViewport === 'function') {
          const targetX = -worldX + (containerRect.width / 2) / zoom;
          const targetY = -worldY + (containerRect.height / 2) / zoom;
          try { rfInstance.setViewport({ x: targetX, y: targetY, zoom }); } catch (e) { /* ignore */ }
        }
      } catch (err) {
        // swallow errors to avoid noisy logs
      }
    };

    const onPointerUp = () => { dragging = false; window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); };

    const onPointerDown = (ev) => {
      ev.preventDefault();
      dragging = true;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      // also run one move to center immediately
      onPointerMove(ev);
    };

    const onClick = (ev) => {
      try {
        const rect = minimapEl.getBoundingClientRect();
        const mx = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
        const my = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
        const bounds = getBounds();
        const rx = rect.width > 0 ? mx / rect.width : 0;
        const ry = rect.height > 0 ? my / rect.height : 0;
        const worldX = bounds.minX + rx * (bounds.maxX - bounds.minX);
        const worldY = bounds.minY + ry * (bounds.maxY - bounds.minY);
        const vp = rfInstance && rfInstance.getViewport ? rfInstance.getViewport() : { zoom: 1 };
        const zoom = (vp && vp.zoom) ? vp.zoom : 1;
        const flowContainer = minimapEl.closest('.react-flow') || document.querySelector('.reactflow-wrapper') || document.querySelector('.react-flow');
        const containerRect = flowContainer ? flowContainer.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
        if (rfInstance && typeof rfInstance.setCenter === 'function') {
          rfInstance.setCenter(worldX, worldY, { zoom });
        } else if (rfInstance && typeof rfInstance.setViewport === 'function') {
          const targetX = -worldX + (containerRect.width / 2) / zoom;
          const targetY = -worldY + (containerRect.height / 2) / zoom;
          try { rfInstance.setViewport({ x: targetX, y: targetY, zoom }); } catch (e) { /* ignore */ }
        }
      } catch (err) {
        // ignore
      }
    };

    minimapEl.addEventListener('pointerdown', onPointerDown);
    // listen for click separately (pointerdown already centers, but click ensures single-click)
    minimapEl.addEventListener('click', onClick);

    return () => {
      minimapEl.removeEventListener('pointerdown', onPointerDown);
      minimapEl.removeEventListener('click', onClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [rfInstance, rfNodes]);

  useEffect(() => {
    loadVariables();
  }, []);

  // floating API result content
  const [apiResultsContent, setApiResultsContent] = useState(null);
  useEffect(() => {
    try { window.setApiResultsContent = setApiResultsContent; } catch (e) { }
    return () => { try { delete window.setApiResultsContent; } catch (e) { } };
  }, [setApiResultsContent]);

  // Local state to open OutputView modal from Project page
  const [isOutputOpenLocal, setIsOutputOpenLocal] = useState(false);

  // SysPrompt modal state
  const [isSysPromptModalOpen, setIsSysPromptModalOpen] = useState(false);
  const [userPromptInput, setUserPromptInput] = useState('');
  // store the latest generated prompts for display or copying
  const [lastUserPrompt, setLastUserPrompt] = useState('');
  const [lastSystemPrompt, setLastSystemPrompt] = useState('');

  useEffect(() => {
    // lazy load API list when component mounts
    loadApis();
  }, []);

  useEffect(() => {
    // Load a small set of recent logs initially (lazy by default)
    loadLogs(false);
  }, []);

  // Load logs and APIs on mount
  useEffect(() => {
    loadLogs(false);
    loadApis();
  }, []);

  // Load rules when category changes
  useEffect(() => {
    if (!db) return;
    loadRulesByCategory(selectedRuleCategoryId);
  }, [selectedRuleCategoryId, db]);

  const loadRulesByCategory = async (categoryId) => {
    try {
      const result = await loadRulesFromFirebaseService({ db, categoryId });
      if (result.success) {
        setRuleSource(result.ruleSource || []);
        setRulePrompts(result.rulePrompts || []);
        setRuleNames(result.ruleNames || []);
        setRuleTypes(result.ruleTypes || []);
        setRuleSystemPrompts(result.ruleSystemPrompts || []);
        setRuleDetectPrompts(result.ruleDetectPrompts || []);
        setRuleRelatedFields(result.ruleRelatedFields || []);
        setRuleCategoryIds(result.ruleCategoryIds || []);
        setFunctionsList(result.functionsList || []);

        console.log(`Loaded ${result.count} rule(s) from Firebase for category:`, categoryId);
      }
    } catch (err) {
      console.error('Failed to load rules by category:', err);
    }
  };

  const openSignalDetail = (varId, signalNameInput) => {
    const variable = variables.find((v) => v.id === varId);
    if (!variable || !variable.signal || !variable.signal[signalNameInput]) return;
    setSelectedSignalVar({ varId, signalName: signalNameInput });
    setSelectedSignalDetail({ name: signalNameInput, data: variable.signal[signalNameInput] });
  };

  const closeSignalDetail = () => {
    setSelectedSignalVar(null);
    setSelectedSignalDetail(null);
  };

  const handleLoadManual = () => {
    const target = variables.find((v) => v.id === manualSelectedId);
    if (!target) return;
    setNewName(target.name || '');
    setNewDescription(target.description || '');
    setNewTags(target.tag ? target.tag.join(', ') : '');
    setEditingId(target.id);
  };

  const handleEdit = (variable) => {
    if (!variable) return;
    setNewName(variable.name || '');
    setNewDescription(variable.description || '');
    setNewTags(variable.tag ? variable.tag.join(', ') : '');
    setEditingId(variable.id || null);
    setManualSelectedId(variable.id || '');
    setActiveTab('manualEdit');
  };

  const handleCancel = () => {
    setNewName('');
    setNewDescription('');
    setNewTags('');
    setEditingId(null);
    setManualSelectedId('');

  };

  const handleAddOrUpdate = async () => {
    const trimmedName = (newName || '').trim();
    if (!trimmedName) return;
    const tags = (newTags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const parsedDescription = parseMaybeJson(newDescription);
    if (editingId) {
      await updateVariable(editingId, {
        name: trimmedName,
        description: parsedDescription,
        tag: tags
      });
    } else {
      await addVariable({
        name: trimmedName,
        description: parsedDescription,
        tag: tags
      });
    }
    handleCancel();
  };


  const saveSynthFunctionToRule = async () => {
    if (selectedRuleIndex === undefined || selectedRuleIndex === null) return;
    const idx = Number(selectedRuleIndex);
    const nextRuleSource = [...(ruleSource || [])];
    const nextRuleSystemPrompts = [...(ruleSystemPrompts || [])];

    while (nextRuleSource.length <= idx) nextRuleSource.push('');
    while (nextRuleSystemPrompts.length <= idx) nextRuleSystemPrompts.push('');

    // Variable Prompt -> System Prompt
    nextRuleSystemPrompts[idx] = aiPrompt || '';
    // Planned Task Function -> JavaScript Expression
    nextRuleSource[idx] = taskFunctionText || '';


    setRuleSystemPrompts(nextRuleSystemPrompts);
    setRuleSource(nextRuleSource);
    console.log("now my select rule idx=", idx, "ruleSource=", nextRuleSource[idx], "ruleSystemPrompts=", nextRuleSystemPrompts[idx]);
    console.log('Saving rule at index', idx, functionsList && functionsList[idx] ? (functionsList[idx].id || functionsList[idx].ruleId) : undefined, functionsList && functionsList[idx]);
    // Update functionsList to keep in sync (include visual workflow object)
    const rebuilt = buildFunctionsListFromLegacy();
    const merged = rebuilt.map((item, i) => ({
      ...(functionsList && functionsList[i] ? functionsList[i] : {}),
      ...item
    }));
    if (merged[idx]) {
      const currentWorkflow = (() => {
        if (workflowData && workflowData.nodes) return workflowData;
        if (rfNodes && rfNodes.length) {
          // Robust detection for injected parent "entry" nodes.
          const isInjectedEntryNode = (n) => {
            if (!n) return false;
            // explicit metadata marker takes precedence
            if (n.metadata && n.metadata.sourceRuleId) return true;
            const idStr = String(n.id || '');
            // id generated for entries uses `entry_...` prefix
            if (idStr.indexOf('entry_') === 0) return true;
            // also check visible label/text starting with "entry" (case-insensitive)
            const label = String((n.data && (n.data.labelText || n.data.label)) || n.label || '').trim();
            if (label && label.toLowerCase().indexOf('entry') === 0) return true;
            return false;
          };

          console.log("HH rfNodes", rfNodes);

          const nodesFiltered = (rfNodes || []).filter((n) => !isInjectedEntryNode(n));
          console.log("HH nodesFiltered", nodesFiltered);
          const excludedIds = new Set((rfNodes || []).filter((n) => isInjectedEntryNode(n)).map((n) => String(n.id)));
          const edgesFiltered = (rfEdges || []).filter((e) => {
            const s = String(e.source || e.from || '');
            const t = String(e.target || e.to || '');
            return !excludedIds.has(s) && !excludedIds.has(t);
          });

          return {
            nodes: nodesFiltered.map((n) => ({
              id: String(n.id),
              type: n.type || 'action',
              label: n.data?.labelText || n.data?.label || String(n.id),
              description: n.data?.description || '',
              position: n.position || { x: 0, y: 0 },
              metadata: n.metadata || n.data?.metadata || {},
              actions: Array.isArray(n.data?.actions) ? n.data.actions : []
            })),
            edges: edgesFiltered.map((e, i) => ({
              id: String(e.id || `edge_${i}`),
              source: String(e.source || e.from || ''),
              target: String(e.target || e.to || ''),
              type: e.type || 'next',
              label: e.label || ''
            }))
          };
        }
        return null;
      })();
      merged[idx].workflowObject = currentWorkflow;
    }
    setFunctionsList(merged);

    // Persist only the current rule to Firestore (do not save all rules)
    try {
      const ruleToSave = merged[idx];
      const ruleIdToUse = ruleToSave && (ruleToSave.id || ruleToSave.ruleId);
      if (!ruleIdToUse) {
        // Do not persist rules that don't have an id yet (they are local-only)
        console.warn('saveSynthFunctionToRule: rule has no id, skipping remote save', ruleToSave);
        setAiWarning('Saved locally (no rule id to persist).');
        setTimeout(() => setAiWarning(''), 2000);
      } else {
        // Pass an override with empty ruleSource so the service uses the provided functionsList only

        const payLoad = {
          categoryId: functionsList[idx].categoryId,
          expr: functionsList[idx].expr,
          id: functionsList[idx].id,
          name: functionsList[idx].name,
          relatedFields: functionsList[idx].relatedFields,
          systemPrompt: functionsList[idx].systemPrompt,
          type: functionsList[idx].type,
          workflowObject: functionsList[idx].workflowObject
        }

        console.log("saveRuleToFirebase", functionsList[idx], payLoad, functionsList)
        await saveRuleToFirebase(db, payLoad);

        //await saveRulesToFirebase({ override: { functionsList: [ruleToSave], ruleSource: [] } });
        setAiWarning('Saved to Rule Checker.');
        setTimeout(() => setAiWarning(''), 2000);
      }
    } catch (e) {
      // fallback to saving everything if something goes wrong
      console.error('saveSynthFunctionToRule save failed, falling back to full save', e);
      /*
      await saveRulesToFirebase({
        ruleSource: nextRuleSource,
        ruleSystemPrompts: nextRuleSystemPrompts,
        functionsList: merged
      });
      */
      setAiWarning('Saved (fallback).');
      setTimeout(() => setAiWarning(''), 2000);
    }
  };

  const loadSelectedRuleIntoPrompt = (indexOverride = null) => {
    const resolvedIndex = (indexOverride !== null && indexOverride !== undefined)
      ? Number(indexOverride)
      : (selectedRuleIndex === undefined || selectedRuleIndex === null ? null : Number(selectedRuleIndex));
    if (resolvedIndex === null || Number.isNaN(resolvedIndex)) return;
    const idx = resolvedIndex;

    const nextSystemPrompt = (ruleSystemPrompts && ruleSystemPrompts[idx]) ? ruleSystemPrompts[idx] : '';
    const nextExpr = (ruleSource && ruleSource[idx]) ? ruleSource[idx] : '';
    setAiPrompt(nextSystemPrompt);
    setTaskFunctionText(nextExpr);

    const wfRaw = (functionsList && functionsList[idx] && functionsList[idx].workflowObject) ? functionsList[idx].workflowObject : null;
    let parsed = null;
    try {
      if (!wfRaw) parsed = null;
      else if (typeof wfRaw === 'string') parsed = JSON.parse(wfRaw);
      else if (typeof wfRaw === 'object') parsed = wfRaw;
    } catch (err) {
      console.warn('Failed to parse workflowObject for rule idx=', idx, err);
      parsed = null;
    }

    if (!parsed) {
      console.log('No workflowObject for selected rule idx=', idx);
      setWorkflowData(null);
      setRfNodes([]);
      setRfEdges([]);
      return;
    }

    // determine start node
    const incoming = {};
    (parsed.edges || []).forEach((e) => {
      if (!e) return;
      const t = String(e.to || e.target || '');
      if (!t) return;
      incoming[t] = (incoming[t] || 0) + 1;
    });
    const startNodes = (parsed.nodes || []).filter((n) => !incoming[String(n.id)]);
    const targetStartId = startNodes && startNodes.length ? String(startNodes[0].id) : (parsed.nodes && parsed.nodes[0] ? String(parsed.nodes[0].id) : null);

    // find parent rules that reference this rule
    const currentRuleId = (functionsList && functionsList[idx] && (functionsList[idx].id || functionsList[idx].ruleId)) ? String(functionsList[idx].id || functionsList[idx].ruleId) : '';
    if (!currentRuleId) {
      setWorkflowData(parsed);
      return;
    }

    const existingParentIds = new Set((parsed.nodes || []).map((n) => String(n?.metadata?.sourceRuleId || n?.ruleId || '').trim()).filter(Boolean));
    const parentNodes = [];
    const parentEdges = [];
    const addedParentIds = new Set();
    let count = 0;

    (functionsList || []).forEach((fn) => {
      try {
        if (!fn || !fn.id || String(fn.id) === currentRuleId) return;
        let wf = fn.workflowObject;
        if (!wf) return;
        if (typeof wf === 'string') {
          try { wf = JSON.parse(wf); } catch (e) { wf = null; }
        }
        if (!wf || !Array.isArray(wf.nodes)) return;

        // scan nodes' actions for references
        let referencesTarget = false;
        for (const n of wf.nodes) {
          const actions = Array.isArray(n.actions) ? n.actions : (n.data && Array.isArray(n.data.actions) ? n.data.actions : []);
          for (const a of actions) {
            if (!a) continue;
            const linkedRef = (typeof a === 'string') ? '' : (a.linkedRuleId || a.ruleId || '');
            const linkedName = (typeof a === 'string') ? String(a) : String(a.linkedRuleName || a.linkedFunctionName || a.name || a.action || '');
            const currentRuleName = (functionsList && functionsList[idx] && (functionsList[idx].name || functionsList[idx].prompt)) ? String(functionsList[idx].name || functionsList[idx].prompt) : '';
            if ((linkedRef && String(linkedRef) === currentRuleId) || (linkedName && currentRuleName && String(linkedName).toLowerCase() === String(currentRuleName).toLowerCase())) {
              referencesTarget = true;
              break;
            }
          }
          if (referencesTarget) break;
        }
        if (!referencesTarget) return;

        const parentIdStr = String(fn.id || '').trim();
        if (!parentIdStr || existingParentIds.has(parentIdStr) || addedParentIds.has(parentIdStr)) return;

        const entryId = `entry_${fn.id}_${Date.now()}_${count++}`;
        const label = fn.name || fn.prompt || fn.id;
        const defaultAction = { action: 'parent', notes: '', linkedRuleId: String(fn.id), linkedRuleName: label };
        parentNodes.push({
          id: entryId,
          type: 'workflowNode',
          label: `Entry:(${count}): ${label}\n${fn.id}`,
          ruleName: label,
          ruleId: String(fn.id),
          description: `Entry from ${label}`,
          position: { x: 300 * (count - 1), y: -150 },
          metadata: { sourceRuleId: fn.id, entryForRuleId: currentRuleId },
          actions: [defaultAction],
          data: { actions: [defaultAction], labelText: `Entry:(${count}): ${label}\n${fn.id}`, metadata: { sourceRuleId: fn.id, entryForRuleId: currentRuleId } }
        });
        addedParentIds.add(parentIdStr);
        if (targetStartId) parentEdges.push({ id: `edge_${entryId}_${targetStartId}`, source: entryId, target: targetStartId, label: `from ${label}` });
      } catch (err) {
        console.warn('Failed scanning parent rule', fn && fn.id, err);
      }
    });

    if (parentNodes.length) {
      const mergedNodes = [...parentNodes, ...(parsed.nodes || [])];
      const mergedEdges = [...(parsed.edges || []), ...parentEdges];
      setWorkflowData({ ...parsed, nodes: mergedNodes, edges: mergedEdges });
    } else {
      setWorkflowData(parsed);
    }
  };

  const addRfApiNode = useCallback((api) => {
    if (!api) return;
    const id = `api_${Date.now()}`;
    const label = api.name || api.label || `API`;
    const meta = api.metadata || {};
    const image = meta.image || api.image || api.icon || null;
    const css = meta.cssStyle || api.cssStyle || null;
    const size = meta.size || '2:1'; // Component size ratio (e.g., "3:1", "2:2")
    
    // Calculate width and height from size ratio
    const [widthRatio, heightRatio] = size.split(':').map(n => parseInt(n) || 1);
    const nodeWidth = widthRatio * 64;
    const nodeHeight = heightRatio * 64;
    
    console.log(`[addRfApiNode] Creating node with size: ${size} (${nodeWidth}x${nodeHeight}px)`, api);
    
    const metadata = {
      apiId: api.id,
      apiName: label,
      apiUrl: api.url || api.apiUrl || null,
      image: image,
      function: api.function || api.fnString || null,
      cssStyle: css,
      size: size,
      tags: Array.isArray(api.tags) ? api.tags : (api.tags ? String(api.tags).split(',').map(t => t.trim()) : [])
    };
    
    const newNode = {
      id,
      position: { x: 200 + (rfNodes.length * 20), y: 200 },
      type: 'api',
      metadata, // Store at root level for export consistency
      data: {
        labelText: `${label}`,
        label: `${label}`,
        description: 'external api',
        actions: [],
        width: nodeWidth,
        height: nodeHeight,
        metadata, // Also store in data for component access
        // Snapshot the component's function into the node so it won't auto-update
        fnString: (metadata.function || metadata.fnString) || null
      },
      style: { borderRadius: 10, padding: 8, width: nodeWidth, minHeight: nodeHeight }
    };
    setRfNodes((n) => [...n, newNode]);
    setSelectedIds([id]);
  }, [rfNodes.length, setRfNodes]);

  // Toggle lock state on a node (mark metadata.locked and data.locked)
  const toggleNodeLock = useCallback((nodeId) => {
    setRfNodes((nodes) => (nodes || []).map((n) => {
      if (String(n.id) !== String(nodeId)) return n;
      const locked = !!(n.metadata && n.metadata.locked) || !!n.data?.locked;
      return {
        ...n,
        metadata: { ...(n.metadata || {}), locked: !locked },
        data: { ...(n.data || {}), locked: !locked }
      };
    }));
  }, [setRfNodes]);

  useEffect(() => {
    try {
      window.vm_toggleNodeLock = toggleNodeLock;
    } catch (e) { /* ignore */ }
    return () => {
      try { delete window.vm_toggleNodeLock; } catch (e) { }
    };
  }, [toggleNodeLock]);

  // Auto-load workflow when selectedRuleIndex changes
  useEffect(() => {
    if (selectedRuleIndex !== null && selectedRuleIndex !== undefined) {
      try {
        loadSelectedRuleIntoPrompt(selectedRuleIndex);
      } catch (e) {
        console.warn('Failed to load selected rule into prompt:', e);
      }
    }
  }, [selectedRuleIndex, functionsList]);

  const deleteSelected = useCallback(() => {
    if (!selectedIds || !selectedIds.length) return;
    const sel = (selectedIds || []).map((s) => String(s));
    setRfNodes((nodes) => (nodes || []).filter((n) => !sel.includes(String(n.id))));
    setRfEdges((edges) => (edges || []).filter((e) => !sel.includes(String(e.id)) && !sel.includes(String(e.source)) && !sel.includes(String(e.target))));
    setSelectedIds([]);
  }, [selectedIds, setRfNodes, setRfEdges, setSelectedIds]);

  // Node edit modal removed — edits are handled via Node Details now

  // Rule sources and prompts state (editable)
  const openActionRule = useCallback((action) => {
    try {

      const linkedId = action && (action.linkedRuleId || action.ruleId) ? String(action.linkedRuleId || action.ruleId) : null;
      const linkedName = action && (action.linkedRuleName || action.linkedFunctionName || action.name || action.action) ? String(action.linkedRuleName || action.linkedFunctionName || action.name || action.action) : null;
      let found = -1;
      console.log('openActionRule called for action:', action, linkedId, linkedName);

      if (Array.isArray(functionsList) && functionsList.length) {
        // Try matching by several possible identifier fields on functionsList entries
        if (linkedId) {
          found = functionsList.findIndex((f) => {
            const fid = String(f && (f.id || f.ruleId || '') || '');
            return fid && fid === String(linkedId);
          });
        } else {
          console.log('openActionRule: No linkedId found on action, skipping id match');
        }
        // If not found by id, try matching by name/title fields
        if (found === -1 && linkedName) {
          found = functionsList.findIndex((f) => {
            const fname = String(f && (f.name || f.title || f.prompt || '') || '');
            return fname && fname.toLowerCase() === String(linkedName).toLowerCase();
          });
        } else {
          console.log('openActionRule: No match found in functionsList for linkedId or linkedName', { linkedId, linkedName }, 'functionsList:', functionsList);
        }
      } else {
        console.log('openActionRule: functionsList is empty or not an array', functionsList);
      }
      // Fallback: try matching against ruleNames array if still not found
      console.log('openActionRule: Attempting fallback match against ruleNames for linkedName:', linkedName, ruleNames);
      if (found === -1 && linkedName && Array.isArray(ruleNames) && ruleNames.length) {
        found = ruleNames.findIndex((n) => (n || '').toLowerCase() === String(linkedName).toLowerCase());
      } else {
        console.log('openActionRule: No match found in ruleNames for linkedName', linkedName, 'ruleNames:', ruleNames);
      }
      if (found >= 0) {
        // Force navigation to Rule Checker and ensure no other handler overrides it
        console.log('openActionRule -> navigating to ruleChecker idx=', found);
        setSelectedNodeDetails(null);
        setSelectedRuleIndex(found);
        // lock other tab-switchers briefly to avoid race conditions
        try { tabSwitchLockRef.current = true; } catch (e) { /* ignore */ };
        try { loadSelectedRuleIntoPrompt(found); } catch (e) { /* ignore */ }
        // release lock after short delay
        setTimeout(() => { try { tabSwitchLockRef.current = false; } catch (e) { } }, 600);
        // repeat shortly to guard against race conditions that set activeTab back
        setTimeout(() => {
          try {
            ;


            //reset viewport to top-left when opening a rule from an action, to ensure consistent starting point for users (especially if they navigated away from Rule Checker)
            fitViewportToNodes();
            updateZoomViewport(0.6);


            try { loadSelectedRuleIntoPrompt(found); } catch (e) { /* ignore */ }
          } catch (e) {
            /* ignore */
            console.warn('openActionRule: Failed to load selected rule into prompt on retry', e);
          }
        }, 60);
      } else {
        console.log('openActionRule: No linked rule found for action', action, 'linkedId:', linkedId, 'linkedName:', linkedName);
        setAiWarning('No linked rule found for this action.');
        setTimeout(() => setAiWarning(''), 2000);
      }
    } catch (err) {
      console.error('openActionRule error:', err);
      setAiWarning('Failed to open action rule.');
      setTimeout(() => setAiWarning(''), 2000);
    }
  }, [functionsList, ruleNames]);

  const updateRuleName = (index, value) => {
    const arr = [...ruleNames];
    arr[index] = value;
    setRuleNames(arr);
  };

  const fitViewportToNodes = () => {
    if (rfInstance && typeof rfInstance.fitView === 'function') {
      try { rfInstance.fitView({ padding: 0.12, includeHiddenNodes: true }); }
      catch (e) { /* ignore */ }
    }
  }

  const updateZoomViewport = (zoom) => {
    if (rfInstance && typeof rfInstance.setViewport === 'function') {
      try {
        const vp = rfInstance.getViewport();
        rfInstance.setViewport({ x: vp.x, y: vp.y, zoom });
      } catch (e) { /* ignore */ }
    }
  };


  // Functions datalist (new unified structure)
  const [newFunctionType, setNewFunctionType] = useState('Rule Checker');
  const [newFunctionName, setNewFunctionName] = useState('');
  const [newFunctionExpr, setNewFunctionExpr] = useState('');
  const [newFunctionSystemPrompt, setNewFunctionSystemPrompt] = useState('');
  const [editingFunctionIndex, setEditingFunctionIndex] = useState(null);

  const updateRuleSource = (index, value) => {
    const newRules = [...ruleSource];
    newRules[index] = value;
    setRuleSource(newRules);
  };

  const updateRulePrompt = (index, value) => {
    const newPrompts = [...rulePrompts];
    newPrompts[index] = value;
    setRulePrompts(newPrompts);
  };

  const addNewRule = () => {
    const nextCategoryId = (selectedRuleCategoryId && selectedRuleCategoryId !== 'all')
      ? selectedRuleCategoryId
      : resolveDefaultCategoryId(ruleCategories);
    setRuleSource([...ruleSource, '']);
    setRulePrompts([...rulePrompts, '']);
    setRuleTypes([...ruleTypes, 'Rule Checker']);
    setRuleSystemPrompts([...ruleSystemPrompts, '']);
    setRuleDetectPrompts([...ruleDetectPrompts, '']);
    setRuleRelatedFields([...ruleRelatedFields, '']);
    setRuleCategoryIds([...ruleCategoryIds, nextCategoryId || '']);
    setRuleNames([...ruleNames, '']);
  };

  // Create a new workflow (rule) with an optional name
  const addNewWorkflow = async (name) => {
    const nextCategoryId = (selectedRuleCategoryId && selectedRuleCategoryId !== 'all')
      ? selectedRuleCategoryId
      : resolveDefaultCategoryId(ruleCategories);

    // create a new rule id and local placeholders
    const newRuleId = createRuleId();
    setRuleSource([...ruleSource, '']);
    setRulePrompts([...rulePrompts, '']);
    setRuleTypes([...ruleTypes, 'Rule Checker']);
    setRuleSystemPrompts([...ruleSystemPrompts, '']);
    setRuleDetectPrompts([...ruleDetectPrompts, '']);
    setRuleRelatedFields([...ruleRelatedFields, '']);
    setRuleCategoryIds([...ruleCategoryIds, nextCategoryId || '']);
    setRuleNames([...ruleNames, name || 'New Workflow']);

    // keep functionsList in sync so the UI can reference the new rule
    try {
      const newFn = { id: newRuleId, ruleId: newRuleId, type: 'Rule Checker', name: name || 'New Workflow', expr: '', systemPrompt: '', workflowObject: '' };
      setFunctionsList((f) => Array.isArray(f) ? [...f, newFn] : [newFn]);

      // Persist the new rule to the server
      const payLoad = {
        id: newRuleId,
        name: name || 'New Workflow',
        categoryId: nextCategoryId || '',
        expr: '',
        type: 'Rule Checker',
        workflowObject: ''
      };
      await saveRuleToFirebase(db, payLoad);
      setAiWarning('New workflow saved');
      setTimeout(() => setAiWarning(''), 2000);
    } catch (err) {
      console.error('Failed to save new workflow:', err);
      setAiWarning('Failed to save new workflow');
      setTimeout(() => setAiWarning(''), 2000);
    }
  };

  // Action link state
  const [actionLinkSelections, setActionLinkSelections] = useState({});

  const createOwnRuleForAction = useCallback(async (action, nodeId, actionIdx) => {
    try {
      const actionName = typeof action === 'string' ? action : (action.action || action.name || 'Custom Action');
      let baseName = actionName || 'Custom Action';
      let newName = baseName;
      const newRuleId = createRuleId();
      const exists = (functionsList || []).some((f) => (f.name || '').toLowerCase() === newName.toLowerCase());
      if (exists) {
        newName = `${baseName} (custom ${Date.now()})`;
      }

      const nextRuleSource = [...(ruleSource || []), ''];
      const nextRulePrompts = [...(rulePrompts || []), action.notes || action.raw_instruction || actionName || ''];
      const nextRuleNames = [...(ruleNames || []), newName];
      const nextRuleTypes = [...(ruleTypes || []), 'Rule Checker'];
      const nextRuleSystemPrompts = [...(ruleSystemPrompts || []), ''];
      const nextRuleDetectPrompts = [...(ruleDetectPrompts || []), ''];
      const nextRuleRelatedFields = [...(ruleRelatedFields || []), ''];
      const nextRuleCategoryIds = [...(ruleCategoryIds || []), (selectedRuleCategoryId || '')];
      const nextRuleExpressions = [...(ruleExpressions || []), ''];

      setRuleSource(nextRuleSource);
      setRulePrompts(nextRulePrompts);
      setRuleNames(nextRuleNames);
      setRuleTypes(nextRuleTypes);
      setRuleSystemPrompts(nextRuleSystemPrompts);
      setRuleDetectPrompts(nextRuleDetectPrompts);
      setRuleRelatedFields(nextRuleRelatedFields);
      setRuleCategoryIds(nextRuleCategoryIds);
      setExpression(nextRuleExpressions);

      const newFn = { id: newRuleId, ruleId: newRuleId, type: 'Rule Checker', name: newName, expr: '', systemPrompt: '', workflowObject: '' };
      const nextFunctionsList = [...(functionsList || []), newFn];

      const newIndex = nextRuleSource.length - 1;

      const updatedNodes = (rfNodes || []).map((n) => {
        if (String(n.id) !== String(nodeId)) return n;
        const actionsArr = Array.isArray(n.data?.actions) ? n.data.actions.slice() : [];
        const a = actionsArr[actionIdx];
        if (a) {
          const updatedAction = (typeof a === 'string')
            ? { action: a, linkedFunctionName: newName, linkedRuleId: newRuleId }
            : { ...a, linkedFunctionName: newName, linkedRuleId: newRuleId };
          actionsArr[actionIdx] = updatedAction;
        }
        return { ...n, data: { ...(n.data || {}), actions: actionsArr } };
      });
      setRfNodes(updatedNodes);

      if (selectedNodeDetails && String(selectedNodeDetails.id) === String(nodeId)) {
        const actionsArr = Array.isArray(selectedNodeDetails.data?.actions) ? selectedNodeDetails.data.actions.slice() : [];
        const a = actionsArr[actionIdx];
        if (a) {
          actionsArr[actionIdx] = (typeof a === 'string')
            ? { action: a, linkedFunctionName: newName, linkedRuleId: newRuleId }
            : { ...a, linkedFunctionName: newName, linkedRuleId: newRuleId };
          setSelectedNodeDetails((s) => ({ ...s, data: { ...(s.data || {}), actions: actionsArr } }));
        }
      }

      const exportNodes = (updatedNodes || []).map((n) => ({
        id: String(n.id),
        type: n.type || 'action',
        label: (n.data && (n.data.labelText || n.data.label)) ? String(n.data.labelText || n.data.label) : String(n.id),
        description: (n.data && n.data.description) ? String(n.data.description) : '',
        position: n.position || { x: 0, y: 0 },
        metadata: n.metadata || n.data?.metadata || {},
        actions: Array.isArray(n.data?.actions) ? n.data.actions : []
      }));
      const exportEdges = (rfEdges || []).map((e) => ({ id: String(e.id || ''), source: String(e.source || e.from || ''), target: String(e.target || e.to || ''), label: e.label || '' }));
      const saveIdx = (selectedRuleIndex === undefined || selectedRuleIndex === null) ? 0 : Number(selectedRuleIndex);
      while (nextFunctionsList.length <= saveIdx) nextFunctionsList.push({ type: 'Rule Checker', name: `Rule ${saveIdx + 1}`, expr: '', systemPrompt: '', workflowObject: '' });
      nextFunctionsList[saveIdx] = { ...(nextFunctionsList[saveIdx] || {}), workflowObject: JSON.stringify({ nodes: exportNodes, edges: exportEdges }) };

      setFunctionsList(nextFunctionsList);

      // Persist only the new rule document
      // await saveRulesToFirebase({ override: { functionsList: [nextFunctionsList[newIndex]] } });

      // Do not navigate away ??remain on workflow view after creating and linking
    } catch (err) {
      console.error('createOwnRuleForAction error:', err);
      setAiWarning('Failed to create rule: ' + (err.message || 'unknown'));
      setTimeout(() => setAiWarning(''), 3000);
    }
  }, [functionsList, ruleSource, rulePrompts, ruleNames, ruleTypes, ruleSystemPrompts, ruleDetectPrompts, ruleRelatedFields, ruleCategoryIds, ruleExpressions, selectedRuleCategoryId, selectedNodeDetails, createRuleId, rfNodes, rfEdges, selectedRuleIndex]);


  function fnToWorkflow(fnString) {
    const trimBody = (code) =>
      code.replace(/^.*?\{/, "").replace(/\}[^}]*$/, "").trim();

    const normalizeLines = (body) => {
      // 先保護 return { next: "..." } 不被拆分
      let processed = body.replace(
        /return\s*\{\s*next\s*:\s*(["'`][^"'`]+["'`])\s*\}/g,
        (match) => match.replace(/\{/g, '⟨').replace(/\}/g, '⟩')
      );

      // 正常處理其他大括號
      processed = processed
        .replace(/\{/g, "\n{\n")
        .replace(/\}/g, "\n}\n");

      // 還原 return next
      processed = processed
        .replace(/⟨/g, '{')
        .replace(/⟩/g, '}');

      return processed
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("//"));
    };

    const logRegex = /^console\.log\((["'`])((?:(?!\1).)*)\1\)\s*;?$/;
    const assignRegex = /^(const|let)\s+(\w+)\s*=\s*([^;]+);?/;
    const ifRegex = /^if\s*\((.*?)\)\s*$/;
    const elseIfRegex = /^else\s+if\s*\((.*?)\)\s*$/;
    const elseRegex = /^else\s*$/;
    const returnNextRegex = /^return\s+\{\s*next\s*:\s*["'`]([^"'`]+)["'`]\s*\}\s*;?$/;
    const returnRegex = /^return\s+(.*);?$/;

    function readBlock(lines, index) {
      let depth = 0;
      const block = [];
      let i = index;

      if (lines[i] === "{") {
        depth = 1;
        i++;
      }

      while (i < lines.length && depth > 0) {
        const line = lines[i];
        if (line === "{") {
          depth++;
        } else if (line === "}") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        } else {
          block.push(line);
        }
        i++;
      }

      return { block, nextIndex: i };
    }

    function parseBlock(lines, startIndex = 0) {
      const stmts = [];
      let i = startIndex;

      while (i < lines.length) {
        const line = lines[i];

        if (assignRegex.test(line)) {
          const m = line.match(assignRegex);
          const varName = m[2];
          const value = m[3].trim();
          stmts.push({ kind: "assign", text: line, varName, value });
          i++;
          continue;
        }

        if (returnNextRegex.test(line)) {
          const m = line.match(returnNextRegex);
          const next = m[1].trim();
          stmts.push({ kind: "returnNext", text: line, next });
          i++;
          continue;
        }

        if (logRegex.test(line)) {
          const m = line.match(logRegex);
          const message = m[2];
          stmts.push({ kind: "log", text: line, message });
          i++;
          continue;
        }

        if (returnRegex.test(line)) {
          const m = line.match(returnRegex);
          const value = m[1].trim();
          stmts.push({ kind: "return", text: line, value });
          i++;
          continue;
        }

        if (ifRegex.test(line)) {
          const chain = { kind: "ifChain", branches: [], text: line };

          const ifMatch = line.match(ifRegex);
          chain.branches.push({
            kind: "if",
            condition: ifMatch[1].trim(),
            body: [],
          });
          let blk = readBlock(lines, i + 1);
          chain.branches[0].body = parseBlock(blk.block, 0);
          i = blk.nextIndex;

          while (i < lines.length) {
            const l = lines[i];

            if (elseIfRegex.test(l)) {
              const m = l.match(elseIfRegex);
              const cond = m[1].trim();
              const branch = {
                kind: "elseIf",
                condition: cond,
                body: [],
                text: l,
              };
              blk = readBlock(lines, i + 1);
              branch.body = parseBlock(blk.block, 0);
              chain.branches.push(branch);
              i = blk.nextIndex;
              continue;
            }

            if (elseRegex.test(l)) {
              const branch = { kind: "else", body: [], text: l };
              blk = readBlock(lines, i + 1);
              branch.body = parseBlock(blk.block, 0);
              chain.branches.push(branch);
              i = blk.nextIndex;
              continue;
            }

            break;
          }

          stmts.push(chain);
          continue;
        }

        i++;
      }

      return stmts;
    }

    function inferConditionVar(ifChain) {
      const firstCondBranch = ifChain.branches.find((b) => b.condition);
      if (!firstCondBranch) return "condition";
      const m = firstCondBranch.condition.match(/^\s*([\w\.]+)/);
      return m ? m[1] : "condition";
    }

    function toLevelBlocks(topStmts) {
      const levels = [];
      let currentLinear = [];

      const flushLinear = () => {
        if (currentLinear.length > 0) {
          levels.push({
            type: "linear",
            stmts: currentLinear,
          });
          currentLinear = [];
        }
      };

      for (const stmt of topStmts) {
        if (stmt.kind === "ifChain") {
          flushLinear();
          levels.push({
            type: "ifChain",
            conditionVar: inferConditionVar(stmt),
            branches: stmt.branches.map((b, idx) => ({
              branchKind: b.kind,
              condition: b.condition || null,
              bodyStmts: b.body,
              branchIndex: idx,
            })),
          });
        } else {
          currentLinear.push(stmt);
        }
      }

      flushLinear();

      return levels;
    }

    function levelBlocksToFlow(levelBlocks) {
      let nextTempId = 1;
      const tempNodes = [];
      const tempEdges = [];

      const newTempNode = (type, label) => {
        const id = `T${nextTempId++}`;
        tempNodes.push({ id, type, label });
        return id;
      };

      const newTempEdge = (source, target, label) => {
        tempEdges.push({ source, target, label: label || "" });
      };

      const startId = newTempNode("start", "start");
      let currentTails = [{ tailId: startId, nextLabel: null }];

      for (const block of levelBlocks) {
        let blockTails = [];

        if (block.type === "linear") {
          let prevId = null;

          for (const stmt of block.stmts) {
            let label;

            if (stmt.kind === "assign") {
              label = `${stmt.varName} = ${stmt.value.replace(/["']/g, "")}`;
            } else if (stmt.kind === "log") {
              label = stmt.message;
            } else if (stmt.kind === "returnNext") {
              label = `return next:${stmt.next}`;
            } else if (stmt.kind === "return") {
              label = `return ${stmt.value}`;
            } else {
              continue;
            }

            const id = newTempNode("action", label);

            if (prevId) {
              newTempEdge(prevId, id);
            } else {
              for (const tail of currentTails) {
                newTempEdge(tail.tailId, id);
              }
            }

            prevId = id;
          }

          if (prevId) {
            blockTails = [{ tailId: prevId, nextLabel: null }];
          } else {
            blockTails = currentTails.map((t) => ({ ...t }));
          }
        } else {
          const decisionId = newTempNode(
            "condition",
            `check ${block.conditionVar}`
          );

          for (const tail of currentTails) {
            newTempEdge(tail.tailId, decisionId);
          }

          for (const branch of block.branches) {
            const label = branch.condition || branch.branchKind;
            let prevId = null;
            let pendingNext = null;

            for (const stmt of branch.bodyStmts) {
              if (stmt.kind === "returnNext") {
                pendingNext = stmt.next;
                continue;
              }

              let nodeLabel;
              if (stmt.kind === "assign") {
                nodeLabel = `${stmt.varName} = ${stmt.value.replace(
                  /["']/g,
                  ""
                )}`;
              } else if (stmt.kind === "log") {
                nodeLabel = stmt.message;
              } else if (stmt.kind === "return") {
                nodeLabel = `return ${stmt.value}`;
              } else {
                continue;
              }

              const id = newTempNode("action", nodeLabel);
              if (prevId) {
                newTempEdge(prevId, id);
              } else {
                newTempEdge(decisionId, id, label);
              }
              prevId = id;
            }

            blockTails.push({
              tailId: prevId || decisionId,
              nextLabel: pendingNext,
            });
          }
        }

        currentTails = blockTails;
      }

      const endId = newTempNode("end", "end");

      const labelToNodeId = {};

      for (const n of tempNodes) {
        if (n.label) {
          labelToNodeId[n.label] = n.id;

          if (n.type === "condition") {
            const match = n.label.match(/^check\s+(.+)$/);
            if (match) {
              const varName = match[1];
              labelToNodeId[varName] = n.id;
            }
          }
        }
      }

      for (const t of currentTails) {
        const { tailId, nextLabel } = t;
        if (!tailId) continue;

        if (nextLabel) {
          let targetId = labelToNodeId[nextLabel] ||
            labelToNodeId[`check ${nextLabel}`];

          if (targetId) {
            newTempEdge(tailId, targetId, "next");
          } else if (nextLabel === "end") {
            newTempEdge(tailId, endId, "next");
          } else {
            newTempEdge(tailId, endId);
          }
        } else {
          newTempEdge(tailId, endId);
        }
      }

      return { tempNodes, tempEdges };
    }

    function materializeFlow(tempNodes, tempEdges) {
      const nodes = [];
      const edges = [];
      let idx = 1;

      const idMap = {};
      for (const t of tempNodes) {
        const id = String(idx++);
        idMap[t.id] = id;

        const type =
          t.type === "start"
            ? "start"
            : t.type === "end"
              ? "end"
              : t.type === "condition"
                ? "condition"
                : "action";

        nodes.push({
          id,
          type,
          data: { label: t.label },
          position: { x: 250, y: idx * 80 },
          className: t.type === "condition" ? "decision-node" : "",
        });
      }

      let eIdx = 1;
      for (const e of tempEdges) {
        const source = idMap[e.source];
        const target = idMap[e.target];
        if (!source || !target) continue;
        const edge = {
          id: `e${eIdx++}`,
          source,
          target,
          type: "smoothstep",
        };
        if (e.label) edge.label = e.label;
        edges.push(edge);
      }

      return { nodes, edges };
    }

    const body = trimBody(fnString);
    const lines = normalizeLines(body);
    const topStmts = parseBlock(lines);
    const levelBlocks = toLevelBlocks(topStmts);

    const { tempNodes, tempEdges } = levelBlocksToFlow(levelBlocks);
    const { nodes, edges } = materializeFlow(tempNodes, tempEdges);

    return { levelBlocks, nodes, edges, fnString };
  }



  const linkActionToRule = useCallback(async (ruleIdx, nodeId, actionIdx) => {
    console.log('Linking action to rule index:', ruleIdx, 'nodeId:', nodeId, 'actionIdx:', actionIdx);
    try {
      const idxNum = Number(ruleIdx);
      if (Number.isNaN(idxNum) || idxNum < 0) {
        setAiWarning('Select a rule to link to.');
        setTimeout(() => setAiWarning(''), 1800);
        return;
      }
      const name = (ruleNames && ruleNames[idxNum]) ? ruleNames[idxNum] : (rulePrompts && rulePrompts[idxNum]) ? rulePrompts[idxNum] : (functionsList && functionsList[idxNum] && functionsList[idxNum].name) || '';
      if (!name) {
        setAiWarning('Selected rule has no name.');
        setTimeout(() => setAiWarning(''), 1800);
        return;
      }

      const nextFunctionsBase = [...(functionsList || [])];
      let linkedRuleId = (nextFunctionsBase[idxNum] && nextFunctionsBase[idxNum].id) ? nextFunctionsBase[idxNum].id : '';
      if (!linkedRuleId) {
        linkedRuleId = createRuleId();
        nextFunctionsBase[idxNum] = { ...(nextFunctionsBase[idxNum] || {}), id: linkedRuleId, ruleId: linkedRuleId, name: name };
      }

      // Build an updated nodes array deterministically (so we can persist workflow)
      const updatedNodes = (rfNodes || []).map((n) => {
        if (String(n.id) !== String(nodeId)) return n;
        const actionsArr = Array.isArray(n.data?.actions) ? n.data.actions.slice() : [];
        // Ensure the actions array has a slot at actionIdx
        while (actionsArr.length <= actionIdx) actionsArr.push({});
        const a = actionsArr[actionIdx];
        const updatedAction = (typeof a === 'string')
          ? { action: a, linkedFunctionName: name, linkedRuleId: linkedRuleId }
          : { ...(a || {}), linkedFunctionName: name, linkedRuleId: linkedRuleId };
        actionsArr[actionIdx] = updatedAction;
        return { ...n, data: { ...(n.data || {}), actions: actionsArr } };
      });

      setRfNodes(updatedNodes);

      if (selectedNodeDetails && String(selectedNodeDetails.id) === String(nodeId)) {
        setSelectedNodeDetails((s) => {
          const actionsArr = Array.isArray(s.data?.actions) ? s.data.actions.slice() : [];
          while (actionsArr.length <= actionIdx) actionsArr.push({});
          const a = actionsArr[actionIdx];
          actionsArr[actionIdx] = (typeof a === 'string')
            ? { action: a, linkedFunctionName: name, linkedRuleId: linkedRuleId }
            : { ...(a || {}), linkedFunctionName: name, linkedRuleId: linkedRuleId };
          return { ...s, data: { ...(s.data || {}), actions: actionsArr } };
        });
      }

      // Persist the current workflow into the functionsList entry for this rule index
      try {
        const exportNodes = (updatedNodes || []).map((n) => ({ id: String(n.id), type: n.type || 'action', label: (n.data && (n.data.labelText || n.data.label)) ? String(n.data.labelText || n.data.label) : String(n.id), description: (n.data && n.data.description) ? String(n.data.description) : '', position: n.position || { x: 0, y: 0 }, metadata: n.metadata || n.data?.metadata || {}, actions: Array.isArray(n.data?.actions) ? n.data.actions : [] }));
        const exportEdges = (rfEdges || []).map((e) => ({ id: String(e.id || ''), source: String(e.source || e.from || ''), target: String(e.target || e.to || ''), label: e.label || '' }));

        const nextFunctions = [...nextFunctionsBase];
        const saveIdx = (selectedRuleIndex === undefined || selectedRuleIndex === null) ? idxNum : Number(selectedRuleIndex);
        const saveName = (ruleNames && ruleNames[saveIdx]) ? ruleNames[saveIdx] : (rulePrompts && rulePrompts[saveIdx]) ? rulePrompts[saveIdx] : `Rule ${saveIdx + 1}`;
        while (nextFunctions.length <= saveIdx) nextFunctions.push({ type: 'Rule Checker', name: saveName, expr: '', systemPrompt: '', workflowObject: '' });
        nextFunctions[saveIdx] = { ...(nextFunctions[saveIdx] || {}), workflowObject: JSON.stringify({ nodes: exportNodes, edges: exportEdges }) };
        setFunctionsList(nextFunctions);
        // also persist legacy arrays so saved doc stays consistent ??await to ensure save completes
        console.log('Persisting linked action to storage ??starting save', { saveIdx, linkedRuleId, nodeId, actionIdx });
        // Persist only the updated rule document
        // await saveRulesToFirebase({ override: { functionsList: [nextFunctions[saveIdx]] } });
        console.log('Persisting linked action to storage ??save complete', { saveIdx, linkedRuleId, nodeId, actionIdx });
      } catch (err) {
        console.error('Failed to persist workflow after linking action:', err);
      }

      setAiWarning(`Linked action to rule: ${name}`);
      setTimeout(() => setAiWarning(''), 1400);
    } catch (err) {
      console.error('linkActionToRule error:', err);
      setAiWarning('Failed to link action: ' + (err.message || 'unknown'));
      setTimeout(() => setAiWarning(''), 2000);
    }
  }, [ruleNames, rulePrompts, functionsList, selectedNodeDetails, rfNodes, rfEdges, selectedRuleIndex, ruleSource, ruleSystemPrompts, ruleTypes, ruleDetectPrompts, ruleRelatedFields, ruleCategoryIds, createRuleId]);



  // Helper: Persist updated nodes and current edges to the selected rule
  const persistWorkflowToRule = useCallback((updatedNodes) => {
    try {
      const exportNodes = (updatedNodes || []).map((n) => ({
        id: String(n.id),
        type: n.type || 'action',
        label: (n.data && (n.data.labelText || n.data.label)) ? String(n.data.labelText || n.data.label) : String(n.id),
        description: (n.data && n.data.description) ? String(n.data.description) : '',
        position: n.position || { x: 0, y: 0 },
        metadata: n.metadata || n.data?.metadata || {},
        actions: Array.isArray(n.data?.actions) ? n.data.actions : []
      }));
      const exportEdges = (rfEdges || []).map((e) => ({
        id: String(e.id || ''),
        source: String(e.source || e.from || ''),
        target: String(e.target || e.to || ''),
        label: e.label || ''
      }));

      const nextFunctions = [...(functionsList || [])];
      const saveIdx = (selectedRuleIndex === undefined || selectedRuleIndex === null) ? 0 : Number(selectedRuleIndex);

      while (nextFunctions.length <= saveIdx) {
        nextFunctions.push({ type: 'Rule Checker', name: `Rule ${saveIdx + 1}`, expr: '', systemPrompt: '', workflowObject: '' });
      }

      nextFunctions[saveIdx] = {
        ...(nextFunctions[saveIdx] || {}),
        workflowObject: JSON.stringify({ nodes: exportNodes, edges: exportEdges })
      };

      setFunctionsList(nextFunctions);
      // await saveRulesToFirebase({ override: { functionsList: [nextFunctions[saveIdx]] } });
    } catch (err) {
      console.error('persistWorkflowToRule error:', err);
    }
  }, [rfEdges, functionsList, selectedRuleIndex, setFunctionsList]);

  // Add a new action to a node and persist the workflow
  async function addActionToNode(nodeId) {
    try {
      const updatedNodes = (rfNodes || []).map((n) => {
        if (String(n.id) !== String(nodeId)) return n;
        const actionsArr = Array.isArray(n.data?.actions) ? n.data.actions.slice() : [];
        actionsArr.push({ action: 'newAction', notes: '' });
        return { ...n, data: { ...(n.data || {}), actions: actionsArr } };
      });
      setRfNodes(updatedNodes);
      if (selectedNodeDetails && String(selectedNodeDetails.id) === String(nodeId)) {
        setSelectedNodeDetails((s) => {
          const actionsArr = Array.isArray(s.data?.actions) ? s.data.actions.slice() : [];
          actionsArr.push({ action: 'newAction', notes: '' });
          return { ...s, data: { ...(s.data || {}), actions: actionsArr } };
        });
      }

      // Persist workflow into selected rule entry
      persistWorkflowToRule(updatedNodes);

      setAiWarning('Added action and saved workflow.');
      setTimeout(() => setAiWarning(''), 1800);
    } catch (err) {
      console.error('addActionToNode error:', err);
      setAiWarning('Failed to add action: ' + (err.message || 'unknown'));
      setTimeout(() => setAiWarning(''), 2000);
    }
  }

  // Delete an action from a node and persist the workflow
  async function deleteActionFromNode(nodeId, actionIdx) {
    try {
      const updatedNodes = (rfNodes || []).map((n) => {
        if (String(n.id) !== String(nodeId)) return n;
        const actionsArr = Array.isArray(n.data?.actions) ? n.data.actions.slice() : [];
        if (actionIdx >= 0 && actionIdx < actionsArr.length) actionsArr.splice(actionIdx, 1);
        return { ...n, data: { ...(n.data || {}), actions: actionsArr } };
      });
      setRfNodes(updatedNodes);
      if (selectedNodeDetails && String(selectedNodeDetails.id) === String(nodeId)) {
        setSelectedNodeDetails((s) => {
          const actionsArr = Array.isArray(s.data?.actions) ? s.data.actions.slice() : [];
          if (actionIdx >= 0 && actionIdx < actionsArr.length) actionsArr.splice(actionIdx, 1);
          return { ...s, data: { ...(s.data || {}), actions: actionsArr } };
        });
      }

      // Persist workflow
      persistWorkflowToRule(updatedNodes);

      setAiWarning('Deleted action and saved workflow.');
      setTimeout(() => setAiWarning(''), 1800);
    } catch (err) {
      console.error('deleteActionFromNode error:', err);
      setAiWarning('Failed to delete action: ' + (err.message || 'unknown'));
      setTimeout(() => setAiWarning(''), 2000);
    }
  }

  // Update an action's fields on a node and persist
  async function updateActionOnNode(nodeId, actionIdx, updates = {}) {
    try {
      const updatedNodes = (rfNodes || []).map((n) => {
        if (String(n.id) !== String(nodeId)) return n;
        const actionsArr = Array.isArray(n.data?.actions) ? n.data.actions.slice() : [];
        while (actionsArr.length <= actionIdx) actionsArr.push({});
        const a = actionsArr[actionIdx] || {};
        const updated = { ...(typeof a === 'string' ? { action: a } : a), ...updates };
        actionsArr[actionIdx] = updated;
        return { ...n, data: { ...(n.data || {}), actions: actionsArr } };
      });
      setRfNodes(updatedNodes);
      if (selectedNodeDetails && String(selectedNodeDetails.id) === String(nodeId)) {
        setSelectedNodeDetails((s) => {
          const actionsArr = Array.isArray(s.data?.actions) ? s.data.actions.slice() : [];
          while (actionsArr.length <= actionIdx) actionsArr.push({});
          const a = actionsArr[actionIdx] || {};
          actionsArr[actionIdx] = { ...(typeof a === 'string' ? { action: a } : a), ...updates };
          return { ...s, data: { ...(s.data || {}), actions: actionsArr } };
        });
      }

      // Persist workflow
      persistWorkflowToRule(updatedNodes);

      setAiWarning('Action updated and saved.');
      setTimeout(() => setAiWarning(''), 1400);
    } catch (err) {
      console.error('updateActionOnNode error:', err);
      setAiWarning('Failed to update action: ' + (err.message || 'unknown'));
      setTimeout(() => setAiWarning(''), 2000);
    }
  }

  // Update a node's label/description and persist
  async function updateNodeDetails(nodeId, updates = {}) {
    try {
      const updatedNodes = (rfNodes || []).map((n) => {
        if (String(n.id) !== String(nodeId)) return n;
        const data = { ...(n.data || {}) };
        if (updates.labelText !== undefined) data.labelText = updates.labelText;
        if (updates.description !== undefined) data.description = updates.description;
        if (updates.label !== undefined) data.label = updates.label;
        return { ...n, data };
      });
      setRfNodes(updatedNodes);
      if (selectedNodeDetails && String(selectedNodeDetails.id) === String(nodeId)) {
        setSelectedNodeDetails((s) => ({ ...s, data: { ...(s.data || {}), ...(updates || {}) } }));
      }

      // Persist workflow
      persistWorkflowToRule(updatedNodes);

      setAiWarning('Node updated and saved.');
      setTimeout(() => setAiWarning(''), 1400);
    } catch (err) {
      console.error('updateNodeDetails error:', err);
      setAiWarning('Failed to update node: ' + (err.message || 'unknown'));
      setTimeout(() => setAiWarning(''), 2000);
    }
  }
  const getVisibleRuleIndices = () => {
    try {
      return (ruleSource || []).map((_, idx) => idx);
    } catch (e) {
      return [];
    }
  };

  // Build functionsList from legacy arrays (used for migration)
  const buildFunctionsListFromLegacy = () => {
    if (!ruleSource || !ruleSource.length) return [];
    return (ruleSource || []).map((expr, idx) => {
      const existing = (functionsList && functionsList[idx]) ? functionsList[idx] : null;
      const baseId = (existing && (existing.id || existing.ruleId)) ? (existing.id || existing.ruleId) : createRuleId();
      return {
        id: baseId,
        ruleId: (existing && existing.ruleId) ? existing.ruleId : baseId,
        type: (ruleTypes && ruleTypes[idx]) ? ruleTypes[idx] : 'Rule Checker',
        name: (ruleNames && ruleNames[idx]) ? ruleNames[idx] : ((rulePrompts && rulePrompts[idx]) ? rulePrompts[idx] : `Rule ${idx + 1}`),
        expr: expr || '',
        detectPrompt: (ruleDetectPrompts && ruleDetectPrompts[idx]) ? ruleDetectPrompts[idx] : '',
        systemPrompt: (ruleSystemPrompts && ruleSystemPrompts[idx]) ? ruleSystemPrompts[idx] : '',
        relatedFields: (ruleRelatedFields && ruleRelatedFields[idx]) ? ruleRelatedFields[idx] : '',
        categoryId: (ruleCategoryIds && ruleCategoryIds[idx]) ? ruleCategoryIds[idx] : ''
      };
    });
  };

  // (migrateSavedRuleDoc removed - migration handled elsewhere)

  // Generate rule from prompt using AI
  // Generate rule using AI from prompt
  const generateRuleFromPrompt = async (index) => {
    const prompt = rulePrompts[index];
    await generateRule(index, prompt, (idx, expr) => {
      const newRules = [...ruleSource];
      newRules[idx] = expr;
      setRuleSource(newRules);
    });
  };

  // checking: evaluates ruleSource as a function for each variable
  const checking = (v, ruleSource) => {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function("v", `return (${ruleSource});`);
      return fn(v);
    } catch (e) {
      console.error("Invalid ruleSource:", ruleSource, e);
      return false;
    }
  };

  const runCheck = (
    variables = [],
    ruleSource = '',
    relatedFields = ''
  ) => {
    // clear previous results
    const container = typeof document !== 'undefined' ? document.getElementById('checkResult') : null;
    if (container) container.innerHTML = '';

    const fieldKeys = (relatedFields || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const v of variables) {
      const ok = checking(v, ruleSource); // true / false
      if (ok) {
        const extra = fieldKeys.length
          ? fieldKeys.map((key) => {
            const value = getSingleFieldValue(v, key);
            return `${key}=${value !== null && value !== undefined ? String(value) : 'N/A'}`;
          }).join(', ')
          : '';
        remineBox(`Variable "${v.name}" matched rule. qty=${v.qty}${extra ? ` | ${extra}` : ''}`);
      }
    }
  };
  const remineBox = (message) => {
    // prefer rendering into the #checkResult container; fall back to console
    if (typeof document === 'undefined') {
      console.log('remineBox B', message);
      return;
    }
    const el = document.getElementById('checkResult');
    if (!el) {
      console.log('remineBox B', message);
      return;
    }
    const row = document.createElement('div');
    row.textContent = message;
    row.style.padding = '6px 8px';
    row.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
    row.style.fontSize = '0.95em';
    el.appendChild(row);
    // keep newest visible
    el.scrollTop = el.scrollHeight;
  };

  // Test a rule group against variables
  const testRuleGroup = async (group) => {
    if (!group || !group.rules || !Array.isArray(group.rules)) {
      setAiWarning('Invalid group structure');
      return;
    }

    try {
      setGroupTesting(true);
      const results = [];

      for (const rule of group.rules) {
        const matched = [];
        let ruleExpr = rule.expr || '';

        // If rule is a reference to functionsList (by index or name), resolve it
        if (typeof rule.funcIndex === 'number' && functionsList && functionsList[rule.funcIndex]) {
          ruleExpr = functionsList[rule.funcIndex].expr || '';
        } else if (rule.name && functionsList) {
          // Try to find by name
          const found = functionsList.find((f) => f.name === rule.name);
          if (found) ruleExpr = found.expr || '';
        }

        // Test this rule against all variables
        for (const variable of variables) {
          try {
            if (checking(variable, ruleExpr)) {
              matched.push(variable.name || variable.id);
            }
          } catch (e) {
            // Skip variables that error on this rule
          }
        }

        results.push({
          rule: rule.name || ruleExpr || '(unnamed)',
          matched,
        });
      }

      setGroupTestResults({
        name: group.name || 'Test Results',
        results,
      });
      setAiWarning(`Group "${group.name}" tested against ${variables.length} variables`);
      setTimeout(() => setAiWarning(''), 2000);
    } catch (err) {
      console.error('Error testing group:', err);
      setAiWarning('Failed to test group: ' + err.message);
    } finally {
      setGroupTesting(false);
    }
  };

  const visibleRuleIndices = getVisibleRuleIndices();

  const handleGenerateSystemPrompt = useCallback(async (userPrompt = '') => {
    console.log('[handleGenerateSystemPrompt] invoked with:', userPrompt);
    // attempt to run server-side generator first
    try {
      const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const url = `${backendUrl}/api/generate-system-prompt`;
      const payload = { userPrompt, functionsList, apis };

      console.log('[handleGenerateSystemPrompt]client -> server POST', url, 'payload:', payload);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log('[handleGenerateSystemPrompt]server generator response status', response.status);
      const data = await response.json();
      console.log('[handleGenerateSystemPrompt]client <- server response', data);
      if (data && data.success) {
        // if server didn't supply node/edge results, create dummy ones here
        let nodesResult = data.nodesResult;
        let edgesResult = data.edgesResult;
        let newNodes = data.newNodes;
        let newEdges = data.newEdges;
        if (!nodesResult || !edgesResult) {
          console.warn('[handleGenerateSystemPrompt]Server generator did not return nodes/edges, using local dummy data instead');
          // same dummy data as local fallback
          nodesResult = [
            { component: 'CameraInput', value: '', id: 'node1' },
            { component: 'worldPosition', value: '', id: 'node2' },
            { component: 'wait', value: 2000, id: 'node3' }
          ];
          edgesResult = [
            { source: 'node1', target: 'node2', label: 'next' },
            { source: 'node2', target: 'node3', label: 'next' },
            { source: 'node3', target: 'node1', label: 'repeat' }
          ];

          newNodes = nodesResult.map(n => {
            const apiMatch = apis.find(a => a.name === n.component) || {};
            return {
              ...n,
              apiId: apiMatch.id || null,
              metadata: apiMatch,
              position: { x: 100 * (parseInt(n.id.replace('node',''), 10) || 0), y: 100 },
              style: {}
            };
          });
          newEdges = edgesResult.map(e => ({
            ...e,
            id: `${e.source}-${e.target}`,
            style: {}
          }));
        }

        //0228 replace new nodes and edges to current workflow
        setRfNodes(newNodes || []);
        setRfEdges(newEdges || []);

        //run auto-layout to rearrange the new graph
        setTimeout(() => {
          console.log('[handleGenerateSystemPrompt]Running auto-layout for generated workflow');
           handleAutoLayout(newNodes, newEdges);
        }, 300);

        return {
          userPrompt: userPrompt || '',
          systemPrompt: data.systemPrompt || '',
          physicalObjects: data.physicalObjects || [],
          actionComponents: data.actionComponents || [],
          nodesResult,
          edgesResult,
          newNodes,
          newEdges
        };
      }
      console.warn('Server generator failed, falling back to local:', data.error || data);
    } catch (err) {
      console.warn('Server request error, using local generator instead', err);
    }

    // local fallback (original client logic)
    try {
      const physicalObjects = [];
      const seenObjectIds = new Set(); // To avoid duplicates across workflows
      
      // Scan ALL workflows in this project category (functionsList), not just current rfNodes
      if (Array.isArray(functionsList)) {
        functionsList.forEach(rule => {
          try {
            let wf = rule.workflowObject;
            //console.log('wf', wf, rule);
            if (!wf) return; // Skip if no workflow
            
            // Parse workflowObject if it's a string
            if (typeof wf === 'string') {
              try {
                wf = JSON.parse(wf);
              } catch (e) {
                console.warn('Failed to parse workflowObject:', e);
                return;
              }
            }
            
            if (!Array.isArray(wf.nodes)) return;
            
            // Collect physical objects from this workflow
            wf.nodes.forEach(node => {
              // Get apiName from node metadata
              const apiName = node.metadata?.apiName;
              if (!apiName) return; // Skip nodes without apiName
              
              // Immediately fetch latest component data using apiName
              let latestComponent = null;
              if (Array.isArray(apis)) {
                const apiNameLower = String(apiName).toLowerCase();
                latestComponent = apis.find(api => (api.name || '').toLowerCase() === apiNameLower);
              }
              
              // Use latest component tags if available, otherwise fall back to node tags
              let tags = [];
              if (latestComponent && latestComponent.tags) {
                const compTags = latestComponent.tags;
                tags = Array.isArray(compTags) ? compTags : (typeof compTags === 'string' ? compTags.split(',').map(t => t.trim()) : []);
              } else {
                // Fallback to node tags if no latest component found
                const nodeTags = node.metadata?.tags || [];
                tags = Array.isArray(nodeTags) ? nodeTags : (typeof nodeTags === 'string' ? nodeTags.split(',').map(t => t.trim()) : []);
              }
              
              console.log('check physical object node:', apiName, 'latestComponent:', latestComponent, 'tags:', tags);
              
              // Check if this is a physical object using latest tags
              if (tags.some(tag => tag.toLowerCase() === 'object')) {
                console.log('Found physical object node:', apiName, 'with latest metadata');
                
                // Use node ID + API Name combo to avoid duplicate entries
                const uniqueKey = `${String(node.id)}_${String(apiName)}`;
                
                // Skip only if exact same node+apiName combination was already added
                if (!seenObjectIds.has(uniqueKey)) {
                  seenObjectIds.add(uniqueKey);
                  
                  // Use latest component data (already fetched above) for name and description
                  const finalName = latestComponent?.name || apiName;
                  const finalDescription = latestComponent?.description || node.description || node.data?.description || '';
                  
                  // Use the tags we already determined above (latest component tags or fallback)
                  const finalTags = tags;
                  
                  physicalObjects.push({
                    name: finalName,
                    id: node.id,
                    apiName: apiName,
                    description: finalDescription,
                    tags: finalTags
                  });
                }
              }
            });
          } catch (err) {
            console.warn('Error processing workflow in rule:', rule, err);
          }
        });
      }
      
      console.log('Physical Objects found across category (with latest metadata):', physicalObjects);
      
      const physicalObjectTags = new Set();
      physicalObjects.forEach(obj => {
        const tags = obj.tags || [];
        tags.forEach(tag => {
          if (tag.toLowerCase() !== 'object') {
            physicalObjectTags.add(tag.toLowerCase());
          }
        });
      });
      
      console.log('Physical Object Tags (excluding "object"):', Array.from(physicalObjectTags));
      
      const actionComponents = [];
      if (Array.isArray(apis)) {
        apis.forEach(api => {
          const tags = api.tags || [];
          const tagsArray = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : []);
          
          const lowerTags = tagsArray.map(t => String(t).toLowerCase());
          
          // Check if this component should be included:
          // 1. If has 'open' tag -> include directly (free action)
          // 2. If has 'action' tag AND has matching tags with object tags -> include
          
          const hasOpen = lowerTags.includes('open');
          const hasAction = lowerTags.includes('action');
          
          // Compute matching tags between api tags and physical object tags
          const matchingTags = tagsArray.filter(tag => 
            physicalObjectTags.has(String(tag).toLowerCase()) && 
            String(tag).toLowerCase() !== 'action' && 
            String(tag).toLowerCase() !== 'open'
          );
          
          // Include if: has 'open' tag OR (has 'action' tag AND has matching object tags)
          const shouldInclude = hasOpen || (hasAction && matchingTags.length > 0);
          
          if (shouldInclude) {
            actionComponents.push({
              name: api.name || 'Unknown',
              id: api.id || '',
              description: api.description || '',
              matchingTags: matchingTags,
              isOpen: hasOpen,
              isAction: hasAction
            });
          }
        });
      }
      
      console.log('Action Components found:', actionComponents);
      
      let output = '';
      output += 'Physically Objects:\n';
      physicalObjects.forEach(obj => {
        output += `${obj.name}, ${obj.id}, ${obj.description}\n`;
      });
      output += '\nAction Components:\n';
      actionComponents.forEach(comp => {
        output += `${comp.name}, ${comp.id}, ${comp.description}`;
        const tags = [];
        if (Array.isArray(comp.matchingTags) && comp.matchingTags.length) {
          tags.push(`matchingTags: ${comp.matchingTags.join('|')}`);
        }
        if (comp.isOpen) {
          tags.push('open');
        }
        if (comp.isAction) {
          tags.push('action');
        }
        if (tags.length > 0) {
          output += `, [${tags.join(', ')}]`;
        }
        output += '\n';
      });
      
      // Build complete systemPrompt including template
      const systemPrompt = `it is a industry lab
you have phycisly object here:
${output}
base on user prompt, to create a workflow, as a array format as below:
const nodes = [
 {id: "node1", action:"CameraInput",value:""},
 {id: "node2", action":"worldPosition",value:""},
 {id: "node3", action":"wait",value:2000}
]
const edges = [
  {source: "node1", target: "node2", label: "next"},
  {source: "node2", target: "node3", label: "next"},
  {source: "node3", target: "node1", label: "repeat"},
]`;

      console.log('=== System Prompt Generated ===\n' + systemPrompt);

      // build dummy workflow data arrays
      const nodesResult = [
        { component: 'CameraInput', value: '', id: 'node1' },
        { component: 'worldPosition', value: '', id: 'node2' },
        { component: 'wait', value: 2000, id: 'node3' }
      ];
      const edgesResult = [
        { source: 'node1', target: 'node2', label: 'next' },
        { source: 'node2', target: 'node3', label: 'next' },
        { source: 'node3', target: 'node1', label: 'repeat' }
      ];

      // optionally map to APIs, add metadata/position/style placeholders
      const newNodes = nodesResult.map(n => {
        const apiMatch = apis.find(a => a.name === n.component) || {};
        return {
          ...n,
          apiId: apiMatch.id || null,
          metadata: apiMatch,
          position: { x: 100 * (parseInt(n.id.replace('node',''), 10) || 0), y: 100 },
          style: {}
        };
      });
      const newEdges = edgesResult.map(e => ({
        ...e,
        id: `${e.source}-${e.target}`,
        style: {}
      }));

      //console.log('nodesResult', nodesResult);
      //console.log('edgesResult', edgesResult);
      console.log('newNodes', newNodes.length);
      console.log('newEdges', newEdges.length);

      // return full structure including dummy workflow
      return {
        userPrompt: userPrompt || '',
        systemPrompt,
        physicalObjects,
        actionComponents,
        nodesResult,
        edgesResult,
        newNodes,
        newEdges
      };
      
    } catch (err) {
      console.error('Error generating system prompt:', err);
      setAiWarning('Failed to generate system prompt');
      setTimeout(() => setAiWarning(''), 2000);
      return {
        userPrompt: userPrompt || '',
        systemPrompt: '',
        physicalObjects: [],
        actionComponents: [],
        nodesResult: [],
        edgesResult: [],
        newNodes: [],
        newEdges: []
      };
    }
  }, [functionsList, apis, setAiWarning]);

  // Open modal to collect user prompt, then call generator on submit
  const openGeneratePromptModal = useCallback(() => {
    setIsSysPromptModalOpen(true);
    setUserPromptInput('');
  }, []);

  const submitGeneratePrompt = useCallback(async () => {
    console.log('[submitGeneratePrompt] clicked; userPromptInput=', userPromptInput);
    //debugger; // break here to confirm handler execution
    try {
      console.log('[submitGeneratePrompt] starting; current output open:', isOutputOpenLocal);

      const res = await handleGenerateSystemPrompt(userPromptInput);
      console.log('[submitGeneratePrompt] handleGenerateSystemPrompt returned ', res);
      // log generated workflow structures (if any)
      if (res) {
        console.log('[submitGeneratePrompt] generate results:', {
          nodesResult: res.nodesResult,
          edgesResult: res.edgesResult,
          newNodes: res.newNodes,
          newEdges: res.newEdges
        });
      }
      // apply the workflow data into the current graph
      // NOTE: already applied via setRfNodes/setRfEdges above, no need to add again
      //if (res && res.nodesResult && res.edgesResult) {
      //  applyWorkflowFromPrompt(res.nodesResult, res.edgesResult);
      //}

      // save prompts locally so other parts of UI can access / display them
      setLastUserPrompt(userPromptInput);
      setLastSystemPrompt(res.systemPrompt);

      // build the output string
      const outputText = `User Prompt:\n${userPromptInput}\n\nSystem Prompt:\n${res.systemPrompt}`;

      // if the floating panel is already open or content is the same, we still want
      // to force a re-render so the user sees the latest result.  To guarantee this,
      // clear and reopen the output view state briefly.
      //setIsOutputOpenLocal(false);
      setApiResultsContent(null);

      // apply the new content and re-open after a microtask so state updates flush
      setTimeout(() => {
        setApiResultsContent(outputText);
       // setIsOutputOpenLocal(true);
      }, 10);

    } catch (e) {
      console.error('submitGeneratePrompt failed', e);
    } finally {
      setIsSysPromptModalOpen(false);
      setUserPromptInput('');
    }
  }, [userPromptInput, handleGenerateSystemPrompt, isOutputOpenLocal]);

  // helper: interpret workflow data from prompt result and inject into current flow
  const applyWorkflowFromPrompt = useCallback((nodesResult = [], edgesResult = []) => {
    if (!Array.isArray(nodesResult) || !Array.isArray(edgesResult)) return;

    const addedNodes = nodesResult.map(n => {
      const api = apis.find(a => a.name === n.component) || {};
      const metadata = { ...(api.metadata || {}), ...api };
      const widthRatio = (metadata.size || '2:1').split(':')[0] || 1;
      const heightRatio = (metadata.size || '2:1').split(':')[1] || 1;
      const nodeWidth = Number(widthRatio) * 64;
      const nodeHeight = Number(heightRatio) * 64;
      return {
        id: n.id,
        position: { x: 200 + (parseInt(n.id.replace('node',''),10) || 0) * 100, y: 200 },
        type: 'api',
        metadata,
        data: {
          labelText: n.component,
          label: n.component,
          description: '',
          actions: [],
          width: nodeWidth,
          height: nodeHeight,
          metadata,
          fnString: api.function || api.fnString || null
        },
        style: { borderRadius: 10, padding: 8, width: nodeWidth, minHeight: nodeHeight }
      };
    });
    setRfNodes(prev => [...(prev || []), ...addedNodes]);

    const addedEdges = edgesResult.map(e => ({
      id: `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      label: e.label || '',
      type: 'smoothstep'
    }));
    setRfEdges(prev => [...(prev || []), ...addedEdges]);
  }, [apis, setRfNodes, setRfEdges]);

  // end of applyWorkflowFromPrompt helper


  // Handler to update global variables on the server
  const handleUpdateGlobalVar = useCallback(async (key, value) => {
    console.log('handleUpdateGlobalVar called with:', { key, value });
    
    try {
      const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      console.log('Sending to:', `${backendUrl}/api/global-store`);
      
      const requestBody = { key, value };
      console.log('Request body:', JSON.stringify(requestBody));
      
      const response = await fetch(`${backendUrl}/api/global-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      console.log('Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error response:', errorText);
        throw new Error(`HTTP ${response.status}: Failed to update global variable`);
      }
      
      const result = await response.json();
      console.log('Global variable update response:', result);
      
      // Verify the value was actually saved
      if (result.success || result.key === key) {
        console.log('✅ Global variable persisted successfully');
        setAiWarning('Global variable updated successfully');
        setTimeout(() => setAiWarning(''), 2000);
      } else {
        console.warn('⚠️ Server response indicates update may have failed:', result);
      }
      
      // Server will broadcast the change to all clients via socket
      // No need to update local state manually
    } catch (err) {
      console.error('❌ Failed to update global variable:', err);
      setAiWarning('Failed to update global variable: ' + (err.message || 'Unknown error'));
      setTimeout(() => setAiWarning(''), 3000);
    }
  }, [setAiWarning]);

  // Monitor socket updates to global store vars
  // This ensures UI updates when server broadcasts changes
  useEffect(() => {
    if (!socketRef?.current) {
      console.log('⚠️ socketRef not available yet');
      return;
    }

    const handleGlobalVarsUpdate = (data) => {
      console.log('📡 [VariableManager] Received global_store_vars_update event:', data);
      // The globalStoreVars state from useRunDemo should update automatically
      // This is just for logging/debugging to confirm we're getting the updates
      if (data?.globalStoreVars) {
        console.log('✅ Global store vars successfully updated from server:', Object.keys(data.globalStoreVars || {}));
      }
    };

    socketRef.current.on('global_store_vars_update', handleGlobalVarsUpdate);

    return () => {
      socketRef.current?.off('global_store_vars_update', handleGlobalVarsUpdate);
    };
  }, [socketRef]);

  // Expose diagnostic tools to window for debugging globalStoreVars issues
  useEffect(() => {
    window.globalStoreDiagnostics = {
      // Test updating a global variable
      testUpdate: async (key, value) => {
        console.log('🧪 Testing global var update:', { key, value });
        return handleUpdateGlobalVar(key, value);
      },
      
      // Check current socket connection status
      checkSocket: () => {
        const connected = socketRef?.current?.connected;
        console.log(`📡 Socket connected: ${connected}`);
        return { connected };
      },
      
      // Manually trigger a socket event listener
      forceGlobalVarUpdate: (testVars) => {
        console.log('🔨 Forcing global var update with:', testVars);
        // Simulating what useRunDemo does when receiving socket event
        const updated = { ...globalStoreVars, ...testVars };
        console.log('Updated globalStoreVars would be:', updated);
      },
      
      // Display current state
      getCurrentState: () => {
        return {
          globalStoreVars,
          storeVars,
          socketConnected: socketRef?.current?.connected,
        };
      },
    };
    
    console.log('✅ Global store diagnostics available at: window.globalStoreDiagnostics');
    console.log('📖 Available methods:');
    console.log('  - testUpdate(key, value) - Test updating a global variable');
    console.log('  - checkSocket() - Check socket connection status');
    console.log('  - getCurrentState() - Display current globalStoreVars state');
    console.log('  - forceGlobalVarUpdate(vars) - Simulate a socket update');
    
    return () => {
      delete window.globalStoreDiagnostics;
    };
  }, [globalStoreVars, storeVars, socketRef, handleUpdateGlobalVar]);

  return (
    <div className="variable-page">
      <div className="variable-page-header">

          <button className="back-btn" onClick={onBack}>
          Back to menu
          </button>

          <h2>Variable Manager</h2>
          <p className="page-subtitle">
            Manage variables with name, description, and tags.
          </p>



      </div>

      {/* Floating StoreVars Inspector */}
      <StoreVarsFloating 
        storeVars={{ ...(storeVars || {}), globalStoreVars: (globalStoreVars || {}) }} 
        setStoreVars={setStoreVars} 
        onUpdateGlobalVar={handleUpdateGlobalVar}
      />
      <ApiResultsFloating title="Output View" content={apiResultsContent} setContent={setApiResultsContent} />
      {showApiNodes && (
        <ApiNodesFloating
          apis={apis}
          onInsert={(api) => { try { addRfApiNode(api); } catch (e) { } }}
          onClose={() => setShowApiNodes(false)}
        />
      )}

      {/* CONTROLS SECTION (now full-width with table as first tab) */}
      <div className="variable-page-controls-section">

        {/* TAB NAVIGATION */}
        <TabNavigation activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* TAB CONTENT */}
        {activeTab === 'variableTable' && (
          <VariableTableContainer
            variables={variables}
            handleEdit={handleEdit}
            deleteVariable={deleteVariable}
          />
        )}

        {activeTab === 'ruleChecker' && (
          <RuleCheckerPanel
            selectedRuleIndex={selectedRuleIndex}
            addNewRule={addNewRule}
            ruleTypes={ruleTypes}
            setRuleTypes={setRuleTypes}
            selectedRuleCategoryId={selectedRuleCategoryId}
            setSelectedRuleCategoryId={setSelectedRuleCategoryId}
            ruleCategoryIds={ruleCategoryIds}
            setRuleCategoryIds={setRuleCategoryIds}
            ruleCategories={ruleCategories}
            ruleNames={ruleNames}
            setSelectedRuleIndex={setSelectedRuleIndex}
            updateRuleName={updateRuleName}
            rulePrompts={rulePrompts}
            updateRulePrompt={updateRulePrompt}
            ruleSource={ruleSource}
            updateRuleSource={updateRuleSource}
            ruleDetectPrompts={ruleDetectPrompts}
            setRuleDetectPrompts={setRuleDetectPrompts}
            ruleRelatedFields={ruleRelatedFields}
            setRuleRelatedFields={setRuleRelatedFields}
            ruleSystemPrompts={ruleSystemPrompts}
            setRuleSystemPrompts={setRuleSystemPrompts}
            functionsList={functionsList}
            generatingRuleIndex={generatingRuleIndex}
            generateRuleFromPrompt={generateRuleFromPrompt}
            runCheck={runCheck}
            variables={variables}
            saveRuleSources={null}
            ruleExpressions={ruleExpressions}
            setExpression={setExpression}
            deleteRuleIndex={() => {
              const nextRuleSource = ruleSource.filter((_, i) => i !== selectedRuleIndex);
              const nextRulePrompts = rulePrompts.filter((_, i) => i !== selectedRuleIndex);
              const nextRuleNames = ruleNames.filter((_, i) => i !== selectedRuleIndex);
              const nextRuleTypes = ruleTypes.filter((_, i) => i !== selectedRuleIndex);
              const nextRuleSystemPrompts = ruleSystemPrompts.filter((_, i) => i !== selectedRuleIndex);
              const nextRuleDetectPrompts = ruleDetectPrompts.filter((_, i) => i !== selectedRuleIndex);
              const nextRuleRelatedFields = ruleRelatedFields.filter((_, i) => i !== selectedRuleIndex);
              const nextRuleCategoryIds = ruleCategoryIds.filter((_, i) => i !== selectedRuleIndex);
              const nextRuleExpressions = ruleExpressions.filter((_, i) => i !== selectedRuleIndex);
              const nextFunctionsList = (functionsList && functionsList.length)
                ? functionsList.filter((_, i) => i !== selectedRuleIndex)
                : functionsList;

              setRuleSource(nextRuleSource);
              setRulePrompts(nextRulePrompts);
              setRuleNames(nextRuleNames);
              setRuleTypes(nextRuleTypes);
              setRuleSystemPrompts(nextRuleSystemPrompts);
              setRuleDetectPrompts(nextRuleDetectPrompts);
              setRuleRelatedFields(nextRuleRelatedFields);
              setRuleCategoryIds(nextRuleCategoryIds);
              setExpression(nextRuleExpressions);
              if (nextFunctionsList) setFunctionsList(nextFunctionsList);
              setSelectedRuleIndex(Math.max(0, selectedRuleIndex - 1));

              /*
              saveRulesToFirebase({
                ruleSource: nextRuleSource,
                rulePrompts: nextRulePrompts,
                ruleNames: nextRuleNames,
                ruleTypes: nextRuleTypes,
                ruleSystemPrompts: nextRuleSystemPrompts,
                ruleDetectPrompts: nextRuleDetectPrompts,
                ruleRelatedFields: nextRuleRelatedFields,
                ruleCategoryIds: nextRuleCategoryIds,
                functionsList: nextFunctionsList || []
              });
              */
            }}
            newGroupName={newGroupName}
            setNewGroupName={setNewGroupName}
            newGroupContent={newGroupContent}
            setNewGroupContent={setNewGroupContent}
            saveRuleGroup={saveRuleGroup}
            ruleGroups={ruleGroups}
            groupsLoading={groupsLoading}
            editingGroupId={editingGroupId}
            setEditingGroupId={setEditingGroupId}
            ruleGroupDelete={deleteRuleGroup}
            testRuleGroup={testRuleGroup}
            groupTesting={groupTesting}
            groupTestResults={groupTestResults}
            visibleRuleIndices={visibleRuleIndices}
          />
        )}



        {activeTab === 'ruleCategory' && (
          <RuleCategoryPanel
            newCategoryName={newCategoryName}
            setNewCategoryName={setNewCategoryName}
            saveRuleCategory={saveRuleCategory}
            editingCategoryId={editingCategoryId}
            setEditingCategoryId={setEditingCategoryId}
            ruleCategories={ruleCategories}
            categoriesLoading={categoriesLoading}
            deleteRuleCategory={deleteRuleCategory}
          />
        )}

        {activeTab === 'manualEdit' && (
          <ManualEditPanel
            manualSelectedId={manualSelectedId}
            setManualSelectedId={setManualSelectedId}
            variables={variables}
            handleLoadManual={handleLoadManual}
            handleCancel={handleCancel}
            newName={newName}
            setNewName={setNewName}
            newDescription={newDescription}
            setNewDescription={setNewDescription}
            newTags={newTags}
            setNewTags={setNewTags}
            editingId={editingId}
            handleAddOrUpdate={handleAddOrUpdate}
          />
        )}

        {activeTab === 'externalApi' && (
          <ExternalAPIPanel
            newApiName={newApiName}
            setNewApiName={setNewApiName}
            newApiUrl={newApiUrl}
            setNewApiUrl={setNewApiUrl}
            addApi={addApi}
            apis={apis}
            setApis={setApis}
            apisLoading={apisLoading}
            deleteApi={deleteApi}
            selectedApiId={selectedApiId}
            setSelectedApiId={setSelectedApiId}
            testInput={testInput}
            setTestInput={setTestInput}
            testing={testing}
            testApi={testApi}
            testResult={testResult}
            saveApiPrompt={saveApiPrompt}
            updateApiMetadata={updateApiMetadata}
            setAiWarning={setAiWarning}
          />
        )}

        {activeTab === 'variablePrompt' && (
          <VariablePromptPanel
            selectedRuleCategoryId={selectedRuleCategoryId}
            setSelectedRuleCategoryId={setSelectedRuleCategoryId}
            ruleCategories={ruleCategories}
            selectedRuleIndex={selectedRuleIndex}
            setSelectedRuleIndex={setSelectedRuleIndex}
            ruleNames={ruleNames}
            rulePrompts={rulePrompts}
            visibleRuleIndices={visibleRuleIndices}
            functionsList={functionsList}
            addNewWorkflow={addNewWorkflow}
            deleteWorkflow={async () => {
              try {
                // Get the rule ID to delete
                const ruleId = functionsList && functionsList[selectedRuleIndex] && functionsList[selectedRuleIndex].id;
                if (!ruleId) {
                  setAiWarning('Cannot delete: workflow not found');
                  return;
                }

                // Delete from server/database
                const result = await deleteRuleFromServer(ruleId);
                if (!result.success) {
                  setAiWarning('Failed to delete workflow: ' + (result.error || 'unknown error'));
                  return;
                }

                // Only update state after successful delete
                const nextRuleSource = ruleSource.filter((_, i) => i !== selectedRuleIndex);
                const nextRulePrompts = rulePrompts.filter((_, i) => i !== selectedRuleIndex);
                const nextRuleNames = ruleNames.filter((_, i) => i !== selectedRuleIndex);
                const nextRuleTypes = ruleTypes.filter((_, i) => i !== selectedRuleIndex);
                const nextRuleSystemPrompts = ruleSystemPrompts.filter((_, i) => i !== selectedRuleIndex);
                const nextRuleDetectPrompts = ruleDetectPrompts.filter((_, i) => i !== selectedRuleIndex);
                const nextRuleRelatedFields = ruleRelatedFields.filter((_, i) => i !== selectedRuleIndex);
                const nextRuleCategoryIds = ruleCategoryIds.filter((_, i) => i !== selectedRuleIndex);
                const nextRuleExpressions = ruleExpressions.filter((_, i) => i !== selectedRuleIndex);
                const nextFunctionsList = (functionsList && functionsList.length)
                  ? functionsList.filter((_, i) => i !== selectedRuleIndex)
                  : functionsList;

                setRuleSource(nextRuleSource);
                setRulePrompts(nextRulePrompts);
                setRuleNames(nextRuleNames);
                setRuleTypes(nextRuleTypes);
                setRuleSystemPrompts(nextRuleSystemPrompts);
                setRuleDetectPrompts(nextRuleDetectPrompts);
                setRuleRelatedFields(nextRuleRelatedFields);
                setRuleCategoryIds(nextRuleCategoryIds);
                setExpression(nextRuleExpressions);
                if (nextFunctionsList) setFunctionsList(nextFunctionsList);
                setSelectedRuleIndex(Math.max(0, selectedRuleIndex - 1));

                setAiWarning('Workflow deleted successfully');
                setTimeout(() => setAiWarning(''), 2000);
              } catch (err) {
                console.error('Delete workflow error:', err);
                setAiWarning('Error deleting workflow: ' + (err.message || 'unknown'));
              }
            }}
            allProjectStatuses={allProjectStatuses}
            saveSynthFunctionToRule={saveSynthFunctionToRule}
            openOutputView={() => setIsOutputOpenLocal(true)}
            generateSystemPrompt={openGeneratePromptModal}
            confirmPreview={confirmPreview}
            aiLoading={aiLoading}
            taskFunctionText={taskFunctionText}
            workflowLoading={workflowLoading}
            workflowError={workflowError}
            rfNodes={rfNodes}
            rfEdges={rfEdges}
            setRfNodes={setRfNodes}
            setRfEdges={setRfEdges}
            onRfNodesChange={onRfNodesChange}
            onRfEdgesChange={onRfEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onEdgeDoubleClick={onEdgeDoubleClick}
            edgeEdit={edgeEdit}
            onCommitEdgeLabel={commitEdgeLabel}
            onCancelEdgeEdit={cancelEdgeEdit}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeClick={onNodeClick}
            deleteSelected={deleteSelected}
            generateFunctionFromFlow={generateFunctionFromFlow}
            setRfInstance={setRfInstance}
            openActionRule={openActionRule}
            onAutoLayout={handleAutoLayout}
            onNodePromptSubmit={handleNodePromptSubmit}
            layoutDirection={layoutDirection}
            selectedIds={selectedIds}
            handleAiSubmit={handleAiSubmit}
            aiPrompt={aiPrompt}
            setAiPrompt={setAiPrompt}
            handlePromptToWorkflow={handlePromptToWorkflow}
            aiWarning={aiWarning}
            aiResponse={aiResponse}
            setTaskFunctionText={setTaskFunctionText}
            handleGenerateWorkflow={handleGenerateWorkflow}
            createFnPromptFromFunction={createFnPromptFromFunction}
            execProgress={execProgress}
            execLog={execLog}
            filteredVariables={filteredVariables}
            runActive={runActive}
            runProject={runProject}
            activeNodeId={runCurrentNodeId}
            activeEdgeId={runCurrentEdgeId}
            storeVars={storeVars}
            setStoreVars={setStoreVars}
            pendingActions={pendingActions}
            cancelPreview={cancelPreview}
          />
        )}

        {activeTab === 'logs' && (
          <LogsPanel
            logs={logs}
            logsLoading={logsLoading}
            logsAllLoaded={logsAllLoaded}
            loadLogs={loadLogs}
          />
        )}
      </div>



      {/* NodeEditModal removed — node editing handled via NodeDetailsModal */}
      <NodeDetailsModal
        selectedNodeDetails={selectedNodeDetails}
        setSelectedNodeDetails={setSelectedNodeDetails}
        addActionToNode={addActionToNode}
        actionLinkSelections={actionLinkSelections}
        setActionLinkSelections={setActionLinkSelections}
        visibleRuleIndices={visibleRuleIndices}
        ruleNames={ruleNames}
        rulePrompts={rulePrompts}
        functionsList={functionsList}
        openActionRule={openActionRule}
        createOwnRuleForAction={createOwnRuleForAction}
        linkActionToRule={linkActionToRule}
        deleteActionFromNode={deleteActionFromNode}
        updateActionOnNode={updateActionOnNode}
        updateNodeDetails={updateNodeDetails}
      />
      {isOutputOpenLocal && (
        <OutputView onClose={() => setIsOutputOpenLocal(false)} socket={socketRef && socketRef.current ? socketRef.current : null} projectId={projectIdForRun} />
      )}
      {isSysPromptModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{ width: 520, background: '#071029', padding: 20, borderRadius: 8, boxShadow: '0 6px 30px rgba(0,0,0,0.6)' }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff' }}>User Prompt</h3>
            <textarea
              value={userPromptInput}
              onChange={(e) => setUserPromptInput(e.target.value)}
              placeholder="Enter user prompt..."
              style={{ width: '100%', height: 120, padding: 8, borderRadius: 6, background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.06)', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setIsSysPromptModalOpen(false); setUserPromptInput(''); }} style={{ padding: '6px 12px', background: '#1e293b', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { console.log('modal submit button clicked'); submitGeneratePrompt(); }} style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VariableManager;

