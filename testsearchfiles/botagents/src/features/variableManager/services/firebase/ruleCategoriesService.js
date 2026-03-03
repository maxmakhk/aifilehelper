// HTTP-backed rule category operations (via server API)
const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) || import.meta.env.VITE_API_BASE || 'http://localhost:3001';

export async function loadRuleCategories() {
  try {
    const resp = await fetch(`${API_BASE}/api/rule-categories`);
    if (!resp.ok) throw new Error(`Failed to load categories: ${resp.status}`);
    const data = await resp.json();
    return data;
  } catch (err) {
    console.error('Error loading rule categories from server:', err);
    throw err;
  }
}

export async function saveRuleCategory(_dbPlaceholder, { categoryId, name }) {
  try {
    const body = { id: categoryId, name };
    const resp = await fetch(`${API_BASE}/api/rule-categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!resp.ok) throw new Error(`Failed to save category: ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error('Error saving rule category to server:', err);
    throw err;
  }
}

export async function deleteRuleCategory(_dbPlaceholder, id) {
  try {
    const resp = await fetch(`${API_BASE}/api/rule-categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error(`Failed to delete category: ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error('Error deleting rule category on server:', err);
    throw err;
  }

}

export function resolveDefaultCategoryId(categories = []) {
  const standard = categories.find((c) => (c?.name || '').toLowerCase() === 'standardrule');
  return standard ? standard.id : (categories[0]?.id || '');
}
