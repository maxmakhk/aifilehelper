import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * useRunDemo Hook - Observer mode for workflow execution
 * 
 * Architecture:
 * - Node.js server runs projects independently (continues even if clients disconnect)
 * - Client is an OBSERVER: watches project state and receives updates
 * - When client enters workflow, it retrieves current project progress
 * - Run/Stop controls only set project status on server, don't directly trigger execution
 * - Server's execution loop continuously checks and runs projects with 'running' status
 */
export default function useRunDemo({ rfNodes = [], rfEdges = [], stepDelay = 1000, apis = [], projectId = null } = {}) {
  const [runActive, setRunActive] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [activeEdgeId, setActiveEdgeId] = useState(null);
  const [storeVars, setStoreVars] = useState({});
  const [globalStoreVars, setGlobalStoreVars] = useState({});
  const [allProjectStatuses, setAllProjectStatuses] = useState({}); // projectId -> 'running' | 'stopped'
  const socketRef = useRef(null);
  const runIdRef = useRef(null);
  const [promptProcessing, setPromptProcessing] = useState(false);
  const [promptStatus, setPromptStatus] = useState('');
  const promptCallbackRef = useRef(null);
  const projectIdRef = useRef(projectId || null);
  const [currentProjectId, setCurrentProjectId] = useState(projectId);

  // Initialize socket connection
  useEffect(() => {
    // Only connect once, assuming the backend runs on port 3001
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    socketRef.current = io(backendUrl);

    socketRef.current.on('connect', () => {
      console.log('Socket connected to backend for workflow execution');
      
      // Watch current project immediately after connection
      if (currentProjectId) {
        console.log(`[ProjectSync] Watching project on connect: ${currentProjectId}`);
        socketRef.current.emit('watch_project', { projectId: currentProjectId });
      }
    });

    // Receive ALL project statuses on connection
    socketRef.current.on('all_project_statuses', (statuses) => {
      console.log('📋 [CLIENT] Received all project statuses:', statuses);
      setAllProjectStatuses(statuses || {});
    });

    // Receive GLOBAL project status changes (sent to all clients)
    socketRef.current.on('project_status_change', (data) => {
      console.log('🔔 [CLIENT] Project status changed:', data);
      const { projectId: changedProjectId, status } = data || {};
      if (changedProjectId) {
        setAllProjectStatuses((prev) => ({
          ...prev,
          [changedProjectId]: status
        }));
        
        // Also update runActive if this is the current project
        if (changedProjectId === currentProjectId) {
          if (status === 'running') {
            console.log('🟢 [CLIENT STATUS CHANGE] Current project running, setting runActive to TRUE');
            setRunActive(true);
          } else if (status === 'stopped') {
            console.log('🔴 [CLIENT STATUS CHANGE] Current project stopped, setting runActive to FALSE');
            setRunActive(false);
          }
        }
      }
    });

    // Receive project STATUS updates (只更新 run/stop 按鈕狀態)
    socketRef.current.on('project_status', (data) => {
      console.log('🔵 [CLIENT STATUS UPDATE] Received project_status:', data);
      if (data.status === 'running') {
        console.log('🟢 [CLIENT STATUS UPDATE] Setting runActive to TRUE');
        setRunActive(true);
      } else if (data.status === 'stopped') {
        console.log('🔴 [CLIENT STATUS UPDATE] Setting runActive to FALSE');
        setRunActive(false);
      }
    });

    // Receive execution STATE updates (只更新執行細節，不影響按鈕)
    socketRef.current.on('execution_state', (data) => {
      try {
        console.log('⚙️ [CLIENT EXECUTION UPDATE] Received execution_state:', data);
        if (data.activeNodeId !== undefined) setActiveNodeId(data.activeNodeId);
        if (data.activeEdgeId !== undefined) setActiveEdgeId(data.activeEdgeId);
        if (data.storeVars) setStoreVars((prev) => ({ ...(prev || {}), ...(data.storeVars || {}) }));
        if (data.globalStoreVars) setGlobalStoreVars((prev) => ({ ...(prev || {}), ...(data.globalStoreVars || {}) }));
      } catch (e) { /* ignore malformed */ }
    });

    socketRef.current.on('workflow_updated', (data) => {
      console.log('[ProjectSync] Workflow updated by another client');
      // Note: In VariableManager, you could sync rfNodes/rfEdges here if needed
    });

    socketRef.current.on('node_start', (data) => {
      setActiveNodeId(data.nodeId);
      setActiveEdgeId(null);
    });

    socketRef.current.on('edge_start', (data) => {
      setActiveEdgeId(data.edgeId);
    });

    socketRef.current.on('store_vars_update', (data) => {
      try {
        // Always merge incoming storeVars so the client accumulates variables across projects
        const incoming = data && data.storeVars ? data.storeVars : data || {};
        setStoreVars((prev) => ({ ...(prev || {}), ...(incoming || {}) }));
      } catch (e) { /* ignore malformed payloads */ }
    });

    // Global store vars updates (single-layer global store)
    socketRef.current.on('global_store_vars_update', (data) => {
      try {
        // server sends { globalStoreVars: {...} }, extract the inner object
        const incoming = (data && data.globalStoreVars) ? data.globalStoreVars : (data || {});
        setGlobalStoreVars(incoming);
      } catch (e) { /* ignore malformed payloads */ }
    });

    socketRef.current.on('node_wait', (data) => {
      // Dispatch standard event so frontend knows to show "waiting user input" UI
      document.dispatchEvent(new CustomEvent('workflowPaused', {
        detail: { nodeId: data.nodeId, reason: data.reason }
      }));
    });

    socketRef.current.on('node_error', (data) => {
      console.error(`[Backend] Node ${data.nodeId} error:`, data.error);
    });

    socketRef.current.on('node_log', (data) => {
      if (data.level === 'error') {
        console.error(`[backend node ${data.nodeId}]`, ...(data.args || []));
      } else if (data.level === 'warn') {
        console.warn(`[backend node ${data.nodeId}]`, ...(data.args || []));
      } else {
        console.log(`[backend node ${data.nodeId}]`, ...(data.args || []));
      }
    });

    socketRef.current.on('workflow_complete', () => {
      setRunActive(false);
      setActiveNodeId(null);
      setActiveEdgeId(null);
      runIdRef.current = null;
      console.log('Workflow execution completed on backend');
    });

    // server-side run started (created a runId)
    socketRef.current.on('run.started', (data) => {
      try {
        runIdRef.current = data?.runId || null;
        if (runIdRef.current) {
          socketRef.current.emit('run.subscribe', { runId: runIdRef.current });
          setRunActive(true);
        }
      } catch (e) { }
    });

    // generic run events
    socketRef.current.on('run_status', (data) => {
      if (!data) return;
      if (data.runId) runIdRef.current = data.runId;
      if (data.status === 'running') setRunActive(true);
      else setRunActive(false);
      if (data.currentNodeId) setActiveNodeId(data.currentNodeId);
      if (data.storeVars) setStoreVars((prev) => ({ ...(prev || {}), ...(data.storeVars || {}) }));
    });

    // Prompt pipeline progress events
    socketRef.current.on('prompt_processing_start', () => {
      setPromptProcessing(true);
      setPromptStatus('Processing prompt…');
    });

    socketRef.current.on('prompt_normalized', () => {
      setPromptStatus('Generating function…');
    });

    socketRef.current.on('function_generated', () => {
      setPromptStatus('Building workflow…');
    });

    socketRef.current.on('workflow_ready', (data) => {
      setPromptProcessing(false);
      setPromptStatus('');
      if (typeof promptCallbackRef.current === 'function') {
        promptCallbackRef.current(data);
      }
    });

    socketRef.current.on('prompt_error', (data) => {
      setPromptProcessing(false);
      setPromptStatus('');
      console.error('[Prompt pipeline error]', data?.message || data);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [currentProjectId]);

  // Watch project when projectId changes
  useEffect(() => {
    if (socketRef.current && socketRef.current.connected && currentProjectId) {
      console.log(`[ProjectSync] Watching project: ${currentProjectId}`);
      socketRef.current.emit('watch_project', { projectId: currentProjectId });
    }
  }, [currentProjectId]);

  // Set up resume listener from frontend UI
  useEffect(() => {
    const resumeHandler = (ev) => {
      const nodeId = ev?.detail?.nodeId;
      if (!nodeId || !socketRef.current) return;

      // Tell backend to resume
      socketRef.current.emit('workflow_resume', { nodeId });
    };

    document.addEventListener('workflowResume', resumeHandler);
    return () => {
      document.removeEventListener('workflowResume', resumeHandler);
    };
  }, []);

  // When projectId changes, query backend run status and auto-subscribe if a run exists
  useEffect(() => {
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const pid = projectIdRef.current;
    if (!pid) return;
    (async () => {
      try {
        const res = await fetch(`${backendUrl}/api/run/status?projectId=${encodeURIComponent(pid)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data) return;
        if (data.runId) {
          runIdRef.current = data.runId;
          // join run room to receive updates
          socketRef.current?.emit('run.subscribe', { runId: data.runId });
          if (data.status === 'running') setRunActive(true);
          if (data.currentNodeId) setActiveNodeId(data.currentNodeId);
          if (data.storeVars) setStoreVars((prev) => ({ ...(prev || {}), ...(data.storeVars || {}) }));
          if (data.globalStoreVars) setGlobalStoreVars((prev) => ({ ...(prev || {}), ...(data.globalStoreVars || {}) }));
        }
      } catch (e) { /* ignore */ }
    })();
  }, []);

  // Wrapper for manual UI edits to storeVars so they sync with the backend
  const updateStoreVars = (newVarsOrUpdater) => {
    setStoreVars((prev) => {
      let nextVars;
      if (typeof newVarsOrUpdater === 'function') {
        nextVars = newVarsOrUpdater(prev);
      } else if (newVarsOrUpdater && typeof newVarsOrUpdater === 'object') {
        // merge incoming object into previous vars
        nextVars = { ...(prev || {}), ...newVarsOrUpdater };
      } else {
        nextVars = newVarsOrUpdater;
      }
      // Sync manual changes to the backend runner if it's currently active
      if (socketRef.current) {
        socketRef.current.emit('update_store_vars', nextVars);
      }
      return nextVars;
    });
  };

  // Trigger backend execution
  // Note: This only sets project status on server, doesn't wait for execution
  // Server's execution loop will pick up the project and run it independently
  async function runProject() {
    if (!currentProjectId) {
      console.warn('[ProjectSync] No projectId set');
      return;
    }

    if (runActive) {
      // Stop project - only sets status to 'stopped'
      console.log('[ProjectSync] Requesting project stop');
      
      // Store runId before clearing it
      const rid = runIdRef.current;
      
      // Optimistically update UI immediately
      console.log('[ProjectSync] OPTIMISTIC UPDATE: Setting runActive to FALSE');
      setRunActive(false);
      setActiveNodeId(null);
      setActiveEdgeId(null);
      runIdRef.current = null;
      
      // Send stop command to server
      socketRef.current?.emit('project_control', {
        projectId: currentProjectId,
        action: 'stop'
      });
      
      // Also try to stop via run.control if we have a runId
      if (rid && socketRef.current) {
        socketRef.current.emit('run.control', { runId: rid, event: 'stop_workflow', payload: {} });
      }
      
      return;
    }

    // Start project - only sets status to 'running'
    // Server will pick up the project and execute it independently
    console.log('[ProjectSync] Requesting project start');
    console.log('[ProjectSync] Current runActive:', runActive);
    
    // Optimistically update UI immediately
    console.log('[ProjectSync] OPTIMISTIC UPDATE: Setting runActive to TRUE');
    setRunActive(true);
    setActiveNodeId(null);
    setActiveEdgeId(null);

    const validNodes = (rfNodes || []).filter(n => n && n.id);
    const validEdges = (rfEdges || []).filter(e => e && e.id);

    // Send run command to server
    socketRef.current?.emit('project_control', {
      projectId: currentProjectId,
      action: 'run',
      nodes: validNodes,
      edges: validEdges,
      apis: apis,
      stepDelay: stepDelay
    });
  }

  const setProjectId = useCallback((id) => {
    if (projectIdRef.current === id) {
      console.log(`[ProjectSync] Already watching project ${id}, skipping`);
      return; // Already watching this project
    }
    
    // Unwatch old project
    if (projectIdRef.current && socketRef.current) {
      socketRef.current.emit('unwatch_project');
    }
    
    if (runIdRef.current && socketRef.current) {
      socketRef.current.emit('run.unsubscribe', { runId: runIdRef.current });
    }
    
    projectIdRef.current = id;
    setCurrentProjectId(id);
    runIdRef.current = null;
    setRunActive(false);
    setActiveNodeId(null);
    setActiveEdgeId(null);
  }, []);

  // When the user edits nodes/edges while workflow is running, push updates to backend
  useEffect(() => {
    if (!socketRef.current) return;
    if (!runActive) return;
    if (!currentProjectId) return;
    
    try {
      const validNodes = (rfNodes || []).filter(n => n && n.id);
      const validEdges = (rfEdges || []).filter(e => e && e.id);
      
      console.log('[ProjectSync] Pushing workflow update');
      socketRef.current.emit('update_project_workflow', { 
        projectId: currentProjectId,
        nodes: validNodes, 
        edges: validEdges 
      });
    } catch (e) { /* ignore */ }
  }, [rfNodes, rfEdges, runActive, currentProjectId]);

  // Submit a prompt to the server-side pipeline.
  // onReady(result) is called when 'workflow_ready' fires with { nodes, edges, workflowData, metadata }.
  const submitPrompt = useCallback((nodeId, promptText, apis = [], workflowData = null, onReady) => {
    promptCallbackRef.current = onReady || null;
    socketRef.current?.emit('process_prompt', { nodeId, promptText, apis, workflowData });
  }, []);

  return {
    socketRef,
    runProject,
    runActive,
    activeNodeId,
    activeEdgeId,
    storeVars,
    setStoreVars: updateStoreVars, // Export wrapped version
    submitPrompt,
    promptProcessing,
    promptStatus,
    setProjectId,
    allProjectStatuses, // Export global project statuses
    globalStoreVars,
  };
}
