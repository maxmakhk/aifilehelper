import dagre from 'dagre';

export function getLayoutedNodesAndEdges(nodes = [], edges = [], direction = 'TB') {
  // create a fresh graph for each layout run to avoid stale state
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  const rankDir = direction || 'TB';
  let graphConfig = { 
    rankdir: rankDir, 
    // tuned spacing: reduce rank and node separation for tighter layouts
    ranksep: direction === 'TB' ? 120 : 80,
    nodesep: direction === 'LR' ? 100 : 60,
    marginx: 20, marginy: 20 
    };
    console.log('Running auto-layout with config:', graphConfig);
  dagreGraph.setGraph(graphConfig);

  // Default node size (smaller for denser layouts)
  const defaultNodeWidth = 240;
  const defaultNodeHeight = 100;

  // add nodes to dagre with measured or default sizes
  nodes.forEach((node) => {
    const measuredW = (node?.data && node.data.width) ? Number(node.data.width) : defaultNodeWidth;
    const measuredH = (node?.data && node.data.height) ? Number(node.data.height) : defaultNodeHeight;
    dagreGraph.setNode(node.id, { width: Math.max(100, measuredW), height: Math.max(60, measuredH) });
  });

  // add edges
  edges.forEach((edge) => {
    try { dagreGraph.setEdge(edge.source, edge.target); } catch (e) { /* ignore bad edges */ }
  });

  // run layout
  try {
    dagre.layout(dagreGraph);
  } catch (err) {
    // layout failed — return original
    return { nodes, edges };
  }

  const layoutedNodes = nodes.map((node) => {
    const n = dagreGraph.node(node.id);
    if (!n) return node;
    const w = (node?.data && node.data.width) ? Number(node.data.width) : defaultNodeWidth;
    const h = (node?.data && node.data.height) ? Number(node.data.height) : defaultNodeHeight;
    const position = {
      x: n.x - w / 2,
      y: n.y - h / 2
    };

    return {
      ...node,
      position,
      // keep data intact
      data: { ...(node.data || {}) }
    };
  });

  // Assign edge handles based on layout direction so edges attach to appropriate sides
  const layoutedEdges = (edges || []).map((edge) => {
    try {
      const out = { ...(edge || {}) };
      // Only set explicit handles for LR layouts. For TB (default) we leave handles undefined
      // so React Flow will use the default Top/Bottom positions without requiring handle ids.
      if (rankDir === 'LR') {
        if (!out.sourceHandle) out.sourceHandle = 'right';
        if (!out.targetHandle) out.targetHandle = 'left';
      }
      return out;
    } catch (e) {
      return edge;
    }
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

export default getLayoutedNodesAndEdges;
