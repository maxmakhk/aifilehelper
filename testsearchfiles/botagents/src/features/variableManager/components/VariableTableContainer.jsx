import React, { useState } from 'react';
import VariableTable from './VariableTable';

const VariableTableContainer = ({ variables, handleEdit, deleteVariable }) => {
  const [tableFieldKey, setTableFieldKey] = useState('');
  const [selectedSignalDetail, setSelectedSignalDetail] = useState(null);

  const openSignalDetail = (varId, signalNameInput) => {
    if (!variables || !variables.length) return;
    const variable = variables.find((v) => String(v.id) === String(varId));
    if (!variable || !variable.signal || !variable.signal[signalNameInput]) return;
    setSelectedSignalDetail({ name: signalNameInput, data: variable.signal[signalNameInput] });
  };

  const closeSignalDetail = () => setSelectedSignalDetail(null);

  return (
    <>
      <VariableTable
        variables={variables}
        tableFieldKey={tableFieldKey}
        setTableFieldKey={setTableFieldKey}
        handleEdit={handleEdit}
        deleteVariable={deleteVariable}
        openSignalDetail={openSignalDetail}
      />

      {selectedSignalDetail && (
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
            zIndex: 1000,
            backdropFilter: 'blur(2px)'
          }}
          onClick={closeSignalDetail}
        >
          <div
            style={{
              background: '#111827',
              border: '2px solid #14b8a6',
              borderRadius: 8,
              padding: 20,
              maxWidth: 500,
              maxHeight: 600,
              overflow: 'auto',
              color: '#e5e7eb',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: '#14b8a6' }}>Signal: {selectedSignalDetail.name}</h3>
              <button
                onClick={closeSignalDetail}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: 0,
                  width: 30,
                  height: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>
            <div style={{ background: '#020617', padding: 12, borderRadius: 6, border: '1px solid #1f2937', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 400, overflow: 'auto' }}>
              {JSON.stringify(selectedSignalDetail.data, null, 2)}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                onClick={closeSignalDetail}
                className="btn-secondary"
                style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VariableTableContainer;
