import React, { useState, useEffect } from 'react';

const NodeEditModal = ({ open, node, onSave, onCancel }) => {
  const [edit, setEdit] = useState(node || null);

  useEffect(() => {
    setEdit(node || null);
  }, [node]);

  if (!open || !edit) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        backdropFilter: 'blur(2px)'
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#111827',
          border: '2px solid #3b82f6',
          borderRadius: 8,
          padding: 20,
          maxWidth: 600,
          width: '90%',
          color: '#e5e7eb',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
          <button onClick={onCancel} style={{background:'none', border:'none', color:'#9ca3af', fontSize:20}}>x</button>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          <label style={{fontWeight:'bold'}}>Label</label>
          <input type="text" value={edit.labelText || edit.label || ''} onChange={(e) => setEdit((s) => ({ ...(s||{}), labelText: e.target.value, label: e.target.value }))} style={{padding:8, borderRadius:6, border:'1px solid #475569', background:'#020617', color:'#e5e7eb'}} />
          <label style={{fontWeight:'bold'}}>Description</label>
          <textarea rows={4} value={edit.description || ''} onChange={(e) => setEdit((s) => ({ ...(s||{}), description: e.target.value }))} style={{padding:8, borderRadius:6, border:'1px solid #475569', background:'#020617', color:'#e5e7eb'}} />
        </div>
        <div style={{display:'flex', gap:8, marginTop:12}}>
          <button className="btn-primary" onClick={() => onSave(edit)}>Save</button>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default NodeEditModal;
