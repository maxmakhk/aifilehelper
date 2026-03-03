import React, { useEffect, useRef, useState } from 'react';
import './apiResultsFloating.css';

export default function ApiResultsFloating({ content = null, setContent = null, title = 'Output View' }) {
  const nodeRef = useRef(null);
  const dragRef = useRef({ dragging: false, offsetX: 0, offsetY: 0 });
  const [pos, setPos] = useState(null);
  // start collapsed/hidden by default so it doesn't cover the workflow
  const [visible, setVisible] = useState(false);

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

  useEffect(() => {
    // expose a quick helper for console testing
    try { window.setApiResultsContent = setContent || (() => {}); } catch (e) {}
    return () => { try { delete window.setApiResultsContent; } catch (e) {} };
  }, [setContent]);

  if (!visible) return (
    <div
      ref={nodeRef}
      className="ms-apiresults-floating ms-apiresults-collapsed"
      style={pos ? { left: pos.left + 'px', top: pos.top + 'px', right: 'auto', bottom: 'auto' } : { right: '50px', bottom: '12px', top: 'auto' }}
      onMouseDown={onHeaderDown}
    >
      <div className="ms-apiresults-header">
        <span>{title}</span>
        <div style={{display:'flex', gap:6}}>
          <button className="ms-apiresults-toggle" onClick={() => setVisible(true)}>▸</button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={nodeRef}
      className="ms-apiresults-floating"
      style={pos ? { left: pos.left + 'px', top: pos.top + 'px', right: 'auto', bottom: 'auto' } : { right: '50px', bottom: '12px', top: 'auto' }}
      onMouseDown={onHeaderDown}
    >
      <div className="ms-apiresults-header">
        <span>{title}</span>
        <div style={{display:'flex', gap:6}}>
          <button className="ms-apiresults-clear" onClick={() => { if (typeof setContent === 'function') setContent(null); }} title="Clear">✕</button>
          <button className="ms-apiresults-toggle" onClick={() => setVisible(false)} title="Collapse">▾</button>
        </div>
      </div>
      <div className="ms-apiresults-body">
        {content ? (
          // If content is a React node, render it directly; if string, render as HTML
          typeof content === 'string' ? (
            <div className="ms-apiresults-html" dangerouslySetInnerHTML={{ __html: content }} />
          ) : (
            <div className="ms-apiresults-node">{content}</div>
          )
        ) : (
          <div className="ms-apiresults-empty">(results will appear here)</div>
        )}
      </div>
    </div>
  );
}
