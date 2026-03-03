import React from 'react';

const ManualEditPanel = ({
  manualSelectedId,
  setManualSelectedId,
  variables,
  handleLoadManual,
  handleCancel,
  newName,
  setNewName,
  newDescription,
  setNewDescription,
  newTags,
  setNewTags,
  editingId,
  handleAddOrUpdate
}) => {
  return (
    <div className="variable-form" style={{padding:16, background:'#111827', borderRadius:'0 0 8px 8px'}}>
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:12}}>
        <select
          value={manualSelectedId}
          onChange={(e) => setManualSelectedId(e.target.value)}
          style={{padding: 6, borderRadius: 4, border:'1px solid #475569', background:'#020617', color:'#e5e7eb', minWidth:220}}
        >
          <option value="">Select variable to load</option>
          {variables.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <button className="btn-secondary" onClick={handleLoadManual} disabled={!manualSelectedId}>
          Load
        </button>
        <button className="btn-cancel" onClick={handleCancel}>
          Clear
        </button>
      </div>
      <div className="form-row">
        <input
          type="text"
          placeholder="Name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Description"
          value={newDescription}
          onChange={e => setNewDescription(e.target.value)}
        />
        <input
          type="text"
          placeholder="Tags (comma separated)"
          value={newTags}
          onChange={e => setNewTags(e.target.value)}
        />
      </div>
      <div className="form-actions">
        <button className="btn-primary" onClick={handleAddOrUpdate}>
          {editingId ? 'Update Variable' : 'Add Variable'}
        </button>
        {editingId && (
          <button className="btn-cancel" onClick={handleCancel}>
            Cancel
          </button>
        )}
      </div>

      
    </div>
  );
};

export default ManualEditPanel;
