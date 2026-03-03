import React from 'react';

const RuleCategoryPanel = ({
  newCategoryName,
  setNewCategoryName,
  saveRuleCategory,
  editingCategoryId,
  setEditingCategoryId,
  ruleCategories,
  categoriesLoading,
  deleteRuleCategory
}) => {
  return (
    <div className="rule-category" style={{padding:16, background:'#111827', borderRadius:'0 0 8px 8px'}}>
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:12}}>
        <input
          type="text"
          placeholder="Category name"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveRuleCategory(newCategoryName); }}
          style={{padding:6, borderRadius:4, border:'1px solid #475569', background:'#020617', color:'#e5e7eb', minWidth:260}}
        />
        <button className="btn-primary" onClick={() => saveRuleCategory(newCategoryName)}>
          {editingCategoryId ? 'Update' : 'Add'}
        </button>
        <button
          className="btn-secondary"
          onClick={() => { setNewCategoryName(''); setEditingCategoryId(null); }}
        >
          Clear
        </button>
      </div>

      <div style={{marginBottom:12}}>
        <h4 style={{margin:'0 0 8px 0'}}>Saved Categories</h4>
        {categoriesLoading ? (
          <div>Loading...</div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            {ruleCategories.map((c) => (
              <div key={c.id} style={{display:'flex', alignItems:'center', gap:8, background:'#020617', padding:8, borderRadius:6}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:'bold'}}>{c.name || c.id}</div>
                  <div style={{fontSize:'0.85rem', color:'#9ca3af'}}>{c.id}</div>
                </div>
                <div style={{display:'flex', gap:8}}>
                  <button className="btn-secondary" onClick={() => { setEditingCategoryId(c.id); setNewCategoryName(c.name || ''); }}>
                    Edit
                  </button>
                  <button className="btn-cancel" onClick={() => deleteRuleCategory(c.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!ruleCategories.length && <div style={{color:'#6b7280'}}>No categories yet.</div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default RuleCategoryPanel;
