import { useState, useEffect, useCallback } from 'react';
import {
  loadRuleSources as firebaseLoadRuleSources,
  saveRuleSources as firebasesSaveRuleSources,
} from '../services/firebase/rulesService';
import {
  loadRuleCategories as firebaseLoadRuleCategories,
  saveRuleCategory as firebaseSaveRuleCategory,
  deleteRuleCategory as firebaseDeleteRuleCategory,
  resolveDefaultCategoryId,
} from '../services/firebase/ruleCategoriesService';
import {
  loadRuleGroups as firebaseLoadRuleGroups,
  saveRuleGroup as firebaseSaveRuleGroup,
  deleteRuleGroup as firebaseDeleteRuleGroup,
  resolveRuleExpression,
} from '../services/firebase/ruleGroupsService';

/**
 * useRuleSources hook
 * Manages rule sources, categories, groups, and all rule-related state
 */
export default function useRuleSources(db) {
  // Rule sources and prompts state
  const [ruleSource, setRuleSource] = useState([`v.qty % 2 === 1`, `v.qty <= 10`]);
  const [rulePrompts, setRulePrompts] = useState(['odd quantities', 'quantities less than or equal to 10']);
  const [ruleNames, setRuleNames] = useState(['odd quantities', 'quantities less than or equal to 10']);
  const [ruleTypes, setRuleTypes] = useState(['Rule Checker', 'Rule Checker']);
  const [ruleSystemPrompts, setRuleSystemPrompts] = useState(['', '']);
  const [ruleDetectPrompts, setRuleDetectPrompts] = useState(['', '']);
  const [ruleRelatedFields, setRuleRelatedFields] = useState(['', '']);
  const [ruleCategoryIds, setRuleCategoryIds] = useState(['', '']);
  const [ruleExpressions, setExpression] = useState(['', '']);
  const [functionsList, setFunctionsList] = useState([]);

  // Categories state
  const [ruleCategories, setRuleCategories] = useState([]);
  const [selectedRuleCategoryId, setSelectedRuleCategoryId] = useState('');
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);

  // Groups state
  const [ruleGroups, setRuleGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupContent, setNewGroupContent] = useState('');
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupTesting, setGroupTesting] = useState(false);

  // Utilities
  const createRuleId = useCallback(() => `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, []);

  const normalizeLegacyFromFunctions = useCallback((functions = []) => {
    const src = functions.map((f) => f.expr || '');
    const prompts = functions.map((f) => f.prompt || f.name || '');
    const names = functions.map((f) => f.name || f.prompt || '');
    const types = functions.map((f) => f.type || 'Rule Checker');
    const systemPrompts = functions.map((f) => f.systemPrompt || '');
    const detectPrompts = functions.map((f) => f.detectPrompt || f.detectPrompts || '');
    const relatedFields = functions.map((f) => f.relatedFields || '');
    const categoryIds = functions.map((f) => f.categoryId || '');
    return { src, expr: src, prompts, names, types, systemPrompts, detectPrompts, relatedFields, categoryIds };
  }, []);

  // Load rule sources on mount
  const loadRuleSources = useCallback(async () => {
    try {
      const result = await firebaseLoadRuleSources(db, normalizeLegacyFromFunctions, createRuleId);
      if (result) {
        setFunctionsList(result.functionsList);
        setRuleSource(result.ruleSource);
        setRulePrompts(result.rulePrompts);
        setRuleNames(result.ruleNames);
        setRuleTypes(result.ruleTypes);
        setRuleSystemPrompts(result.ruleSystemPrompts);
        setRuleDetectPrompts(result.ruleDetectPrompts);
        setRuleRelatedFields(result.ruleRelatedFields);
        setRuleCategoryIds(result.ruleCategoryIds);
        setExpression(result.ruleExpressions);
      }
    } catch (err) {
      console.error('Error loading rule sources:', err);
    }
  }, [db, normalizeLegacyFromFunctions, createRuleId]);

  // Save rule sources
  const saveRuleSources = useCallback(
    async (override = null) => {
      try {
        await firebasesSaveRuleSources(db, override, {
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
        });
      } catch (err) {
        console.error('Error saving rules:', err);
        throw err;
      }
    },
    [db, ruleSource, rulePrompts, ruleNames, ruleTypes, ruleSystemPrompts, ruleDetectPrompts, ruleRelatedFields, ruleCategoryIds, functionsList, normalizeLegacyFromFunctions, createRuleId]
  );

  // Load categories
  const loadRuleCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const arr = await firebaseLoadRuleCategories(db);
      setRuleCategories(arr);

      const defaultId = resolveDefaultCategoryId(arr);
      // Only reset category if it's not 'all' and either missing or invalid
      if (selectedRuleCategoryId !== 'all' && (!selectedRuleCategoryId || !arr.find((c) => c.id === selectedRuleCategoryId))) {
        setSelectedRuleCategoryId(defaultId || 'all');
      }
    } catch (err) {
      console.error('Error loading rule categories:', err);
    } finally {
      setCategoriesLoading(false);
    }
  }, [db, selectedRuleCategoryId]);

  // Save category
  const saveRuleCategory = useCallback(
    async (name) => {
      try {
        await firebaseSaveRuleCategory(db, {
          categoryId: editingCategoryId,
          name,
        });
        await loadRuleCategories();
        setNewCategoryName('');
        setEditingCategoryId(null);
      } catch (err) {
        console.error('Error saving rule category:', err);
        throw err;
      }
    },
    [db, editingCategoryId, loadRuleCategories]
  );

  // Delete category
  const deleteRuleCategory = useCallback(
    async (id) => {
      try {
        await firebaseDeleteRuleCategory(db, id);
        setRuleCategoryIds((ids) => ids.map((cid) => (cid === id ? '' : cid)));
        if (selectedRuleCategoryId === id) setSelectedRuleCategoryId('all');
        await loadRuleCategories();
      } catch (err) {
        console.error('Error deleting category:', err);
        throw err;
      }
    },
    [db, selectedRuleCategoryId, loadRuleCategories]
  );

  // Load groups
  const loadRuleGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const arr = await firebaseLoadRuleGroups(db);
      setRuleGroups(arr);
    } catch (err) {
      console.error('Error loading rule groups:', err);
    } finally {
      setGroupsLoading(false);
    }
  }, [db]);

  // Save group
  const saveRuleGroup = useCallback(
    async (name, rules) => {
      try {
        await firebaseSaveRuleGroup(db, {
          groupId: editingGroupId,
          name,
          rules,
        });
        await loadRuleGroups();
        setNewGroupName('');
        setNewGroupContent('');
        setEditingGroupId(null);
      } catch (err) {
        console.error('Error saving rule group:', err);
        throw err;
      }
    },
    [db, editingGroupId, loadRuleGroups]
  );

  // Delete group
  const deleteRuleGroup = useCallback(
    async (id) => {
      try {
        await firebaseDeleteRuleGroup(db, id);
        if (selectedGroupId === id) setSelectedGroupId(null);
        await loadRuleGroups();
      } catch (err) {
        console.error('Error deleting group:', err);
        throw err;
      }
    },
    [db, selectedGroupId, loadRuleGroups]
  );

  // Fill missing category IDs with default
  useEffect(() => {
    if (!ruleCategoryIds || ruleCategoryIds.length === 0) return;
    if (!ruleCategories || ruleCategories.length === 0) return;

    const defaultId = resolveDefaultCategoryId(ruleCategories);
    if (!defaultId) return;

    const needsFill = ruleCategoryIds.some((id) => !id);
    if (!needsFill) return;

    setRuleCategoryIds((ids) => ids.map((id) => id || defaultId));
  }, [ruleCategories, ruleCategoryIds]);

  // Load on mount
  useEffect(() => {
    loadRuleSources();
    loadRuleCategories();
    loadRuleGroups();
  }, [loadRuleSources, loadRuleCategories, loadRuleGroups]);

  return {
    // Rule sources
    ruleSource,
    setRuleSource,
    rulePrompts,
    setRulePrompts,
    ruleNames,
    setRuleNames,
    ruleTypes,
    setRuleTypes,
    ruleSystemPrompts,
    setRuleSystemPrompts,
    ruleDetectPrompts,
    setRuleDetectPrompts,
    ruleRelatedFields,
    setRuleRelatedFields,
    ruleCategoryIds,
    setRuleCategoryIds,
    ruleExpressions,
    setExpression,
    functionsList,
    setFunctionsList,
    saveRuleSources,

    // Categories
    ruleCategories,
    selectedRuleCategoryId,
    setSelectedRuleCategoryId,
    categoriesLoading,
    newCategoryName,
    setNewCategoryName,
    editingCategoryId,
    setEditingCategoryId,
    saveRuleCategory,
    deleteRuleCategory,
    loadRuleCategories,

    // Groups
    ruleGroups,
    selectedGroupId,
    setSelectedGroupId,
    groupsLoading,
    newGroupName,
    setNewGroupName,
    newGroupContent,
    setNewGroupContent,
    editingGroupId,
    setEditingGroupId,
    groupTesting,
    setGroupTesting,
    saveRuleGroup,
    deleteRuleGroup,
    loadRuleGroups,

    // Utilities
    createRuleId,
    normalizeLegacyFromFunctions,
    resolveDefaultCategoryId,
    resolveRuleExpression,
  };
}
