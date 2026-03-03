import React from 'react';

const TabNavigation = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'variableTable', label: 'Variable Table' },
    { id: 'ruleChecker', label: 'Rule Checker' },
    { id: 'ruleCategory', label: 'Rule Category' },
    { id: 'manualEdit', label: 'Manual Edit' },
    { id: 'externalApi', label: 'Components' },
    { id: 'variablePrompt', label: 'Projects' },
    { id: 'logs', label: 'Variable Manager Log' }
  ];

  return (
    <div  id="tabB" style={{display: 'flex', gap: 0, marginBottom: 0, borderBottom: '2px solid #1f2937'}}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          style={{
            padding: '10px 16px',
            background: activeTab === tab.id ? '#111827' : 'transparent',
            color: activeTab === tab.id ? '#3b82f6' : '#9ca3af',
            border: 'none',
            borderBottom: activeTab === tab.id ? '3px solid #3b82f6' : '3px solid transparent',
            cursor: 'pointer',
            fontWeight: activeTab === tab.id ? 'bold' : 'normal',
            fontSize: '0.9rem'
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default TabNavigation;
