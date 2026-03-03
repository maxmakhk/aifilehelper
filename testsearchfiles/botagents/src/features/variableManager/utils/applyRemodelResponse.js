export default function applyRemodelResponse(centerNodeId, remodelJson, related, full = null, deps = {}) {
  const {
    setRfNodes,
    setRfEdges,
    rfNodes,
    rfEdges,
    workflowData,
    handleAutoLayout,
    rfInstance,
  } = deps;

  if (!remodelJson || !Array.isArray(remodelJson.nodes) || !Array.isArray(remodelJson.edges)) {
    console.warn('Invalid remodelJson, expected { nodes: [], edges: [] }');
    return;
  }

  const fullFlow = full || (workflowData && Array.isArray(workflowData.nodes) ? workflowData : null);

  let baseNodes = fullFlow && Array.isArray(fullFlow.nodes)
    ? JSON.parse(JSON.stringify(fullFlow.nodes))
    : JSON.parse(JSON.stringify(rfNodes || []));
  let baseEdges = fullFlow && Array.isArray(fullFlow.edges)
    ? JSON.parse(JSON.stringify(fullFlow.edges))
    : JSON.parse(JSON.stringify(rfEdges || []));

  baseEdges = baseEdges.map((e) => ({
    ...e,
    source: e.source !== undefined && e.source !== null ? String(e.source) : String(e.from || ''),
    target: e.target !== undefined && e.target !== null ? String(e.target) : String(e.to || ''),
  }));

  const remodelNodes = JSON.parse(JSON.stringify(remodelJson.nodes || []));
  const remodelEdges = JSON.parse(JSON.stringify(remodelJson.edges || []));

  let startNodes = remodelNodes.filter((n) => n.type === 'start');
  let endNodes = remodelNodes.filter((n) => n.type === 'end');

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

  baseNodes.push(
    ...remodelNodes.map((n) => ({
      id: String(n.id),
      type: n.type || 'action',
      data: n.data || {},
      position: n.position || { x: 0, y: 0 },
      width: n.width || (n.data && n.data.width),
      height: n.height || (n.data && n.data.height),
      metadata: n.metadata || (n.data && n.data.metadata) || {},
    }))
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
    }))
  );

  let entryArr = [];
  let exitArr = [];

  try {
    if (Array.isArray(remodelJson.entryNodeIds) && remodelJson.entryNodeIds.length) {
      entryArr = remodelJson.entryNodeIds.map(String);
    }
    if (Array.isArray(remodelJson.exitNodeIds) && remodelJson.exitNodeIds.length) {
      exitArr = remodelJson.exitNodeIds.map(String);
    }

    if (entryArr.length === 0 && startNodes.length > 0) {
      entryArr = [String(startNodes[0].id)];
    }
    if (exitArr.length === 0 && endNodes.length > 0) {
      exitArr = [String(endNodes[0].id)];
    }
  } catch (err) {
    console.warn('Failed to detect entry/exit from remodelJson:', err);
  }

  try {
    const incomingIds = related?.connectedNodesIDs?.incoming || [];
    const outgoingIds = related?.connectedNodesIDs?.outgoing || [];

    try {
      const incomingEdges = baseEdges.filter(
        (e) => incomingIds.includes(String(e.source)) && String(e.target) === String(centerNodeId)
      );

      if (entryArr.length > 1 && incomingEdges.length) {
        baseEdges = baseEdges.filter(
          (e) => !(incomingIds.includes(String(e.source)) && String(e.target) === String(centerNodeId))
        );

        const clones = [];
        incomingEdges.forEach((origEdge, ei) => {
          entryArr.forEach((mappedEntry, ei2) => {
            const newId = `${String(origEdge.id)}__entry_clone_${ei}_${ei2}_${Date.now()}`;
            clones.push({ ...origEdge, id: newId, target: String(mappedEntry) });
          });
        });

        baseEdges = baseEdges.concat(clones);
      } else if (entryArr.length === 1 && incomingEdges.length) {
        baseEdges = baseEdges.map((e) => {
          if (incomingIds.includes(String(e.source)) && String(e.target) === String(centerNodeId)) {
            return { ...e, target: entryArr[0] };
          }
          return e;
        });
      }
    } catch (err) {
      console.warn('Failed to clone/rewire incoming edges:', err);
    }

    try {
      const outgoingEdges = baseEdges.filter((e) => String(e.source) === String(centerNodeId) && outgoingIds.includes(String(e.target)));

      if (exitArr.length > 1 && outgoingEdges.length) {
        baseEdges = baseEdges.filter((e) => !(String(e.source) === String(centerNodeId) && outgoingIds.includes(String(e.target))));

        const clones = [];
        outgoingEdges.forEach((origEdge, oi) => {
          exitArr.forEach((mappedExit, oi2) => {
            const newId = `${String(origEdge.id)}__exit_clone_${oi}_${oi2}_${Date.now()}`;
            clones.push({ ...origEdge, id: newId, source: String(mappedExit) });
          });
        });

        baseEdges = baseEdges.concat(clones);
      } else if (exitArr.length === 1 && outgoingEdges.length) {
        baseEdges = baseEdges.map((e) => {
          if (String(e.source) === String(centerNodeId) && outgoingIds.includes(String(e.target))) {
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

  baseNodes = baseNodes.filter((n) => String(n.id) !== String(centerNodeId));

  if (typeof setRfNodes === 'function') setRfNodes(baseNodes);
  if (typeof setRfEdges === 'function') setRfEdges(baseEdges);

  try {
    if (typeof handleAutoLayout === 'function') handleAutoLayout(baseNodes, baseEdges);
  } catch (err) {
    console.error('Auto-layout failed after remodel:', err);
    setTimeout(() => {
      try {
        if (rfInstance && typeof rfInstance.fitView === 'function') {
          rfInstance.fitView({ padding: 0.12 });
        }
      } catch (e) {}
    }, 100);
  }
}
