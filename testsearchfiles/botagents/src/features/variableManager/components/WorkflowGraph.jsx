import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap, Handle, Position } from 'reactflow';
import copperSquareBg from '../../../assets/copper_square_a.jpg';
import badge2 from '../../../assets/badge_2.png';
import badge4 from '../../../assets/badge_4.png';
import 'reactflow/dist/style.css';
import NodeToolsFloating from './NodeToolsFloating';

// Module-level node component to keep a stable reference for React Flow
const injectedCssMap = new Map();

const ensureInjectedCss = (cssText) => {
  if (!cssText) return;
  try {
    if (injectedCssMap.has(cssText)) return;
    const el = document.createElement('style');
    el.setAttribute('data-vm-api-css', '1');
    el.innerHTML = cssText;
    document.head.appendChild(el);
    injectedCssMap.set(cssText, el);
  } catch (e) {
    // ignore
  }
};

// EditFnButton: opens a popup to view/edit node.data.fnString and save back to nodes
const EditFnButton = ({ onNodeId, rfNodes = [], updateNodeData = () => {}, apis = [] }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const handleClick = (ev) => {
    ev.stopPropagation();
    const node = Array.isArray(rfNodes) ? rfNodes.find(n => String(n.id) === String(onNodeId)) : null;
    const current = (node && (node.data?.fnString || node.data?.metadata?.function || node.metadata?.function)) || '';
    setText(current || '');
    setOpen(true);
  };

  const handleCancel = () => { setOpen(false); setText(''); };

  const handleLoadDefault = () => {
    const node = Array.isArray(rfNodes) ? rfNodes.find(n => String(n.id) === String(onNodeId)) : null;
    if (!node) {
      alert('Node not found');
      return;
    }
    // First try to get from node.metadata.function (stored when node was created)
    // Then try node.data.metadata.function
    // Then try to find in apis array if available
    let defaultFn = node.metadata?.function || node.data?.metadata?.function || '';
    
    // If not found and apis available, try to look up by apiId
    if (!defaultFn && Array.isArray(apis) && apis.length > 0) {
      const apiId = node.metadata?.apiId || node.data?.metadata?.apiId;
      if (apiId) {
        const api = apis.find(a => String(a.id) === String(apiId));
        defaultFn = api ? (api.function || api.fnString) : '';
      }
    }
    
    if (defaultFn) {
      setText(String(defaultFn));
    } else {
      alert('No default function found for this component.');
    }
  };

  const handleSave = () => {
    try {
      const node = Array.isArray(rfNodes) ? rfNodes.find(n => String(n.id) === String(onNodeId)) : null;
      if (!node) return;
      const newData = { ...(node.data || {}), fnString: text };
      const newMeta = { ...(node.metadata || {}), function: text };
      const updates = { data: newData, metadata: newMeta };
      if (typeof updateNodeData === 'function') {
        updateNodeData(onNodeId, updates);
      }
    } catch (e) { console.error('EditFnButton save error:', e); }
    setOpen(false);
    setText('');
  };

  return (
    <div>
      <button title="Edit function" onClick={handleClick} style={{backgroundColor:'#021827', border:'none', cursor:'pointer', fontSize:12}}>✏️</button>
      {open && (
        <div style={{position:'absolute', left: '50px', top: '-220px', zIndex: 9999, background:'#021827', border:'1px solid #13353b', padding:8, borderRadius:6, minWidth:420}} onClick={(e) => e.stopPropagation()}>
          <div style={{fontSize:'0.85rem', color:'#9fd6e1', marginBottom:6}}>Edit node function (fnString)</div>
          <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} style={{width:'100%', resize:'vertical', background:'#071427', color:'#e6f6ff', border:'1px solid #13353b', padding:6, borderRadius:4}} placeholder="Paste function body here" />
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:6}}>
            <button className="btn-cancel" onClick={handleCancel}>Close</button>
            <button className="btn-secondary" onClick={handleLoadDefault} title="Load original component function">Default Function</button>
            <button className="btn-primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
};

const defaultNodeCss = `.api-node {
  font-weight: 700;
  color: #ffffff;
  font-size: 14px;
  line-height: 1.1;
  text-shadow: 0 -1px 0 rgba(255, 255, 255, 0.28), 0 2px 6px rgba(0, 0, 0, 0.65);
  transform: translateY(1px);
}`;

const WorkflowNode = ({ id, data }) => {
  const actions = Array.isArray(data?.actions) ? data.actions : [];
  const onOpenActionRule = data?.onOpenActionRule;
  const onToggleNodeLock = data?.onToggleNodeLock;
  const onNodePromptSubmit = data?.onNodePromptSubmit;
  const onGetRelated = data?.getRelated;
  const rfNodes = data?.rfNodes;
  const rfEdges = data?.rfEdges;
  const activeNodeId = data?.activeNodeId;

  const isEntryNode = !!(data?.metadata?.sourceRuleId || data?.metadata?.entryForRuleId || String(data?.labelText || '').startsWith('Entry:'));
  const isActive = String(id) === String(activeNodeId);
  
  // Calculate width and height from component size metadata (format: "width:height" like "3:1", "2:2")
  // Use pre-calculated values from data if available, otherwise calculate from size ratio
  let nodeWidth = data?.width || 220;
  let nodeHeight = data?.height || 64;
  
  if (!data?.width && data?.metadata?.size) {
    const sizeRatio = data.metadata.size;
    const [widthRatio, heightRatio] = sizeRatio.split(':').map(n => parseInt(n) || 1);
    nodeWidth = widthRatio * 64;
    nodeHeight = heightRatio * 64;
    console.log(`[WorkflowNode ${id}] Calculated size from ratio ${sizeRatio}: ${nodeWidth}x${nodeHeight}px`);
  }
  
  const bgColor = data?.backgroundColor || (isEntryNode ? '#fffbeb' : '#ffffff');
  const textColor = data?.textColor || (isEntryNode ? '#92400e' : '#0f172a');
  let containerStyle = {
    position: 'relative',
    width: nodeWidth,
    minHeight: nodeHeight,
    padding: 0,
    background: bgColor,
    color: textColor,
    borderRadius: 8,
    border: isEntryNode ? '1px solid #fde68a' : undefined,
    boxShadow: isEntryNode ? '0 6px 18px rgba(250,204,21,0.12)' : '0 6px 18px rgba(2,6,23,0.4)',
    filter: isActive ? 'brightness(1.5) contrast(1.30)' : undefined,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center'
  };

  // If API supplied CSS is present, avoid inline background/color/border/boxShadow
  const cssTextPresent = Boolean(data?.metadata?.cssStyle);
  if (cssTextPresent) {
    delete containerStyle.background;
    delete containerStyle.color;
    delete containerStyle.border;
    delete containerStyle.boxShadow;
  }

  const extractActionLabel = (label) => {
    const first = String(label || '').split('\n')[0] || '';
    return first.replace(/^Entry:\s*/i, '').trim();
  };

  const renderActionRow = (a, i) => {
    const actionName = (typeof a === 'string') ? a : (a.action || a.name || 'action');
    const linked = (typeof a === 'string') ? false : (!!(a.linkedRuleId || a.ruleId || a.linkedRuleName || a.name));
    return (
      <div key={`act_${i}`} style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding: '4px 6px', borderRadius:6, background: isEntryNode ? 'rgba(250, 204, 21, 0.04)' : 'transparent', marginTop: i === 0 ? 8 : 6}} onClick={(ev) => ev.stopPropagation()}>
        <div style={{fontSize: '0.85rem', color: isEntryNode ? '#92400e' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160}} title={actionName}>{actionName}</div>
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          {linked && (
            <button
              className="open-linked-rule-btn"
              title="Open linked rule"
              onClick={(ev) => { ev.stopPropagation(); if (typeof onOpenActionRule === 'function') onOpenActionRule(a); }}
              style={{backgroundColor: '#021827', border: 'none', cursor: 'pointer', color: isEntryNode ? '#92400e' : '#0ea5b7', fontSize: 16}}
            >
              🔗
            </button>
          )}
        </div>
      </div>
    );
  };

  const flowInstanceRef = useRef(null);

  const localZoomIn = useCallback(() => {
    try { flowInstanceRef.current?.zoomIn?.(); } catch (e) {}
  }, []);
  const localZoomOut = useCallback(() => {
    try { flowInstanceRef.current?.zoomOut?.(); } catch (e) {}
  }, []);
  const localFitView = useCallback(() => {
    try { flowInstanceRef.current?.fitView?.(); } catch (e) {}
  }, []);

  const handleInit = (inst) => {
    flowInstanceRef.current = inst;
    try { if (typeof onInitFlow === 'function') onInitFlow(inst); } catch (e) {}
  };

  const handleBaseStyle = {
    width: 18,
    height: 18,
    borderRadius: 9,
    border: 'none',
    boxShadow: 'none',
    backgroundSize: 'contain',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  };

  const imageName = data?.metadata?.image || data?.metadata?.icon;
  const hasIcon = !!imageName;
  let imageUrl = null;
  if (hasIcon) {
    const asStr = String(imageName || '').trim();
    imageUrl = asStr.startsWith('http://') || asStr.startsWith('https://') ? asStr : `https://www.maxsolo.co.uk/images/${asStr}`;
  }
  const fallbackImageUrl = imageUrl || (!cssTextPresent ? copperSquareBg : null);
  if (fallbackImageUrl) {
    containerStyle.backgroundImage = `url('${fallbackImageUrl}')`;
    containerStyle.backgroundSize = '100% 100%';
    containerStyle.backgroundPosition = 'center';
    containerStyle.backgroundRepeat = 'no-repeat';
  }

  // Apply CSS from API metadata when present
  const cssText = data?.metadata?.cssStyle;
  useEffect(() => { ensureInjectedCss(defaultNodeCss); }, []);
  useEffect(() => { if (cssText) ensureInjectedCss(cssText); }, [cssText]);

  const extraClass = 'api-node';
  const apiIdClass = data?.metadata?.apiId ? `api-node-${String(data.metadata.apiId).replace(/[^a-z0-9_-]/gi, '')}` : '';

  // local state to cycle through a single parameter of input/output signals
  const [inParamIdx, setInParamIdx] = useState(0);
  const [outParamIdx, setOutParamIdx] = useState(0);

  const getEntries = (sig) => {
    if (sig == null) return [];
    if (typeof sig !== 'object') return [['value', sig]];
    try {
      const e = Object.entries(sig || {});
      return e.length ? e : [];
    } catch (e) { return [] }
  };

  // attempt to read signals from several possible locations: node.data, node.metadata, runtime storeVars
  const storeVars = data?.storeVars || {};
  const keyPrefix = `node_${id}_`;
  const inputSignal = data?.input || data?.metadata?.input || storeVars[`${keyPrefix}input`] || storeVars[`${keyPrefix}in`];
  const outputSignal = data?.output || data?.metadata?.output || storeVars[`${keyPrefix}output`] || storeVars[`${keyPrefix}out`];
  const inEntries = getEntries(inputSignal);
  const outEntries = getEntries(outputSignal);
  const shortVal = (v) => {
    if (v == null) return '-';
    if (typeof v === 'object') {
      if (v.status) return String(v.status);
      try { return JSON.stringify(v).slice(0, 40); } catch (e) { return String(v); }
    }
    return String(v).slice(0, 40);
  };

  return (
    <div style={containerStyle} className={`entry-btn ${extraClass} ${apiIdClass}`.trim()}>
      {/* lock button + prompt icon top-right */}
      <div style={{position:'absolute', right:2, top:2, display:'flex', gap:2, flexDirection: 'row'}}>
        <button
          title={data?.locked || data?.metadata?.locked ? 'Unlock node' : 'Lock node'}
          onClick={(ev) => { ev.stopPropagation(); try { if (typeof onToggleNodeLock === 'function') onToggleNodeLock(id); } catch(e){} }}
          style={{backgroundColor:'#021827', border:'none', cursor:'pointer', fontSize:12}}
        >
          {data?.locked || data?.metadata?.locked ? '🔒' : '🔓'}
        </button>
        <PromptButton onNodeId={id} onSubmit={onNodePromptSubmit} onGetRelated={onGetRelated} rfNodes={rfNodes} rfEdges={rfEdges} />
        <EditFnButton onNodeId={id} rfNodes={rfNodes} updateNodeData={data?.updateNodeData} apis={data?.apis} />
      </div>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          ...handleBaseStyle,
          backgroundImage: `url('${badge2}')`,
          transform: 'translateY(-6px)'
        }}
      />
      {/* Left / Right handles to support LR layouts and explicit handle attachment */}
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        style={{
          ...handleBaseStyle,
          backgroundImage: `url('${badge2}')`,
          transform: 'translateX(-6px)'
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          ...handleBaseStyle,
          backgroundImage: `url('${badge4}')`,
          transform: 'translateY(6px)'
        }}
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        style={{
          ...handleBaseStyle,
          backgroundImage: `url('${badge4}')`,
          transform: 'translateX(6px)'
        }}
      />
      <div style={{display: 'flex', flexDirection: 'row', gap: 10, alignItems: 'stretch'}}>
        <div style={{textAlign: 'center', flex: 1, padding: 8}}>
          {(() => {
            const rawLabel = String(data?.labelText || data?.label || 'Step').split('\n')[0] || '';
            const displayLabel = rawLabel.replace(/^API:\s*/i, '').trim();
            return <div style={{fontWeight:700, fontSize:'1rem'}}>{displayLabel}</div>;
          })()}
        {((String(data?.labelText || data?.label || '').split('\n').slice(1).join(' ') || data?.metadata?.ruleId) && (
          <div title={data?.metadata?.ruleId || undefined} style={{fontSize: '0.7rem', color: isEntryNode ? '#92400e' : '#6b7280', marginTop: 6, lineHeight: 1.05, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
            {(String(data?.labelText || data?.label || '').split('\n').slice(1).join(' ') || data?.metadata?.ruleId)}
          </div>
        ))}
      </div>
      </div>
      {actions && actions.length > 0 && (
        <div style={{display: 'flex', flexDirection: 'column', marginTop: 8}}>
          {actions.slice(0, 6).map((a, i) => renderActionRow(a, i))}
          {actions.length > 6 && (
            <div style={{fontSize:'0.75rem', color:'#9ca3af', marginTop:6}}>+{actions.length - 6} more</div>
          )}
        </div>
      )}

    </div>
  );
};

const NODE_TYPES = {
  default: WorkflowNode,
  start: WorkflowNode,
  workflowNode: WorkflowNode,
  api: WorkflowNode,
  action: WorkflowNode,
  loop: WorkflowNode,
  condition: WorkflowNode,
  decision: WorkflowNode,
  parallel: WorkflowNode,
  transform: WorkflowNode,
  end: WorkflowNode
};

// Prompt button + small popup positioned near cursor (top-right)
const PromptButton = ({ onNodeId, onSubmit, onGetRelated, rfNodes, rfEdges }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const handleClick = (ev) => {
    ev.stopPropagation();
    const related = (typeof onGetRelated === 'function') ? onGetRelated(onNodeId) : { relatedNode: [], relatedEdge: [] };
    // compute connected node ids from rfEdges
    const allEdges = Array.isArray(rfEdges) ? rfEdges : [];
    const incomingIds = Array.from(new Set(allEdges.filter((e) => String(e.target) === String(onNodeId)).map((e) => String(e.source))));
    const outgoingIds = Array.from(new Set(allEdges.filter((e) => String(e.source) === String(onNodeId)).map((e) => String(e.target))));
    const connectedNodesIDs = { incoming: incomingIds, outgoing: outgoingIds };

    console.log('Prompt icon clicked - full data:', {
      nodeId: onNodeId,
      related,
      full: {
        nodes: rfNodes || [],
        edges: rfEdges || []
      },
      connectedNodesIDs
    });
    setOpen(true);
  };

  const handleCancel = () => { setOpen(false); setText(''); };

  const handleSubmit = () => {
    try {
      const related = (typeof onGetRelated === 'function') ? onGetRelated(onNodeId) : { relatedNode: [], relatedEdge: [] };
      const allEdges = Array.isArray(rfEdges) ? rfEdges : [];
      const incomingIds = Array.from(new Set(allEdges.filter((e) => String(e.target) === String(onNodeId)).map((e) => String(e.source))));
      const outgoingIds = Array.from(new Set(allEdges.filter((e) => String(e.source) === String(onNodeId)).map((e) => String(e.target))));
      const connectedNodesIDs = { incoming: incomingIds, outgoing: outgoingIds };
      const relatedWithConnected = { ...(related || {}), connectedNodesIDs };
      if (typeof onSubmit === 'function') onSubmit(onNodeId, text, relatedWithConnected);
      else console.log('Prompt submit:', onNodeId, text, relatedWithConnected);
    } catch (e) { console.error(e); }
    setOpen(false);
    setText('');
  };

  return (
    <div>
      <button title="Prompt" onClick={handleClick} style={{backgroundColor:'#021827', border:'none', cursor:'pointer', fontSize:12}}>💬</button>
      {open && (
        <div style={{position:'absolute', left: '50px', top: '-130px', zIndex: 9999, background:'#021827', border:'1px solid #13353b', padding:8, borderRadius:6, minWidth:220}} onClick={(e) => e.stopPropagation()}>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} style={{width:'100%', resize:'none', background:'#071427', color:'#e6f6ff', border:'1px solid #13353b', padding:6, borderRadius:4}} placeholder="Type prompt..." />
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:6}}>
            <button className="btn-cancel" onClick={handleCancel}>Close</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={!text.trim()}>Submit</button>
          </div>
        </div>
      )}
    </div>
  );
};

const WorkflowGraph = ({
  rfNodes,
  rfEdges,
  apis = [],
  onAddApiNode,
  setRfNodes,
  setRfEdges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  onEdgeDoubleClick,
  onNodeDoubleClick,
  onNodeClick,
  edgeEdit,
  onCommitEdgeLabel,
  cancelEdgeEdit,
  onDeleteSelected,
  onGenerateFunction,
  onRun,
  runActive,
  onZoomIn,
  onZoomOut,
  onFitView,
  onInitFlow,
  onOpenActionRule,
  onToggleNodeLock,
  onAutoLayout,
  onNodePromptSubmit,
  layoutDirection,
  selectedCount,
  activeNodeId,
  activeEdgeId,
  aiLoading,
  storeVars,
  setStoreVars,
  selectedIds = []
}) => {
  const hasNodes = rfNodes && rfNodes.length > 0;

  const [localEdgeText, setLocalEdgeText] = useState('');
  const [joinEdgeMode, setJoinEdgeMode] = useState(false);
  const [joinEdgeNodeId, setJoinEdgeNodeId] = useState(null);
  useEffect(() => {
    if (edgeEdit && edgeEdit.label !== undefined) setLocalEdgeText(edgeEdit.label);
    else setLocalEdgeText('');
  }, [edgeEdit]);

  // Create a handler to update a specific node's data
  const updateNodeData = useCallback((nodeId, updates) => {
    if (typeof setRfNodes === 'function') {
      setRfNodes((prevNodes) => {
        return prevNodes.map(n => {
          if (String(n.id) !== String(nodeId)) return n;
          return { ...n, ...updates };
        });
      });
    }
  }, [setRfNodes]);

  // Join edge: insert selected node into an edge, splitting it into two edges
  const handleJoinEdge = useCallback((edge) => {
    if (!edge || !setRfEdges || !setRfNodes) return;
    // Use joinEdgeNodeId if available (preserved when entering mode), fallback to selectedIds
    const nodeId = joinEdgeNodeId || selectedIds[0];
    const selectedNode = Array.isArray(rfNodes) ? rfNodes.find(n => String(n.id) === String(nodeId)) : null;
    if (!selectedNode) {
      alert('Select a node first.');
      setJoinEdgeMode(false);
      setJoinEdgeNodeId(null);
      return;
    }

    const sourceNode = rfNodes.find(n => String(n.id) === String(edge.source));
    const targetNode = rfNodes.find(n => String(n.id) === String(edge.target));
    if (!sourceNode || !targetNode) {
      alert('Edge endpoints not found.');
      setJoinEdgeMode(false);
      setJoinEdgeNodeId(null);
      return;
    }

    // Position selected node at midpoint
    const midX = (sourceNode.position.x + targetNode.position.x) / 2;
    const midY = (sourceNode.position.y + targetNode.position.y) / 2;

    setRfNodes((prev) =>
      prev.map(n => (String(n.id) === String(selectedNode.id) ? { ...n, position: { x: midX, y: midY } } : n))
    );

    // Split edge: remove original, add two new edges
    const idA = `${edge.id}__a_${Date.now()}`;
    const idB = `${edge.id}__b_${Date.now()}`;
    const newEdgeA = { ...edge, id: idA, source: edge.source, target: selectedNode.id };
    const newEdgeB = { ...edge, id: idB, source: selectedNode.id, target: edge.target };

    setRfEdges((prev) => [...prev.filter(e => String(e.id) !== String(edge.id)), newEdgeA, newEdgeB]);
    setJoinEdgeMode(false);
    setJoinEdgeNodeId(null); // Clear stored node ID after inserting
  }, [rfNodes, selectedIds, joinEdgeNodeId, setRfNodes, setRfEdges, setJoinEdgeMode, setJoinEdgeNodeId]);

  const nodesWithHandlers = useMemo(() => {
    return (rfNodes || []).map((n) => ({
      ...n,
      // make the outer react-flow node wrapper transparent so our inner
      // `data.backgroundColor` shows without a white border/margin
      style: {
        ...(n.style || {}),
        background: 'transparent',
        padding: 0,
        border: 'none',
        boxShadow: 'none'
      },
      data: {
        ...(n.data || {}),
        // ensure actions are available on data.actions whether they were stored
        // on the node as `n.actions` (legacy) or `n.data.actions` (preferred)
        actions: Array.isArray(n.data?.actions) ? n.data.actions : (Array.isArray(n.actions) ? n.actions : n.data?.actions),
        onOpenActionRule,
        onToggleNodeLock,
        onNodePromptSubmit,
        updateNodeData,
        rfNodes,
        rfEdges,
        apis,
        activeNodeId,
        activeEdgeId,
        storeVars,
        setStoreVars,
        // provide a helper to collect related nodes and edges for this node
        getRelated: (nodeId) => {
          const nodesArr = Array.isArray(rfNodes) ? rfNodes : [];
          const edgesArr = Array.isArray(rfEdges) ? rfEdges : [];
          const clicked = nodesArr.find((nn) => String(nn.id) === String(nodeId));
          const relatedEdge = edgesArr.filter((e) => String(e.source) === String(nodeId) || String(e.target) === String(nodeId));
          return { relatedNode: clicked ? [clicked] : [], relatedEdge };
        }
      }
    }));
  }, [rfNodes, rfEdges, onOpenActionRule, onToggleNodeLock, onNodePromptSubmit, activeNodeId, activeEdgeId]);

  const edgesWithHighlight = useMemo(() => {
    return (rfEdges || []).map((e) => {
      const isActive = String(e.id) === String(activeEdgeId);
      
      // Detect backward/cycle edges. For TB layouts check vertical ordering; for LR check horizontal ordering.
      const sourceNode = (rfNodes || []).find(n => String(n.id) === String(e.source));
      const targetNode = (rfNodes || []).find(n => String(n.id) === String(e.target));
      let isBackwardEdge = false;
      if (sourceNode && targetNode && sourceNode.position && targetNode.position) {
        if (layoutDirection === 'LR') {
          isBackwardEdge = targetNode.position.x <= sourceNode.position.x;
        } else {
          isBackwardEdge = targetNode.position.y <= sourceNode.position.y;
        }
      }
      
      const edgeType = e.type || 'smoothstep';
      const pathOptions = isBackwardEdge ? { offset: 40, borderRadius: 20 } : { borderRadius: 20 };
      return {
        ...e,
        type: edgeType,
        pathOptions,
        style: {
          ...(e.style || {}),
          stroke: isActive ? '#f59e0b' : undefined,
          strokeWidth: isActive ? 3 : undefined,
          filter: isActive ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.6))' : undefined
        }
      };
    });
  }, [rfEdges, activeEdgeId, rfNodes, layoutDirection]);

  // capture React Flow instance for local view controls when parent handlers are not provided
  const flowInstanceRef = useRef(null);
  const localZoomIn = useCallback(() => { try { flowInstanceRef.current?.zoomIn?.(); } catch (e) {} }, []);
  const localZoomOut = useCallback(() => { try { flowInstanceRef.current?.zoomOut?.(); } catch (e) {} }, []);
  const localFitView = useCallback(() => { try { flowInstanceRef.current?.fitView?.(); } catch (e) {} }, []);
  const handleInit = (inst) => { flowInstanceRef.current = inst; try { if (typeof onInitFlow === 'function') onInitFlow(inst); } catch (e) {} };

  return (
    <div style={{marginTop:12, border:'1px solid #1f2937', borderRadius:8, background:'#020817', padding:10}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
        <strong>Task Function &gt; Visual Workflow</strong>
        <div style={{fontSize:'0.85em', color:'#9ca3af'}}>{rfNodes.length} node(s), {rfEdges.length} edge(s)</div>
      </div>
      <div style={{height: 660, overflow: 'hidden'}}>
        <ReactFlow
          nodes={nodesWithHandlers}
          edges={edgesWithHighlight}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeClick={onNodeClick}
          onEdgeClick={(evt, edge) => { if (joinEdgeMode) { evt?.preventDefault?.(); handleJoinEdge(edge); } }}
          onInit={handleInit}
          zoomOnScroll={false}
          panOnScroll={false}
          defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
        >
          <MiniMap style={{ left: 10, right: 'auto', bottom: 10 }} />
          <Background />
        </ReactFlow>
      </div>

      {/* Inline edge label editor (positioned near click) */}
      {typeof edgeEdit !== 'undefined' && edgeEdit && (
        <div style={{position:'fixed', left: edgeEdit.x, top: edgeEdit.y, zIndex: 10000}} onClick={(e) => e.stopPropagation()}>
          <div style={{background:'#021827', border:'1px solid #13353b', padding:8, borderRadius:6, minWidth:220}}>
            <div style={{fontSize:'0.85rem', color:'#9dd3ff', marginBottom:6}}>Edit edge label</div>
            <input autoFocus value={localEdgeText} onChange={(e) => setLocalEdgeText(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); try { if (typeof onCommitEdgeLabel === 'function') onCommitEdgeLabel(edgeEdit.id, localEdgeText); } catch(e){} }
              if (e.key === 'Escape') { try { if (typeof cancelEdgeEdit === 'function') cancelEdgeEdit(); } catch(e){} }
            }} style={{width: '100%', padding:6, borderRadius:4, border:'1px solid #13353b', background:'#071427', color:'#e6f6ff'}} />
            <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:8}}>
              <button className="btn-cancel" onClick={() => { try { if (typeof cancelEdgeEdit === 'function') cancelEdgeEdit(); } catch(e){} }}>Cancel</button>
              <button className="btn-primary" onClick={() => { try { if (typeof onCommitEdgeLabel === 'function') onCommitEdgeLabel(edgeEdit.id, localEdgeText); } catch(e){} }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating node tools panel */}
      <NodeToolsFloating
        onAutoLayout={onAutoLayout}
        onDeleteSelected={onDeleteSelected}
        onGenerateFunction={onGenerateFunction}
        onRun={onRun}
        runActive={runActive}
        onZoomIn={onZoomIn || localZoomIn}
        onZoomOut={onZoomOut || localZoomOut}
        onFitView={onFitView || localFitView}
        selectedCount={selectedCount}
        hasNodes={hasNodes}
        aiLoading={aiLoading}
        rfNodes={rfNodes}
        rfEdges={rfEdges}
        apis={apis}
        onAddApiNode={onAddApiNode}
        joinEdgeMode={joinEdgeMode}
        setJoinEdgeMode={setJoinEdgeMode}
        selectedIds={selectedIds}
        setJoinEdgeNodeId={setJoinEdgeNodeId}
      />
    </div>
  );
};

export default WorkflowGraph;
