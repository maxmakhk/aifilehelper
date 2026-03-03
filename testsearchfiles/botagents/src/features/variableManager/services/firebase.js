// Replace Firebase-based rule operations with server API calls
const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) || import.meta.env.VITE_API_BASE || 'http://localhost:3001';

export async function saveRuleToFirebase(dbPlaceholder, payLoad) {
  try {
    // Normalize workflowObject and strip injected nodes similar to previous logic
    let workflowObj = payLoad.workflowObject || payLoad.workflowObject || null;
    try {
      if (typeof workflowObj === 'string' && workflowObj.trim()) {
        workflowObj = JSON.parse(workflowObj);
      }
    } catch (e) { /* ignore */ }

    const body = {
      ...payLoad,
      workflowObject: workflowObj
    };

    const resp = await fetch(`${API_BASE}/api/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!resp.ok) {
      const txt = await resp.text();
      console.error('saveRuleToServer failed', resp.status, txt);
      return { success: false, error: txt };
    }
    return { success: true };
  } catch (err) {
    console.error('saveRuleToServer error', err);
    return { success: false, error: err };
  }
}

export async function loadRulesFromFirebaseService(opts = {}) {
  // opts: { db: ignored, categoryId }
  try {
    const qs = opts?.categoryId ? `?categoryId=${encodeURIComponent(opts.categoryId)}` : '';
    const resp = await fetch(`${API_BASE}/api/rules${qs}`);
    if (!resp.ok) throw new Error(`Failed to load rules: ${resp.status}`);
    const data = await resp.json();

    // normalize into previous return shape
    const rules = (Array.isArray(data) ? data : []).map((d) => ({
      id: d.id,
      ruleId: d.rule_id || d.ruleId || d.id,
      type: d.type || 'Rule Checker',
      name: d.name || '',
      expr: d.expr || '',
      detectPrompt: d.detect_prompt || d.detectPrompt || '',
      systemPrompt: d.system_prompt || d.systemPrompt || '',
      relatedFields: d.related_fields || d.relatedFields || '',
      categoryId: d.category_id || d.categoryId || '',
      workflowObject: d.workflowObject || d.workflow_object || null,
      createdAt: d.created_at || d.createdAt || null,
      updatedAt: d.updated_at || d.updatedAt || null,
    }));

    const ruleSource = rules.map(r => r.expr);
    const rulePrompts = rules.map(r => r.detectPrompt);
    const ruleNames = rules.map(r => r.name);
    const ruleTypes = rules.map(r => r.type);
    const ruleSystemPrompts = rules.map(r => r.systemPrompt);
    const ruleDetectPrompts = rules.map(r => r.detectPrompt);
    const ruleRelatedFields = rules.map(r => r.relatedFields);
    const ruleCategoryIds = rules.map(r => r.categoryId);
    const functionsList = rules;

    return {
      success: true,
      ruleSource,
      rulePrompts,
      ruleNames,
      ruleTypes,
      ruleSystemPrompts,
      ruleDetectPrompts,
      ruleRelatedFields,
      ruleCategoryIds,
      functionsList,
      count: rules.length,
    };
  } catch (err) {
    console.error('Error loading rules from server:', err);
    return { success: false, error: err, count: 0 };
  }
}

export async function deleteRuleFromServer(ruleId) {
  try {
    const resp = await fetch(`${API_BASE}/api/rules/${encodeURIComponent(ruleId)}`, { method: 'DELETE' });
    if (!resp.ok) {
      const txt = await resp.text();
      console.error('deleteRuleFromServer failed', resp.status, txt);
      return { success: false, error: txt };
    }
    return { success: true };
  } catch (err) {
    console.error('deleteRuleFromServer error', err);
    return { success: false, error: err };
  }
}

