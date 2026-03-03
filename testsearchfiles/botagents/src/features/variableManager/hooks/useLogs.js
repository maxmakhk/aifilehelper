import { useState, useCallback } from 'react';

/**
 * useLogs hook
 * Manages application logs using the local Node.js API (SQLite)
 */
export default function useLogs(db) {
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsAllLoaded, setLogsAllLoaded] = useState(false);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Load logs
  const loadLogs = useCallback(
    async (loadAll = false) => {
      setLogsLoading(true);
      try {
        const url = `${API_BASE}/api/logs${loadAll ? '?all=true' : ''}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const result = await resp.json();
        setLogs(result.logs || []);
        setLogsAllLoaded(result.allLoaded);
      } catch (err) {
        console.error('Error loading logs:', err);
      } finally {
        setLogsLoading(false);
      }
    },
    []
  );

  // Append log
  const appendLog = useCallback(
    async (entry) => {
      try {
        const resp = await fetch(`${API_BASE}/api/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        // Reload first 10 logs after appending
        const loadResp = await fetch(`${API_BASE}/api/logs`);
        if (loadResp.ok) {
          const loadResult = await loadResp.json();
          setLogs(loadResult.logs || []);
        }
      } catch (err) {
        console.error('Error appending log:', err);
      }
    },
    []
  );

  return {
    logs,
    setLogs,
    logsLoading,
    logsAllLoaded,
    setLogsAllLoaded,
    loadLogs,
    appendLog,
  };
}
