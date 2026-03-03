import React from 'react';
import { formatDate } from '../utils/dateUtils';

const LogsPanel = ({
  logs,
  logsLoading,
  logsAllLoaded,
  loadLogs
}) => {
  return (
    <div className="variable-log" style={{padding:16, background:'#111827', borderRadius:'0 0 8px 8px'}}>
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
        {!logsAllLoaded && (
          <button className="btn-primary" onClick={() => loadLogs(true)} disabled={logsLoading}>
            {logsLoading ? 'Loading...' : 'Extend (load all)'}
          </button>
        )}
        <button className="btn-secondary" onClick={() => loadLogs(false)} disabled={logsLoading}>
          Refresh
        </button>
        <div style={{color:'#9ca3af', marginLeft:8}}>{logsAllLoaded ? 'Showing all logs' : `Showing ${logs.length} recent logs`}</div>
      </div>

      <div style={{overflow:'auto'}}>
        <table className="variable-table" style={{width:'100%'}}>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Details / Parsed</th>
              <th>Parse Error</th>
              <th>Prompt</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>
                  {log.createdAt ? formatDate(log.createdAt) : 'N/A'}
                </td>
                <td>{log.action || '-'}</td>
                <td style={{maxWidth:400, whiteSpace:'pre-wrap', wordBreak:'break-word'}}>{log.parsed ? JSON.stringify(log.parsed) : log.rawResponse}</td>
                <td style={{color:'#fca5a5'}}>{log.parseError || '-'}</td>
                <td style={{maxWidth:300, whiteSpace:'pre-wrap', wordBreak:'break-word'}}>{log.prompt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LogsPanel;
