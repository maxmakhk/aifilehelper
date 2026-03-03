import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';

/**
 * Load rule sources (functionsList) from Firebase
 */
const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) || import.meta.env.VITE_API_BASE || 'http://localhost:3001';

export async function loadRuleSources(_dbPlaceholder, normalizeLegacyFromFunctions, createRuleId) {
  try {
    const resp = await fetch(`${API_BASE}/api/rules`);
    if (!resp.ok) throw new Error('Failed to load rules');
    const rules = await resp.json();

    // Normalize into functionsList format expected by callers
    const normalized = (Array.isArray(rules) ? rules : []).map((r) => {
      const id = r.id || createRuleId();
      return {
        id,
        ruleId: r.rule_id || r.ruleId || id,
        type: r.type || 'Rule Checker',
        name: r.name || '',
        expr: r.expr || '',
        detectPrompt: r.detect_prompt || r.detectPrompt || '',
        systemPrompt: r.system_prompt || r.systemPrompt || '',
        relatedFields: r.related_fields || r.relatedFields || '',
        categoryId: r.category_id || r.categoryId || '',
        workflowObject: r.workflowObject || r.workflow_object || null,
      };
    });

    const legacy = normalizeLegacyFromFunctions ? normalizeLegacyFromFunctions(normalized) : null;
    return {
      functionsList: normalized,
      ruleSource: legacy ? legacy.src : normalized.map(n => n.expr),
      ruleExpressions: legacy ? legacy.expr : normalized.map(n => n.expr),
      ruleDetectPrompts: legacy ? legacy.detectPrompts : normalized.map(n => n.detectPrompt || ''),
      ruleRelatedFields: legacy ? legacy.relatedFields : normalized.map(n => n.relatedFields || ''),
      ruleCategoryIds: legacy ? legacy.categoryIds : normalized.map(n => n.categoryId || ''),
      rulePrompts: legacy ? legacy.prompts : normalized.map(n => n.detectPrompt || ''),
      ruleNames: legacy ? legacy.names : normalized.map(n => n.name || ''),
      ruleTypes: legacy ? legacy.types : normalized.map(n => n.type || ''),
      ruleSystemPrompts: legacy ? legacy.systemPrompts : normalized.map(n => n.systemPrompt || ''),
    };
  } catch (err) {
    console.error('Error loading rule sources from server:', err);
    throw err;
  }
}

/**
 * Save rule sources to Firebase
 */
export async function saveRuleSources(
  db,
  override = null,
  {
    ruleSource,
    rulePrompts,
    ruleNames,
    ruleTypes,
    ruleSystemPrompts,
    ruleDetectPrompts,
    ruleRelatedFields,
    ruleCategoryIds,
    functionsList,
    normalizeLegacyFromFunctions,
    createRuleId,
  }
) {
  try {
    const effectiveRuleSource = override?.ruleSource ?? ruleSource;
    const effectiveRulePrompts = override?.rulePrompts ?? rulePrompts;
    const effectiveRuleNames = override?.ruleNames ?? ruleNames;
    const effectiveRuleTypes = override?.ruleTypes ?? ruleTypes;
    const effectiveRuleSystemPrompts = override?.ruleSystemPrompts ?? ruleSystemPrompts;
    const effectiveRuleDetectPrompts = override?.ruleDetectPrompts ?? ruleDetectPrompts;
    const effectiveRuleRelatedFields = override?.ruleRelatedFields ?? ruleRelatedFields;
    const effectiveRuleCategoryIds = override?.ruleCategoryIds ?? ruleCategoryIds;
    const effectiveFunctionsList = override?.functionsList ?? functionsList;

    let toSaveFunctions = (effectiveRuleSource && effectiveRuleSource.length)
      ? (effectiveRuleSource || []).map((expr, idx) => ({
          type: (effectiveRuleTypes && effectiveRuleTypes[idx]) ? effectiveRuleTypes[idx] : 'Rule Checker',
          name: (effectiveRuleNames && effectiveRuleNames[idx]) ? effectiveRuleNames[idx] : ((effectiveRulePrompts && effectiveRulePrompts[idx]) ? effectiveRulePrompts[idx] : `Rule ${idx + 1}`),
          expr: expr || '',
          detectPrompt: (effectiveRuleDetectPrompts && effectiveRuleDetectPrompts[idx]) ? effectiveRuleDetectPrompts[idx] : '',
          systemPrompt: (effectiveRuleSystemPrompts && effectiveRuleSystemPrompts[idx]) ? effectiveRuleSystemPrompts[idx] : '',
          relatedFields: (effectiveRuleRelatedFields && effectiveRuleRelatedFields[idx]) ? effectiveRuleRelatedFields[idx] : '',
          categoryId: (effectiveRuleCategoryIds && effectiveRuleCategoryIds[idx]) ? effectiveRuleCategoryIds[idx] : '',
          workflowObject: (effectiveFunctionsList && effectiveFunctionsList[idx] && effectiveFunctionsList[idx].workflowObject)
            ? effectiveFunctionsList[idx].workflowObject
            : ''
        }))
      : (effectiveFunctionsList || []);

    const normalizedFunctions = (toSaveFunctions && toSaveFunctions.length > 0)
      ? toSaveFunctions.map((f) => {
          const baseId = (f && (f.id || f.ruleId)) ? (f.id || f.ruleId) : createRuleId();
          return { ...(f || {}), id: baseId, ruleId: (f && f.ruleId) ? f.ruleId : baseId };
        })
      : [];

    const legacyFromFunctions = (normalizedFunctions && normalizedFunctions.length > 0)
      ? normalizeLegacyFromFunctions(normalizedFunctions)
      : null;
    
    const toSaveRuleSource = legacyFromFunctions ? legacyFromFunctions.src : effectiveRuleSource;
    const toSaveRulePrompts = legacyFromFunctions ? legacyFromFunctions.prompts : effectiveRulePrompts;
    const toSaveRuleNames = legacyFromFunctions ? legacyFromFunctions.names : effectiveRuleNames;
    const toSaveRuleTypes = legacyFromFunctions ? legacyFromFunctions.types : effectiveRuleTypes;
    const toSaveRuleSystemPrompts = legacyFromFunctions ? legacyFromFunctions.systemPrompts : effectiveRuleSystemPrompts;
    const toSaveRuleDetectPrompts = legacyFromFunctions ? legacyFromFunctions.detectPrompts : effectiveRuleDetectPrompts;
    const toSaveRuleRelatedFields = legacyFromFunctions ? legacyFromFunctions.relatedFields : effectiveRuleRelatedFields;
    const toSaveRuleCategoryIds = legacyFromFunctions ? legacyFromFunctions.categoryIds : effectiveRuleCategoryIds;

    // Upsert each function as an individual rule via server API
    for (const f of normalizedFunctions) {
      try {
        await fetch(`${API_BASE}/api/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      } catch (e) { console.warn('Failed to save rule to server', e); }
    }
  } catch (err) {
    console.error('Error saving rules:', err);
    throw err;
  }
}

/**
 * Build functionsList from legacy arrays
 */
function buildFunctionsListFromLegacy(
  ruleSource,
  ruleNames,
  ruleTypes,
  ruleSystemPrompts,
  ruleDetectPrompts,
  ruleRelatedFields,
  ruleCategoryIds,
  createRuleId
) {
  return (ruleSource || []).map((expr, idx) => {
    const newId = createRuleId();
    return {
      id: newId,
      ruleId: newId,
      type: (ruleTypes && ruleTypes[idx]) ? ruleTypes[idx] : 'Rule Checker',
      name: (ruleNames && ruleNames[idx]) ? ruleNames[idx] : `Rule ${idx + 1}`,
      expr: expr || '',
      systemPrompt: (ruleSystemPrompts && ruleSystemPrompts[idx]) ? ruleSystemPrompts[idx] : '',
      detectPrompt: (ruleDetectPrompts && ruleDetectPrompts[idx]) ? ruleDetectPrompts[idx] : '',
      relatedFields: (ruleRelatedFields && ruleRelatedFields[idx]) ? ruleRelatedFields[idx] : '',
      categoryId: (ruleCategoryIds && ruleCategoryIds[idx]) ? ruleCategoryIds[idx] : ''
    };
  });
}
