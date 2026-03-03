import React, { useState } from 'react';
import WorkflowGraph from './WorkflowGraph';
import { formatDate } from '../utils/dateUtils';

const VariablePromptPanel = ({
  selectedRuleCategoryId,
  setSelectedRuleCategoryId,
  ruleCategories,
  selectedRuleIndex,
  setSelectedRuleIndex,
  ruleNames,
  rulePrompts,
  visibleRuleIndices,
  functionsList,
  addNewWorkflow,
  deleteWorkflow,
  allProjectStatuses,
  saveSynthFunctionToRule,
  printRules,
  openOutputView,
  generateSystemPrompt,
  confirmPreview,
  aiLoading,
  taskFunctionText,
  workflowLoading,
  workflowError,
  rfNodes,
  rfEdges,
  setRfNodes,
  setRfEdges,
  onRfNodesChange,
  onRfEdgesChange,
  selectedIds,
  onConnect,
  onSelectionChange,
  onEdgeDoubleClick,
  onNodeDoubleClick,
  onNodeClick,
  edgeEdit,
  onCommitEdgeLabel,
  onCancelEdgeEdit,
  deleteSelected,
  generateFunctionFromFlow,
  setRfInstance,
  openActionRule,
  onAutoLayout,
  onNodePromptSubmit,
  layoutDirection,
  handleAiSubmit,
  aiPrompt,
  setAiPrompt,
  handlePromptToWorkflow,
  aiWarning,
  aiResponse,
  setTaskFunctionText,
  handleGenerateWorkflow,
  createFnPromptFromFunction,
  execProgress,
  execLog,
  filteredVariables,
  runProject,
  runActive,
  activeNodeId,
  activeEdgeId,
  storeVars,
  setStoreVars,
  pendingActions,
  cancelPreview
}) => {
  const [newWorkflowName, setNewWorkflowName] = useState('');
  return (
    <div className="ai-prompt-form" style={{padding: 16, background: '#111827', borderRadius:'0 0 8px 8px'}}>
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:10, flexWrap:'wrap'}}>
        <label style={{fontWeight:'bold'}}>Project</label>
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
        
        <label style={{fontWeight:'bold'}}>Workflow</label>
        <select
          value={selectedRuleIndex}
          onChange={e => setSelectedRuleIndex(parseInt(e.target.value))}
          style={{padding: 6, borderRadius: 4, border:'1px solid #475569', background:'#020617', color:'#e5e7eb'}}
        >
          {visibleRuleIndices.map((idx) => (
            <option key={idx} value={idx}>{(ruleNames[idx] !== undefined && ruleNames[idx] !== '') ? ruleNames[idx] : (rulePrompts[idx] || 'No name')}</option>
          ))}
        </select>

        {/* Add New Workflow moved next to Output View */}

        {/* Quick rule tabs for easier switching */}
        <div id="quickRuleTabs" style={{display:'flex', gap:6, overflowX:'auto', padding:'4px 6px', maxWidth:'100%'}}>
          {visibleRuleIndices.map((idx) => {
            // Get projectId for this rule
            const currentFunction = functionsList && functionsList[idx];
            const projectId = currentFunction?.id || currentFunction?.ruleId || `rule_${idx}`;
            const isRunning = allProjectStatuses && allProjectStatuses[projectId] === 'running';
            
            return (
              <button
                className="btn-secondary"
                key={idx}
                onClick={() => setSelectedRuleIndex(idx)}
                title={(ruleNames[idx] && ruleNames[idx] !== '') ? ruleNames[idx] : (rulePrompts[idx] || `Rule ${idx+1}`)}
                style={{
                  padding: '10px 10px',
                  background: selectedRuleIndex === idx ? '#c2c7d1' : '#000000',
                  color: selectedRuleIndex === idx ? '#000000' : '#c2c7d1',
                  border: 'none',
                  borderBottom: selectedRuleIndex === idx ? '3px solid #7dd3fc' : '3px solid transparent',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap',
                  borderRadius: 6,
                  position: 'relative'
                }}
              >
                {/* Running indicator */}
                {isRunning && (
                  <div style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#22c55e',
                    boxShadow: '0 0 4px rgba(34, 197, 94, 0.6)',
                    animation: 'pulse 2s infinite'
                  }} title="Project is running" />
                )}
                
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                  <div style={{fontWeight:700}}>{((ruleNames[idx] !== undefined && ruleNames[idx] !== '') ? ruleNames[idx] : (rulePrompts[idx] || `Rule ${idx+1}`)).slice(0, 28)}</div>
                  <div style={{fontSize:'0.7rem', color:'#9ca3af', marginTop:4}}>{functionsList && functionsList[idx] && (functionsList[idx].ruleId || functionsList[idx].id) ? (functionsList[idx].ruleId || functionsList[idx].id) : ''}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {typeof selectedRuleIndex !== 'undefined' && selectedRuleIndex !== null && (
        <div id="projectTitle" style={{marginBottom:10, padding:10, borderRadius:6, background:'#021827', border:'1px solid #13353b', color:'#e5f6ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12}}>
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <button className="btn-secondary" onClick={saveSynthFunctionToRule} disabled={aiLoading} title="Save Project to Rule Checker">
              Save → Firebase
            </button>
            <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
              <input
                value={newWorkflowName}
                onChange={e => setNewWorkflowName(e.target.value)}
                placeholder="New workflow name"
                style={{padding:6, borderRadius:4, border:'1px solid #475569', background:'#021827', color:'#e5e7eb', width:180}}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (typeof addNewWorkflow === 'function' && String(newWorkflowName || '').trim() !== '') {
                      addNewWorkflow(String(newWorkflowName).trim());
                      setNewWorkflowName('');
                    }
                  }
                }}
              />
              <button
                className="btn-primary"
                onClick={() => { if (typeof addNewWorkflow === 'function' && String(newWorkflowName || '').trim() !== '') { addNewWorkflow(String(newWorkflowName).trim()); setNewWorkflowName(''); } }}
                style={{padding:'8px 10px'}}
                disabled={String(newWorkflowName || '').trim() === ''}
              >
                Add New Workflow
              </button>
              <button
                className="btn-danger"
                onClick={() => { if (typeof deleteWorkflow === 'function' && window.confirm('Delete this workflow? This cannot be undone.')) { deleteWorkflow(); } }}
                style={{padding:'8px 10px', background:'#dc2626', color:'#fff'}}
                title="Delete current workflow"
              >
                Delete Workflow
              </button>
            </div>
            <button className="btn-secondary" onClick={() => { try { if (typeof openOutputView === 'function') openOutputView(); } catch (e) {} }} style={{padding: '6px 10px'}}>Open Output View</button>
            <button className="btn-secondary" onClick={() => { try { if (typeof generateSystemPrompt === 'function') generateSystemPrompt(); } catch (e) {} }} style={{padding: '6px 10px'}}>Generate SystemPrompt</button>
            {/* Run moved to floating Node Tools panel */}
          </div>
          <div style={{fontSize:'0.85rem', color:'#9dd3ff', fontWeight:700}}>Editing Rule: {(ruleNames && ruleNames[selectedRuleIndex]) ? ruleNames[selectedRuleIndex] : (rulePrompts && rulePrompts[selectedRuleIndex]) || `Rule ${Number(selectedRuleIndex)+1}`}</div>
          
        </div>
      )}

      {workflowLoading && (
        <div style={{marginBottom:10, color:'#9fd6e1'}}>Generating workflow...</div>
      )}
      {workflowError && (
        <div style={{marginBottom:10, color:'#fca5a5'}}>{workflowError}</div>
      )}

      {/* Visual Workflow panel */}
        <WorkflowGraph
        rfNodes={rfNodes}
        rfEdges={rfEdges}
        setRfNodes={setRfNodes}
        setRfEdges={setRfEdges}
        onNodesChange={onRfNodesChange}
        onEdgesChange={onRfEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onEdgeDoubleClick={onEdgeDoubleClick}
        edgeEdit={edgeEdit}
        onCommitEdgeLabel={onCommitEdgeLabel}
        cancelEdgeEdit={onCancelEdgeEdit}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeClick={onNodeClick}
        onDeleteSelected={deleteSelected}
        onGenerateFunction={generateFunctionFromFlow}
        onInitFlow={(inst) => setRfInstance(inst)}
        onOpenActionRule={openActionRule}
          onToggleNodeLock={(nodeId) => {
            try { if (typeof window?.vm_toggleNodeLock === 'function') window.vm_toggleNodeLock(nodeId); }
            catch (e) { /* ignore */ }
          }}
        onAutoLayout={onAutoLayout}
        onNodePromptSubmit={onNodePromptSubmit}
        selectedIds={selectedIds}
        layoutDirection={layoutDirection}
        selectedCount={selectedIds.length}
        activeNodeId={activeNodeId}
        activeEdgeId={activeEdgeId}
          aiLoading={aiLoading}
          onRun={runProject}
          runActive={runActive}
          storeVars={storeVars}
          setStoreVars={setStoreVars}
      />

      <form onSubmit={handleAiSubmit} style={{display:'flex', flexDirection:'column', gap:8}}>
        <label style={{fontWeight: 'bold'}}>Prompt</label>
        <textarea
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          rows={9}
          placeholder="Type your instruction for AI (e.g. add variable name=foo, description=bar)"
          style={{resize:'vertical', padding:8, borderRadius:6, border:'1px solid #475569', background:'#020617', color:'#e5e7eb', minHeight:180}}
          required
        />
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <button className="btn-primary" type="submit" disabled={aiLoading}>
            {aiLoading ? 'Submitting...' : 'Prompt → Fn'}
          </button>
          <button className="btn-secondary" type="button" onClick={handlePromptToWorkflow} disabled={aiLoading || workflowLoading}>
            Prompt → Workflow
          </button>
        </div>
      </form>

      {aiWarning && (
        <div style={{marginTop:12, background:'#fef3c7', padding:10, borderRadius:6, color:'#92400e', border: '1px solid #f59e0b'}}>
          <strong>Warning:</strong>
          <div style={{whiteSpace:'pre-wrap', wordBreak:'break-word', marginTop:6}}>{aiWarning}</div>
        </div>
      )}

      {aiResponse && (
        <div style={{marginTop:12, background:'#222', padding:10, borderRadius:6, color:'#e5e7eb'}}>
          <strong>AI Response:</strong>
          <pre style={{whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0}}>{aiResponse}</pre>
        </div>
      )}

      {execProgress && (
        <div style={{marginTop:12, background:'#083344', padding:10, borderRadius:6, color:'#e6f6ff', border: '1px solid #0ea5b7'}}>
          <strong>Progress:</strong>
          <div style={{marginTop:6}}>{execProgress.current}/{execProgress.total} — {execProgress.status}</div>
          {execProgress.currentActionName && (
            <div style={{fontSize:'0.9em', marginTop:6, color:'#d1f5ff'}}>Action: {execProgress.currentActionName}</div>
          )}
          {execLog && execLog.length > 0 && (
            <div style={{marginTop:8, maxHeight:140, overflow:'auto', background:'#032229', padding:8, borderRadius:6}}>
              <ol style={{margin:0, paddingLeft:18}}>
                {execLog.map((e) => (
                  <li key={e.idx} style={{marginBottom:6}}>
                    <strong>{e.action}</strong>: {e.description || '-'}<br/>
                    <span style={{fontSize:'0.85em', color:'#9fd6e1'}}>{e.status} — {formatDate(e.ts)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      <div style={{marginTop:6, background:'#072f52', padding:12, borderRadius:8, color:'#e6f6ff', border: '1px solid #0ea5b7'}}>
        <h4 style={{margin:0}}>Planned Task Function</h4>
        <textarea
          value={taskFunctionText}
          onChange={(e) => setTaskFunctionText(e.target.value)}
          rows={8}
          placeholder="Paste a task function here (ctx) => { ... }"
          style={{margin:0,marginTop:6, resize:'vertical', width:'98%', padding:8, background:'#021827', borderRadius:6, border:'1px solid #0ea5b7', color:'#e6f6ff'}}
        />
        <div style={{display:'flex', gap:8, marginTop:10}}>
          <button className="btn-secondary" onClick={handleGenerateWorkflow} disabled={aiLoading || workflowLoading || !taskFunctionText.trim()}>Fn → Flow</button>
          <button className="btn-secondary" onClick={createFnPromptFromFunction} disabled={aiLoading || !taskFunctionText.trim()} title="Create a Project prompt from the current function">
            Fn → Prompt
          </button>
        </div>
      </div>

      {filteredVariables && (
        <div style={{marginTop:12, background:'#0b1220', padding:10, borderRadius:6, color:'#e5e7eb', border: '1px solid #1f2937'}}>
          <strong>Filtered Variables (in-memory):</strong>
          <div style={{marginTop:6, fontSize:'0.9em', color:'#9ca3af'}}>
            {filteredVariables.length} item(s)
          </div>
          <div style={{marginTop:8, maxHeight:160, overflow:'auto', background:'#020617', padding:8, borderRadius:6}}>
            <ol style={{margin:0, paddingLeft:18}}>
              {filteredVariables.slice(0, 50).map((v, idx) => (
                <li key={v.id || idx} style={{marginBottom:4}}>
                  <strong>{v.name || v.id}</strong>
                  {v.qty !== undefined ? ` (qty: ${v.qty})` : ''}
                </li>
              ))}
            </ol>
            {filteredVariables.length > 50 && (
              <div style={{marginTop:6, fontSize:'0.85em', color:'#6b7280'}}>
                Showing first 50 items...
              </div>
            )}
          </div>
        </div>
      )}

      {pendingActions && (
        <div style={{marginTop:12, background:'#072f52', padding:12, borderRadius:8, color:'#e6f6ff', border: '1px solid #0ea5b7'}}>
          <h4 style={{marginTop:0}}>Planned Actions Preview</h4>
          <div style={{marginBottom:8}}>This prompt will execute {pendingActions.length} action(s). Please review the list below and confirm to execute. (Preview limited to 50 actions)</div>
          <div style={{maxHeight:200, overflow:'auto', padding:8, background:'#021827', borderRadius:6}}>
            <ol style={{margin:0, paddingLeft:18}}>
              {pendingActions.map((a, idx) => (
                <li key={idx} style={{marginBottom:6}}>
                  <strong>{a.action}</strong>: {a.description || JSON.stringify(a)}
                </li>
              ))}
            </ol>
          </div>
          <div style={{display:'flex', gap:8, marginTop:10}}>
            <button className="btn-primary" onClick={confirmPreview} disabled={aiLoading}>Confirm and Execute</button>
            <button className="btn-cancel" onClick={cancelPreview} disabled={aiLoading}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VariablePromptPanel;
