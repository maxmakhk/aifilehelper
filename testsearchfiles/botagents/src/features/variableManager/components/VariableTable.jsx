import React from 'react';
import { formatDate, getTimeAgo } from '../utils/dateUtils';
import { getSingleFieldValue } from '../utils/variableUtils';

const VariableTable = ({
  variables,
  tableFieldKey,
  setTableFieldKey,
  handleEdit,
  deleteVariable,
  openSignalDetail
}) => {
  return (
    <div className="variable-page-table-section">
        <div id="tabA" style={{display: 'flex', gap: 0, marginBottom: 0, borderBottom: '2px solid #1f2937'}}>
          <button
            style={{
              padding: '10px 16px',
              background: '#111827',
              color: '#3b82f6',
              border: 'none',
              borderBottom: '3px solid #3b82f6',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.9rem'
            }}
          >
            Variable Table
          </button>
        </div>
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
        <label style={{fontSize:'0.9rem', color:'#9ca3af'}}>Table field:</label>
        <input
          type="text"
          placeholder="e.g. color (from description JSON)"
          value={tableFieldKey}
          onChange={(e) => setTableFieldKey(e.target.value)}
          style={{padding:'6px 8px', borderRadius:6, border:'1px solid #475569', background:'#020617', color:'#e5e7eb', minWidth:220}}
        />
        <button className="btn-secondary" onClick={() => setTableFieldKey('')} style={{padding:'6px 10px', fontSize:'0.85rem'}}>
          Clear
        </button>
        <span style={{color:'#6b7280', fontSize:'0.85rem'}}>
          {tableFieldKey ? `Showing: ${tableFieldKey}` : 'Showing: description'}
        </span>
      </div>

      <table className="variable-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Tags</th>
            <th>Signal</th>
            <th>Last Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {variables.map((variable) => (
            <tr key={variable.id}>
              <td>{variable.name}</td>
              <td>
                {tableFieldKey
                  ? (getSingleFieldValue(variable, tableFieldKey) !== null && getSingleFieldValue(variable, tableFieldKey) !== undefined
                      ? String(getSingleFieldValue(variable, tableFieldKey))
                      : '-')
                  : variable.description}
              </td>
              <td>{variable.qty}</td>
              <td>{variable.tag && variable.tag.join(', ')}</td>
              <td style={{maxWidth:360, whiteSpace:'pre-wrap', wordBreak:'break-word'}}>
                {variable.signal && Object.keys(variable.signal).length > 0 ? (
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                    {Object.entries(variable.signal).map(([sigName, sigData]) => (
                      <button
                        key={sigName}
                        onClick={() => openSignalDetail(variable.id, sigName)}
                        style={{
                          padding: '4px 8px',
                          background: '#0f766e',
                          color: '#d1faf0',
                          border: '1px solid #14b8a6',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = '#14b8a6';
                          e.target.style.color = '#020617';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = '#0f766e';
                          e.target.style.color = '#d1faf0';
                        }}
                      >
                        {sigName}
                      </button>
                    ))}
                  </div>
                ) : (
                  '-'
                )}
              </td>
              <td>
                {variable.updatedAt 
                  ? <>
                      {formatDate(variable.updatedAt)}<br/>
                      <span style={{color:'#9ca3af', fontSize:'0.85em'}}>{getTimeAgo(variable.updatedAt)}</span>
                    </>
                  : variable.createdAt 
                    ? <>
                        {formatDate(variable.createdAt)}<br/>
                        <span style={{color:'#9ca3af', fontSize:'0.85em'}}>{getTimeAgo(variable.createdAt)}</span>
                      </>
                    : 'N/A'}
              </td>
              <td>
                <button 
                  className="btn-edit" 
                  onClick={() => handleEdit(variable)}
                  title="Edit"
                  style={{padding: '6px 8px', fontSize: '1rem', background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', marginRight: 4}}
                >
                  ✎
                </button>
                <button 
                  className="btn-delete" 
                  onClick={() => deleteVariable(variable.id)}
                  title="Delete"
                  style={{padding: '6px 8px', fontSize: '1rem', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer'}}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default React.memo(VariableTable);
