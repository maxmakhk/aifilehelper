import React, { useEffect, useRef, useState } from 'react';
import './apiNodesFloating.css';

export default function ApiNodesFloating({ apis = [], onInsert = () => {}, onClose = () => {} }) {
  const nodeRef = useRef(null);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState({ right: 400, top: 80 });
  const injectedRef = useRef(new Map());
  const draggingRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (draggingRef.current) {
        try {
          if (draggingRef.current.onMove) window.removeEventListener('mousemove', draggingRef.current.onMove);
          if (draggingRef.current.onUp) window.removeEventListener('mouseup', draggingRef.current.onUp);
          if (draggingRef.current.onMove) window.removeEventListener('touchmove', draggingRef.current.onMove);
          if (draggingRef.current.onUp) window.removeEventListener('touchend', draggingRef.current.onUp);
        } catch (e) {}
      }
      document.body.style.userSelect = '';
    };
  }, []);

  // Keep injected styles in sync: remove styles for APIs that disappeared and cleanup on unmount
  useEffect(() => {
    try {
      const current = new Set((apis || []).map(a => a.id || (a.name || 'api').replace(/\W+/g, '_') + '_' + String(a.url || '').slice(0, 8)));
      // remove any injected styles that are no longer present
      for (const [k, v] of Array.from(injectedRef.current.entries())) {
        if (!current.has(k)) {
          try { if (v && v.styleEl && v.styleEl.parentNode) v.styleEl.parentNode.removeChild(v.styleEl); } catch(e){}
          injectedRef.current.delete(k);
        }
      }
    } catch (e) {
      // ignore
    }
    return () => {
      // on unmount, remove all injected
      try {
        for (const [k, v] of Array.from(injectedRef.current.entries())) {
          try { if (v && v.styleEl && v.styleEl.parentNode) v.styleEl.parentNode.removeChild(v.styleEl); } catch(e){}
        }
      } catch (e) {}
      injectedRef.current.clear();
    };
  }, [apis]);

  const filtered = (apis || []).filter(a => {
    if (!query) return true;
    const q = String(query).toLowerCase();
    return String(a.name || a.label || '').toLowerCase().includes(q) || (Array.isArray(a.tags) && a.tags.join(',').toLowerCase().includes(q));
  });

  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRight = pos.right;
    const startTop = pos.top;

    const onMove = (ev) => {
      const clientX = ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] && ev.touches[0].clientX);
      const clientY = ev.clientY != null ? ev.clientY : (ev.touches && ev.touches[0] && ev.touches[0].clientY);
      if (clientX == null || clientY == null) return;
      const dx = clientX - startX;
      const dy = clientY - startY;
      const newRight = Math.max(0, Math.round(startRight - dx));
      const newTop = Math.max(0, Math.round(startTop + dy));
      setPos({ right: newRight, top: newTop });
    };

    const onUp = () => {
      try { window.removeEventListener('mousemove', onMove); } catch (e) {}
      try { window.removeEventListener('mouseup', onUp); } catch (e) {}
      draggingRef.current = null;
      document.body.style.userSelect = '';
    };

    draggingRef.current = { onMove, onUp };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleTouchStart = (e) => {
    const t = (e.touches && e.touches[0]);
    if (!t) return;
    const startX = t.clientX;
    const startY = t.clientY;
    const startRight = pos.right;
    const startTop = pos.top;

    const onMove = (ev) => {
      ev.preventDefault();
      const clientX = ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] && ev.touches[0].clientX);
      const clientY = ev.clientY != null ? ev.clientY : (ev.touches && ev.touches[0] && ev.touches[0].clientY);
      if (clientX == null || clientY == null) return;
      const dx = clientX - startX;
      const dy = clientY - startY;
      const newRight = Math.max(0, Math.round(startRight - dx));
      const newTop = Math.max(0, Math.round(startTop + dy));
      setPos({ right: newRight, top: newTop });
    };

    const onUp = () => {
      try { window.removeEventListener('touchmove', onMove); } catch (e) {}
      try { window.removeEventListener('touchend', onUp); } catch (e) {}
      draggingRef.current = null;
      document.body.style.userSelect = '';
    };

    draggingRef.current = { onMove, onUp };
    document.body.style.userSelect = 'none';
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  return (
    <div ref={nodeRef} className="ms-apinodes-floating" style={{ right: pos.right + 'px', top: pos.top + 'px' }}>
      <div className="ms-apinodes-header" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} style={{ cursor: 'grab' }}>
        <div style={{fontWeight:700}}>API Nodes</div>
        <div style={{display:'flex', gap:8}}>
          <button onClick={onClose} className="ms-apinodes-close">✕</button>
        </div>
      </div>
      <div className="ms-apinodes-search">
        <input placeholder="Filter APIs..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="ms-apinodes-list">
        {filtered.map((a) => {
          // ensure css injected for this api if provided
          const apiId = a.id || (a.name || 'api').replace(/\W+/g, '_') + '_' + String(a.url || '').slice(0, 8);
          const metaCss = a.metadata && a.metadata.cssStyle ? String(a.metadata.cssStyle) : (a.cssStyle ? String(a.cssStyle) : null);
          let apiClass = '';
          try {
            const injected = injectedRef.current.get(apiId);
            if (!injected && metaCss) {
              const className = `ms-api-css-${apiId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
              const scoped = metaCss.replace(/\.api-node\b/g, `.${className}`);
              const styleEl = document.createElement('style');
              styleEl.setAttribute('data-ms-api-css', apiId);
              styleEl.innerText = scoped;
              document.head.appendChild(styleEl);
              injectedRef.current.set(apiId, { styleEl, className });
              apiClass = className;
            } else if (injected) {
              apiClass = injected.className;
            }
          } catch (err) {
            // ignore injection errors
          }

          return (
            <div key={a.id || apiId} className={`ms-apinodes-item ${apiClass}`} onClick={() => { onInsert(a); onClose(); }} style={{
              backgroundImage: a.metadata?.image || a.image ? `url('${a.metadata?.image || a.image}')` : 'none',
              backgroundSize: '100% 100%',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}>
              <div className="ms-apinodes-info">
                <div className="ms-apinodes-name">{a.name || a.label}</div>
                <div className="ms-apinodes-desc"></div>
              </div>
            </div>
          );
        })}
        {!filtered.length && (
          <div className="ms-apinodes-empty">No APIs match.</div>
        )}
      </div>
    </div>
  );
}
