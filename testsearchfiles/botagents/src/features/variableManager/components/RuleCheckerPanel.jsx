import React, { useState } from 'react';

const RuleCheckerPanel = ({
  selectedRuleIndex,
  addNewRule,
  ruleTypes,
  setRuleTypes,
  selectedRuleCategoryId,
  setSelectedRuleCategoryId,
  ruleCategoryIds,
  setRuleCategoryIds,
  ruleCategories,
  ruleNames,
  setSelectedRuleIndex,
  updateRuleName,
  rulePrompts,
  updateRulePrompt,
  ruleSource,
  updateRuleSource,
  ruleDetectPrompts,
  setRuleDetectPrompts,
  ruleRelatedFields,
  setRuleRelatedFields,
  ruleSystemPrompts,
  setRuleSystemPrompts,
  functionsList,
  generatingRuleIndex,
  generateRuleFromPrompt,
  runCheck,
  variables,
  saveRuleSources,
  ruleExpressions,
  setExpression,
  deleteRuleIndex,
  newGroupName,
  setNewGroupName,
  newGroupContent,
  setNewGroupContent,
  saveRuleGroup,
  ruleGroups,
  groupsLoading,
  editingGroupId,
  setEditingGroupId,
  ruleGroupDelete,
  testRuleGroup,
  groupTesting,
  groupTestResults,
  visibleRuleIndices
}) => {
  return (
    <div id="ruleCheckSection" style={{padding:16, background:'#111827', borderRadius:'0 0 8px 8px'}}>
      {/* Rule selector dropdown */}
      <div style={{marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center'}}>
        <label style={{fontWeight: 'bold'}}>Category</label>
        <select
          value={selectedRuleCategoryId || 'all'}
          onChange={e => setSelectedRuleCategoryId(e.target.value)}
          style={{padding: 6, borderRadius: 4, border:'1px solid #475569', background:'#020617', color:'#e5e7eb'}}
        >
          <option value="all">All</option>
          {ruleCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name || c.id}</option>
          ))}
        </select>
        <label style={{fontWeight: 'bold'}}>Rule</label>
        <select 
          value={selectedRuleIndex}
          onChange={e => setSelectedRuleIndex(parseInt(e.target.value, 10))}
          style={{padding: 6, borderRadius: 4, border:'1px solid #475569', background:'#020617', color:'#e5e7eb'}}
        >
          {visibleRuleIndices?.map((idx) => (
            <option key={idx} value={idx}>{((ruleNames[idx] !== undefined && ruleNames[idx] !== '') ? ruleNames[idx] : (rulePrompts[idx] || 'No name')) + (functionsList && functionsList[idx] && (functionsList[idx].ruleId || functionsList[idx].id) ? ` — ${functionsList[idx].ruleId || functionsList[idx].id}` : '')}</option>
          ))}
        </select>
        <button
          className="btn-secondary"
          onClick={addNewRule}
          style={{padding: '6px 12px', fontSize: '0.85rem'}}
        >
          + New Rule
        </button>
      </div>

      {/* Single rule editor */}
      {selectedRuleIndex !== undefined && (
        <div style={{padding: 12, background: '#0b1220', borderRadius: 8, border: '1px solid #1f2937'}}>
          <div style={{marginBottom: 8}}>
            <label style={{display: 'block', fontWeight: 'bold', marginBottom: 4}}>Type:</label>
            <input
              type="text"
              value={ruleTypes[selectedRuleIndex] || ''}
              onChange={e => {
                const arr = [...ruleTypes];
                arr[selectedRuleIndex] = e.target.value;
                setRuleTypes(arr);
              }}
              style={{width: '100%', padding: 6, borderRadius: 4, border:'1px solid #475569', background:'#020617', color:'#e5e7eb', fontSize:'0.9rem', boxSizing: 'border-box'}}
              placeholder="e.g. Rule Checker, Variable Manager"
            />
          </div>

          <div style={{marginBottom: 8}}>
            <label style={{display: 'block', fontWeight: 'bold', marginBottom: 4}}>Category:</label>
            <select
              value={ruleCategoryIds[selectedRuleIndex] || ''}
              onChange={e => {
                const arr = [...ruleCategoryIds];
                arr[selectedRuleIndex] = e.target.value;
                setRuleCategoryIds(arr);
              }}
              style={{width: '100%', padding: 6, borderRadius: 4, border:'1px solid #475569', background:'#020617', color:'#e5e7eb', fontSize:'0.9rem', boxSizing: 'border-box'}}
            >
              <option value="">(uncategorized)</option>
              {ruleCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.id}</option>
              ))}
            </select>
          </div>

          <div style={{marginBottom: 8}}>
            <label style={{display: 'block', fontWeight: 'bold', marginBottom: 4}}>Name:</label>
            <input
              type="text"
              value={ruleNames[selectedRuleIndex] || ''}
              onChange={e => updateRuleName(selectedRuleIndex, e.target.value)}
              style={{width: '100%', padding: 6, borderRadius: 4, border:'1px solid #475569', background:'#020617', color:'#e5e7eb', fontSize:'0.9rem', boxSizing: 'border-box'}}
              placeholder="Rule name (short)"
            />
            <div style={{color:'#9ca3af', fontSize:'0.8rem', marginTop:6}}>
              {functionsList && functionsList[selectedRuleIndex] && (functionsList[selectedRuleIndex].ruleId || functionsList[selectedRuleIndex].id) ? `RuleId: ${functionsList[selectedRuleIndex].ruleId || functionsList[selectedRuleIndex].id}` : ''}
            </div>
          </div>

          <div style={{marginBottom: 8}}>
            <label style={{display: 'block', fontWeight: 'bold', marginBottom: 4}}>Prompt:</label>
            <input 
              type="text" 
              value={rulePrompts[selectedRuleIndex] || ''}
              onChange={e => updateRulePrompt(selectedRuleIndex, e.target.value)}
              style={{width: '100%', padding: 6, borderRadius: 4, border:'1px solid #475569', background:'#020617', color:'#e5e7eb', fontSize:'0.9rem', boxSizing: 'border-box'}} 
              placeholder="Enter natural language prompt (e.g., 'quantities greater than 5')"
            />
          </div>

          <div style={{marginBottom: 8}}>
            <label style={{display: 'block', fontWeight: 'bold', marginBottom: 4}}>JavaScript Expression:</label>
            <textarea
              value={ruleSource[selectedRuleIndex] || ''}
              onChange={e => updateRuleSource(selectedRuleIndex, e.target.value)}
              rows={3}
              placeholder="Enter JavaScript expression (e.g., v.qty > 5)"
              style={{
                width: '100%', 
                padding: 8, 
                borderRadius: 6, 
                border: '1px solid #475569', 
                background: '#020617', 
                color: '#e5e7eb',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}  
            />
          </div>

          <div style={{marginTop:8}}>
            <label style={{display: 'block', fontWeight: 'bold', marginBottom: 4}}>Detect Prompt:</label>
            <textarea
              value={ruleDetectPrompts[selectedRuleIndex] || ''}
              onChange={e => {
                const arr = [...ruleDetectPrompts];
                arr[selectedRuleIndex] = e.target.value;
                setRuleDetectPrompts(arr);
              }}
              rows={3}
              placeholder="Optional prompt for detecting/splitting actions (used in detectActionCount)"
              style={{width: '100%', padding: 8, borderRadius: 6, border: '1px solid #475569', background: '#020617', color: '#e5e7eb', fontFamily:'monospace'}}
            />
          </div>

          <div style={{marginTop:8}}>
            <label style={{display: 'block', fontWeight: 'bold', marginBottom: 4}}>Related Fields:</label>
            <input
              type="text"
              placeholder="e.g. name, qty, signal or all"
              value={ruleRelatedFields[selectedRuleIndex] || ''}
              onChange={(e) => {
                const arr = [...ruleRelatedFields];
                arr[selectedRuleIndex] = e.target.value;
                setRuleRelatedFields(arr);
              }}
              style={{width: '100%', padding: 8, borderRadius: 6, border: '1px solid #475569', background: '#020617', color: '#e5e7eb'}}
            />
          </div>

          <div style={{marginTop:8}}>
            <label style={{display: 'block', fontWeight: 'bold', marginBottom: 4}}>System Prompt:</label>
            <textarea
              value={ruleSystemPrompts[selectedRuleIndex] || ''}
              onChange={e => {
                const arr = [...ruleSystemPrompts];
                arr[selectedRuleIndex] = e.target.value;
                setRuleSystemPrompts(arr);
              }}
              rows={3}
              placeholder="Optional system prompt / introduction for this rule"
              style={{height:'400px',width: '100%', padding: 8, borderRadius: 6, border: '1px solid #475569', background: '#020617', color: '#e5e7eb', fontFamily:'monospace'}}
            />
          </div>

          <div style={{display: 'flex', gap: 8, marginBottom: 12}}>
            <button 
              className="btn-primary" 
              onClick={() => generateRuleFromPrompt(selectedRuleIndex)}
              disabled={generatingRuleIndex === selectedRuleIndex}
              style={{padding: '8px 12px', fontSize: '0.85rem'}}
            >
              {generatingRuleIndex === selectedRuleIndex ? 'Generating...' : 'Generate from Prompt'}
            </button>
            <button 
              className="btn-primary" 
              onClick={() => {
                runCheck(variables, ruleSource[selectedRuleIndex], ruleRelatedFields[selectedRuleIndex] || '');
                setTimeout(() => {
                  const el = document.getElementById('checkResult');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
              }}
              style={{padding: '8px 12px', fontSize: '0.85rem'}}
            >
              Run Check
            </button>
            <button 
              className="btn-secondary" 
              onClick={() => saveRuleSources()}
              style={{padding: '8px 12px', fontSize: '0.85rem'}}
            >
              Save to Firebase
            </button>
            {/* Migrate saved rules removed */}
            {ruleSource.length > 1 && (
              <button 
                className="btn-cancel" 
                onClick={() => deleteRuleIndex(selectedRuleIndex)}
                style={{padding: '8px 12px', fontSize: '0.85rem'}}
              >
                Delete This Rule
              </button>
            )}
          </div>

          
        </div>
      )}
      
      
    </div>
  );
};

export default RuleCheckerPanel;
