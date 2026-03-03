import { useState, useCallback } from 'react';
import { loadApis as firebaseLoadApis, testApi as firebaseTestApi } from '../services/firebase/apisService';

// Fallback fetch for testing API logs (UI logs panel auto-refreshes when opened)
async function appendLogToBackend(entry) {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  try {
    await fetch(`${API_BASE}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch (err) {
    console.error('Failed to append log:', err);
  }
}
/**
 * useExternalApis hook
 * Manages external API configuration and testing
 */
export default function useExternalApis(db) {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const [apis, setApis] = useState([]);
  const [apisLoading, setApisLoading] = useState(false);
  const [newApiName, setNewApiName] = useState('');
  const [newApiUrl, setNewApiUrl] = useState('');
  const [selectedApiId, setSelectedApiId] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testInput, setTestInput] = useState('');

  // Load APIs
  const loadApis = useCallback(async () => {
    setApisLoading(true);
    try {
      const items = await firebaseLoadApis(db);
      setApis(items);
    } catch (err) {
      console.error('Error loading APIs:', err);
    } finally {
      setApisLoading(false);
    }
  }, [db]);

  // Add API
  const addApi = useCallback(
    async (name, url, tags = '', fn = '', cssStyle = '', description = '') => {
      try {
        const projectId = window?.currentProjectId || null;
        const resp = await fetch(`${API_BASE}/api/external-apis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, name, url, tags, function: fn, cssStyle, description })
        });
        if (!resp.ok) throw new Error('Failed to create API');
        const newApi = await resp.json();
        setApis((s) => [...s, newApi]);
        setNewApiName('');
        setNewApiUrl('');
      } catch (err) {
        console.error('Error adding API:', err);
        throw err;
      }
    },
    [db]
  );

  // Delete API
  const deleteApi = useCallback(
    async (id) => {
      try {
        const projectId = window?.currentProjectId || null;
        const resp = await fetch(`${API_BASE}/api/external-apis/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId })
        });
        if (!resp.ok) throw new Error('Failed to delete API');
        setApis((s) => s.filter((a) => a.id !== id));
      } catch (err) {
        console.error('Error deleting API:', err);
        throw err;
      }
    },
    [db]
  );

  // Save API prompt
  const saveApiPrompt = useCallback(
    async (apiId, prompt) => {
      try {
        const resp = await fetch(`${API_BASE}/api/external-apis/${apiId}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });
        if (!resp.ok) throw new Error('Failed to save prompt');
        setApis((s) => s.map((a) => (a.id === apiId ? { ...a, lastPrompt: prompt, updatedAt: new Date() } : a)));
      } catch (err) {
        console.error('Error saving API prompt:', err);
        throw err;
      }
    },
    [db]
  );

  // Test API
  const testApi = useCallback(
    async (api, promptOverride = null) => {
      if (!api || !api.url) return;

      const prompt = promptOverride !== null ? promptOverride : (api.lastPrompt || testInput || '');
      setTesting(true);
      setTestResult(null);

      try {
        // Save prompt to api record first
        await saveApiPrompt(api.id, prompt);

        // Call Firebase test function (client-side helper)
        const result = await firebaseTestApi(api, prompt);
        // Log the attempt (use data returned from tester)
        const entry = {
          prompt,
          endpoint: api.url,
          rawResponse: result && result.text ? result.text : '',
          parsed: result && result.parsed ? result.parsed : null,
          parseError: result && result.parseError ? result.parseError : null,
          action: 'xAI-test',
          warning: result && result.ok === false ? `HTTP ${result.status || 'error'}` : null,
          createdAt: new Date(),
        };
        try { await appendLogToBackend(entry); } catch (e) { console.error('Failed to append test log', e); }

        // Return result to UI
        setTestResult(result || { ok: false, error: 'No result' });
        return result;
      } finally {
        setTesting(false);
      }
    },
    [testInput, saveApiPrompt, db]
  );

  // Update API metadata (tags, function, name, url)
  const updateApiMetadata = useCallback(
    async (apiId, metadata) => {
      try {
        const projectId = window?.currentProjectId || null;
        const resp = await fetch(`${API_BASE}/api/external-apis/${apiId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...metadata, projectId })
        });
        if (!resp.ok) throw new Error('Failed to update API');
        setApis((s) => s.map((a) => (a.id === apiId ? { ...a, ...metadata } : a)));
      } catch (err) {
        console.error('Error updating API metadata:', err);
        throw err;
      }
    },
    [db]
  );

  return {
    apis,
    setApis,
    apisLoading,
    newApiName,
    setNewApiName,
    newApiUrl,
    setNewApiUrl,
    selectedApiId,
    setSelectedApiId,
    testing,
    testResult,
    testInput,
    setTestInput,
    loadApis,
    addApi,
    deleteApi,
    saveApiPrompt,
    updateApiMetadata,
    testApi,
  };
}
