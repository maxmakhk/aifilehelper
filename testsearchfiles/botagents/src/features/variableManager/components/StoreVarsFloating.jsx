import React, { useEffect, useRef, useState } from 'react';
import './storeVarsFloating.css';

/**
 * StoreVarsFloating - Global Variables Inspector
 * 
 * This component displays globalStoreVars (server-side shared variables).
 * Updates in real-time via socket subscription in parent (VariableManager).
 * Global variables can be edited and updated to the server.
 * 
 * Last updated: 2026-02-26
 */
export default function StoreVarsFloating({ storeVars = {}, setStoreVars = null, onUpdateGlobalVar = null }) {
  // Expand `globalStoreVars` (if present) so each key appears individually in the UI.
  // Global keys can be edited and will be synced to the server.
  
  const entries = React.useMemo(() => {
    const global = {};
    if (storeVars && typeof storeVars === 'object') {
      const gs = storeVars.globalStoreVars;
      if (gs && typeof gs === 'object' && !Array.isArray(gs)) {
        Object.keys(gs).forEach((k) => {
          global[k] = gs[k];
        });
      }
    }
    const out = [];
    Object.entries(global).forEach(([k, v]) => out.push({ key: String(k), value: v, isGlobal: true }));
    return out;
  }, [storeVars]);
  const nodeRef = useRef(null);
  const dragRef = useRef({ dragging: false, offsetX: 0, offsetY: 0 });
  const [pos, setPos] = useState(null); // { left, top } when moved
  const [expanded, setExpanded] = useState({});
  const [editing, setEditing] = useState(null); // { key, draftKey, draftVal }
  const [addingNew, setAddingNew] = useState(false);

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

  const toggle = (key) => {
    setExpanded((s) => ({ ...s, [key]: !s[key] }));
  };

  const safeSetStoreVars = (updater) => {
    if (typeof setStoreVars === 'function') setStoreVars(updater);
  };

  const startEdit = (key, isGlobal) => {
    // Allow editing global vars
    const val = isGlobal ? (storeVars?.globalStoreVars?.[key]) : storeVars?.[key];
    const display = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val === undefined ? '' : val);
    setEditing({ key, draftKey: key, draftVal: display, isGlobal });
    setAddingNew(false);
  };

  const startAdd = () => {
    setAddingNew(true);
    setEditing({ key: null, draftKey: '', draftVal: '' });
  };

  const cancelEdit = () => { setEditing(null); setAddingNew(false); };

  const tryParseValue = (raw) => {
    const s = String(raw || '');
    const trimmed = s.trim();
    if (!trimmed) return '';
    // Attempt JSON parse for objects/arrays/booleans/numbers
    try { return JSON.parse(trimmed); } catch (e) { return s; }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { key: origKey, draftKey, draftVal, isGlobal } = editing;
    const parsedVal = tryParseValue(draftVal);
    
    if (isGlobal) {
      // Update global variable on server
      if (typeof onUpdateGlobalVar === 'function') {
        try {
          // If key changed, delete the old key first
          if (origKey && origKey !== draftKey) {
            await onUpdateGlobalVar(origKey, undefined); // delete old key
          }
          // Set new/updated key
          await onUpdateGlobalVar(draftKey, parsedVal);
        } catch (err) {
          console.error('Failed to update global variable:', err);
        }
      }
    } else {
      // Update local variable
      safeSetStoreVars((prev = {}) => {
        const next = { ...prev };
        if (origKey && origKey !== draftKey) {
          delete next[origKey];
        }
        next[draftKey] = parsedVal;
        return next;
      });
    }
    
    setEditing(null);
    setAddingNew(false);
  };

  const removeVar = (key) => {
    if (!key) return;
    safeSetStoreVars((prev = {}) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // clear editing state if it pointed to removed key
    if (editing && editing.key === key) cancelEdit();
  };

  return (
    <div
      ref={nodeRef}
      className="ms-storevars-floating"
      title="Runtime store variables"
      style={pos ? { left: pos.left + 'px', top: pos.top + 'px', right: 'auto', bottom: 'auto' } : {}}
    >
      <div className="ms-storevars-header" onMouseDown={onHeaderDown}>
        <span>Variables</span>
        <span className="ms-storevars-hint">(drag)</span>
      </div>
      <div className="ms-storevars-body">
        <div className="ms-storevars-actions">
          <button className="ms-btn ms-btn-add" onClick={startAdd}>+ Add variable</button>
        </div>
        {entries.length === 0 && <div className="ms-storevars-empty">(no variables)</div>}
        {addingNew && editing && (
          <div className="ms-storevars-row editing new">
            <input className="ms-storevars-input-key" value={editing.draftKey} onChange={(e) => setEditing((s) => ({ ...s, draftKey: e.target.value }))} placeholder="name" />
            <textarea className="ms-storevars-input-val" value={editing.draftVal} onChange={(e) => setEditing((s) => ({ ...s, draftVal: e.target.value }))} placeholder="value (JSON or plain)" />
            <div className="ms-storevars-edit-actions">
              <button className="ms-btn ms-btn-update" onClick={saveEdit}>Update</button>
              <button className="ms-btn ms-btn-cancel" onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        )}

        {entries.map(({ key, value, isGlobal }) => {
          const isObj = value && typeof value === 'object';
          const expandedFlag = !!expanded[key];
          const displayed = isObj ? (expandedFlag ? JSON.stringify(value, null, 2) : JSON.stringify(value)) : String(value);
          const short = displayed.length > 120 ? displayed.slice(0, 120) + '…' : displayed;
          return (
            <div key={key} className={`ms-storevars-row ${expandedFlag ? 'expanded' : ''} ${isGlobal ? 'global' : ''}`}>
              {editing && editing.key === key ? (
                <>
                  <input className="ms-storevars-input-key" value={editing.draftKey} onChange={(e) => setEditing((s) => ({ ...s, draftKey: e.target.value }))} />
                  <textarea className="ms-storevars-input-val" value={editing.draftVal} onChange={(e) => setEditing((s) => ({ ...s, draftVal: e.target.value }))} />
                  <div className="ms-storevars-edit-actions">
                    <button className="ms-btn ms-btn-update" onClick={saveEdit}>Update</button>
                    <button className="ms-btn ms-btn-cancel" onClick={cancelEdit}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ms-storevars-key" title={isGlobal ? 'Global variable (synced to server)' : ''}>{key}{isGlobal ? ' (global)' : ''}</div>
                  <div className="ms-storevars-val">
                    <pre className="ms-storevars-pre">{expandedFlag ? displayed : short}</pre>
                  </div>
                  <div className="ms-storevars-row-actions">
                    {isGlobal ? (
                      <>
                        <div className="ms-storevars-global-badge">Global</div>
                        <button className="ms-btn ms-btn-edit" onClick={() => startEdit(key, true)}>Edit</button>
                      </>
                    ) : (
                      <>
                        <button className="ms-btn ms-btn-edit" onClick={() => startEdit(key, false)}>Edit</button>
                        <button className="ms-btn ms-btn-remove" onClick={() => removeVar(key)}>Remove</button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
