/**
 * variablesService.js
 * Provides CRUD operations for variables via Node.js REST API (SQLite-backed)
 * Replaces previous Firebase Firestore implementation
 */

const getApiBase = () => {
  if (typeof window !== 'undefined' && window.__API_BASE__) {
    return window.__API_BASE__;
  }
  // Fallback to localhost API server
  return 'http://localhost:3001';
};

export const fetchVariables = async () => {
  try {
    const API_BASE = getApiBase();
    const resp = await fetch(`${API_BASE}/api/variables`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetching variables:', err);
    return [];
  }
};

export const createVariableDoc = async (payload) => {
  try {
    const API_BASE = getApiBase();
    const resp = await fetch(`${API_BASE}/api/variables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return { id: data.id, ...payload };
  } catch (err) {
    console.error('Error creating variable:', err);
    throw err;
  }
};

export const updateVariableDoc = async (id, payload) => {
  try {
    const API_BASE = getApiBase();
    const resp = await fetch(`${API_BASE}/api/variables/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error('Error updating variable:', err);
    throw err;
  }
};

export const deleteVariableDoc = async (id) => {
  try {
    const API_BASE = getApiBase();
    const resp = await fetch(`${API_BASE}/api/variables/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error('Error deleting variable:', err);
    throw err;
  }
};

export const updateSignalDoc = async (id, signalName, payload) => {
  try {
    const API_BASE = getApiBase();
    const resp = await fetch(`${API_BASE}/api/variables/${id}/signal/${signalName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error('Error updating signal:', err);
    throw err;
  }
};

export const updateSignalFieldDoc = async (id, signalName, fieldName, value) => {
  try {
    const API_BASE = getApiBase();
    const resp = await fetch(`${API_BASE}/api/variables/${id}/signal/${signalName}/${fieldName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error('Error updating signal field:', err);
    throw err;
  }
};

export const removeSignalDoc = async (id, signalName) => {
  try {
    const API_BASE = getApiBase();
    const resp = await fetch(`${API_BASE}/api/variables/${id}/signal/${signalName}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error('Error removing signal:', err);
    throw err;
  }
};
