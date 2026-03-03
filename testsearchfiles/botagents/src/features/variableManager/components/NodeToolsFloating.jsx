import React, { useEffect, useRef, useState } from 'react';
import './nodeToolsFloating.css';

export default function NodeToolsFloating({ 
  onAutoLayout, 
  onDeleteSelected, 
  onGenerateFunction,
  onRun,
  runActive = false,
  onZoomIn,
  onZoomOut,
  onFitView,
  selectedCount = 0,
  hasNodes = false,
  aiLoading = false,
  rfNodes = [],
  rfEdges = [],
  onAddApiNode,
  joinEdgeMode = false,
  setJoinEdgeMode = () => {},
  selectedIds = [],
  setJoinEdgeNodeId = () => {}
}) {
  const nodeRef = useRef(null);
  const dragRef = useRef({ dragging: false, offsetX: 0, offsetY: 0 });
  const [pos, setPos] = useState(null); // { left, top } when moved

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragRef.current.dragging) return;
      const x = e.clientX - dragRef.current.offsetX;
      const y = e.clientY - dragRef.current.offsetY;
      setPos({ left: Math.max(8, x), top: Math.max(8, y) });
    };
    const handleUp = () => { dragRef.current.dragging = false; };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const onHeaderDown = (e) => {
    const el = nodeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current.dragging = true;
    dragRef.current.offsetX = e.clientX - rect.left;
    dragRef.current.offsetY = e.clientY - rect.top;
    e.preventDefault();
  };

  return (
    <div
      ref={nodeRef}
      className="ms-nodetools-floating"
      title="Node tools"
      style={pos ? { left: pos.left + 'px', top: pos.top + 'px', right: 'auto', bottom: 'auto' } : {}}
    >
      <div className="ms-nodetools-header" onMouseDown={onHeaderDown}>
        <span>Node Tools</span>
        <span className="ms-nodetools-hint">(drag)</span>
      </div>
      <div className="ms-nodetools-body">
        <div className="ms-nodetools-stats">
          <div className="ms-nodetools-stat">
            <span className="ms-nodetools-stat-label">Nodes:</span>
            <span className="ms-nodetools-stat-value">{rfNodes.length}</span>
          </div>
          <div className="ms-nodetools-stat">
            <span className="ms-nodetools-stat-label">Edges:</span>
            <span className="ms-nodetools-stat-value">{rfEdges.length}</span>
          </div>
          {selectedCount > 0 && (
            <div className="ms-nodetools-stat">
              <span className="ms-nodetools-stat-label">Selected:</span>
              <span className="ms-nodetools-stat-value">{selectedCount}</span>
            </div>
          )}
        </div>

        <div className="ms-nodetools-actions">
          <div style={{display:'flex', gap:8, flexDirection:'column'}}>
            <button 
              className="ms-nodetools-btn ms-nodetools-btn-run" 
              onClick={() => { try { if (typeof onRun === 'function') onRun(); } catch(e){} }}
              title={runActive ? 'Stop run' : 'Run workflow'}
            >
              {runActive ? '■ Stop' : '▶ Run'}
            </button>
            <button
              className="ms-nodetools-btn ms-nodetools-btn-api"
              onClick={() => {
                try {
                  if (typeof onAddApiNode === 'function') {
                    // if parent provided a direct inserter, open a simple picker via window helper
                    if (window && typeof window.vm_toggleApiNodes === 'function') window.vm_toggleApiNodes(true);
                    else window.vm_toggleApiNodes && window.vm_toggleApiNodes(true);
                  } else {
                    if (window && typeof window.vm_toggleApiNodes === 'function') window.vm_toggleApiNodes(true);
                  }
                } catch (e) {
                  try { if (window && typeof window.vm_toggleApiNodes === 'function') window.vm_toggleApiNodes(true); } catch(e){}
                }
              }}
              title="Browse Components"
            >
              Components
            </button>
          </div>

          <div style={{display:'flex', gap:8}}>
            <button 
              className="ms-nodetools-btn ms-nodetools-btn-zoom" 
              onClick={() => { try { if (typeof onZoomIn === 'function') onZoomIn(); } catch(e){} }} 
              title="Zoom in"
            >
              +
            </button>
            <button 
              className="ms-nodetools-btn ms-nodetools-btn-zoom" 
              onClick={() => { try { if (typeof onZoomOut === 'function') onZoomOut(); } catch(e){} }} 
              title="Zoom out"
            >
              −
            </button>
            <button 
              className="ms-nodetools-btn ms-nodetools-btn-layout" 
              onClick={() => { try { if (typeof onAutoLayout === 'function') onAutoLayout(rfNodes, rfEdges); } catch(e){} }} 
              disabled={!rfNodes || !rfNodes.length}
              title="Auto layout nodes"
            >
              Auto Layout
            </button>
            <button 
              className="ms-nodetools-btn ms-nodetools-btn-fit" 
              onClick={() => { try { if (typeof onFitView === 'function') onFitView(); } catch(e){} }} 
              title="Fit view to nodes"
            >
              Fit
            </button>
          </div>

          <button 
            className="ms-nodetools-btn ms-nodetools-btn-delete" 
            onClick={onDeleteSelected} 
            disabled={aiLoading || !selectedCount}
            title="Delete selected node(s) or edge(s)"
          >
            Delete Selected
          </button>

          <button 
            className={`ms-nodetools-btn ${joinEdgeMode ? 'ms-nodetools-btn-active' : 'ms-nodetools-btn-join'}`}
            onClick={() => {
              if (!selectedIds || !selectedIds.length) {
                alert('Select a node first.');
                return;
              }
              if (!joinEdgeMode) {
                // Entering join edge mode: store the selected node ID
                setJoinEdgeNodeId(selectedIds[0]);
              } else {
                // Exiting join edge mode: clear stored ID
                setJoinEdgeNodeId(null);
              }
              setJoinEdgeMode(!joinEdgeMode);
            }}
            disabled={aiLoading || !selectedIds || !selectedIds.length}
            title="Join selected node into an edge (click an edge to insert node)"
          >
            {joinEdgeMode ? '⚡ Join Mode' : 'Join Edge'}
          </button>

          <button 
            className="ms-nodetools-btn ms-nodetools-btn-generate" 
            onClick={onGenerateFunction} 
            disabled={aiLoading || !hasNodes}
            title="Generate function from workflow"
          >
            Flow → Fn
          </button>
        </div>

        {!hasNodes && (
          <div className="ms-nodetools-empty">
            Canvas is blank — use "Components" to create a workflow.
          </div>
        )}
      </div>
    </div>
  );
}
