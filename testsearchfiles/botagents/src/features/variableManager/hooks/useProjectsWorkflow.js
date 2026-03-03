import { useState, useCallback } from 'react';
import { buildWorkflowPayload, generateFunctionFromWorkflow, generateWorkflowVisualization } from '../services/projectsService';
import { AI_CHAT_ENDPOINT } from '../services/ai/aichatService';
import { extractKeywords, findRelatedVariables } from '../utils/variableUtils';

export default function useProjectsWorkflow({
  db,
  variables,
  listStructure,
  runFilter,
  ruleExpressions,
  ruleRelatedFields,
  ruleNames,
  rulePrompts,
  ruleDetectPrompts,
  ruleSystemPrompts,
  functionsList,
  selectedRuleIndex,
  aiPrompt,
  setAiPrompt,
  aiResponse,
  setAiResponse,
  setAiWarning,
  setAiLoading,
  setWorkflowLoading,
  setWorkflowError,
  setWorkflowData,
  workflowData,
  syncVariablesFromDatalist,
  appendLog,
  tabSwitchLockRef,
  setActiveTab,
  rfNodes,
  rfEdges,
  getDocs,
  collection
}) {
  const [execProgress, setExecProgress] = useState(null); // {current, total, status}
  const [execLog, setExecLog] = useState([]); // detailed per-action status entries
  const [filteredVariables, setFilteredVariables] = useState(null); // current in-memory filtered list
  const [taskFunctionText, setTaskFunctionText] = useState(''); // task function code
  const [pendingActions, setPendingActions] = useState(null); // preview of actions before execution
  const [pendingTaskFunction, setPendingTaskFunction] = useState(null); // generated task function awaiting confirmation
  const [taskFunctionContext, setTaskFunctionContext] = useState({ currentStep: 0 });

  const detectActionCount = useCallback(async (userPrompt, relatedContext) => {
    const actionDescriptions = (functionsList && functionsList.length > 0)
      ? functionsList
          .map((fn, idx) => {
            const detectMsg = ruleDetectPrompts && ruleDetectPrompts[idx] ? ruleDetectPrompts[idx].trim() : '';
            if (detectMsg) {
              return `- ${fn.name || `Rule ${idx + 1}`}: ${detectMsg}`;
            }
            return null;
          })
          .filter(Boolean)
      : ruleDetectPrompts
          .map((p, idx) => {
            if (p && p.trim()) {
              const name = (ruleNames && ruleNames[idx]) ? ruleNames[idx] : ((rulePrompts && rulePrompts[idx]) ? rulePrompts[idx] : `Rule ${idx + 1}`);
              return `- ${name}: ${p.trim()}`;
            }
            return null;
          })
          .filter(Boolean);

    const detectPrompt = {
      role: 'user',
      prompt: userPrompt,
      system: `
    You are a task orchestrator that generates step-by-step action plans.

    INPUT: User instruction (natural language)
    OUTPUT: A JavaScript arrow function that returns actions based on the current step

    REQUIRED OUTPUT FORMAT:
    Return ONLY a JavaScript arrow function string (no markdown, no code blocks):

    (ctx) => {
    if (!ctx.currentStep) ctx.currentStep = 0;
    
    if (ctx.currentStep === 0) {
        return {
        actions: [
            { action: "actionName", raw_instruction: "user's words", notes: "what this does" }
        ]
        };
    }
    
    if (ctx.currentStep === 1) {
        return {
        actions: [
            { action: "anotherAction", raw_instruction: "user's words", notes: "what this does" }
        ]
        };
    }
    
    return { actions: [], done: true };
    }

    CRITICAL RULES:
    1. Return ONLY the arrow function - no JSON wrapper, no markdown blocks
    2. Start with: (ctx) => {
    3. End with: }
    4. Use single quotes (') for all strings inside the function
    5. Each step returns { actions: [...] }
    6. Final step returns { actions: [], done: true }
    7. Do NOT include \`\`\`javascript or any formatting

    ACTION OBJECT STRUCTURE:
    {
    "action": "actionName",           // Must be from allowed actions list
    "raw_instruction": "substring",   // Direct quote from user input
    "notes": "explanation"            // What this action does
    }

    ALLOWED ACTIONS:
    ${actionDescriptions.join('\n')}

    STEP PLANNING GUIDELINES:
    - Each step should contain logically grouped actions
    - Dependencies should be in earlier steps
    - Use ctx.currentStep to track progress
    - Increment step after each execution

    EXAMPLE 1 - Simple single-step task:
    User: "Filter items with qty < 10"
    Output:
    (ctx) => {
    if (!ctx.currentStep) ctx.currentStep = 0;
    if (ctx.currentStep === 0) {
        return {
        actions: [
            { action: 'runFilter', raw_instruction: 'Filter items with qty < 10', notes: 'Filter items where quantity is less than 10' }
        ]
        };
    }
    return { actions: [], done: true };
    }

    EXAMPLE 2 - Multi-step task:
    User: "Create 5 apples, then update their quantity to 10"
    Output:
    (ctx) => {
    if (!ctx.currentStep) ctx.currentStep = 0;
    if (ctx.currentStep === 0) {
        return {
        actions: [
            { action: 'createItem', raw_instruction: 'Create 5 apples', notes: 'Create new item named apple with qty 5' }
        ]
        };
    }
    if (ctx.currentStep === 1) {
        return {
        actions: [
            { action: 'updateQty', raw_instruction: 'update their quantity to 10', notes: 'Update apple quantity to 10' }
        ]
        };
    }
    return { actions: [], done: true };
    }

    EXAMPLE 3 - Complex multi-action task:
    User: "Remove items with qty < 5 and create 10 new hero items"
    Output:
    (ctx) => {
    if (!ctx.currentStep) ctx.currentStep = 0;
    if (ctx.currentStep === 0) {
        return {
        actions: [
            { action: 'removeItem', raw_instruction: 'Remove items with qty < 5', notes: 'Mark items for removal where quantity is less than 5' }
        ]
        };
    }
    if (ctx.currentStep === 1) {
        return {
        actions: [
            { action: 'createItem', raw_instruction: 'create 10 new hero items', notes: 'Create 10 new items with hero prefix' }
        ]
        };
    }
    return { actions: [], done: true };
    }

    RELATED CONTEXT (use for field references):
    ${relatedContext}
    or you can suggest a new action if needed based on the instruction.

    IMPORTANT REMINDERS:
    - Output ONLY the function code
    - NO markdown code blocks
    - NO explanatory text before or after
    - Use single quotes inside the function
    - Your entire response should be executable JavaScript
    `
    };

    try {
      const response = await fetch(AI_CHAT_ENDPOINT || import.meta.env.VITE_AI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detectPrompt)
      });
      const data = await response.json();
      const content = (data.content || data.error || JSON.stringify(data)).trim();
      const cleaned = content
        .replace(/```javascript\s*/g, '')
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const looksLikeFunction = /\(\s*ctx\s*\)\s*=>|function\s*\(/i.test(cleaned) || cleaned.startsWith('(');
      if (looksLikeFunction) {
        return { actions: [], content: cleaned, parsed: null, taskFunction: cleaned };
      }

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { actions: (parsed && parsed.actions) ? parsed.actions : [], content: cleaned, parsed, taskFunction: null };
      }

      return { actions: [], content: cleaned, parsed: null, taskFunction: null };
    } catch (err) {
      return { actions: [], content: '', parsed: null, taskFunction: null, error: err.message };
    }
  }, [functionsList, ruleDetectPrompts, ruleNames, rulePrompts]);

  const executeActionPrompt = useCallback(async (userPrompt, actionSpec, relatedContext, structureInfo = null) => {
    const resolveSystemPrompt = () => {
      if (!actionSpec) return '';
      const ruleName = actionSpec.action || '';
      if (ruleName && Array.isArray(functionsList) && functionsList.length > 0) {
        const fn = functionsList.find((f) => (f.name || '') === ruleName);
        if (fn && fn.systemPrompt) return fn.systemPrompt;
      }
      if (ruleName && Array.isArray(ruleNames)) {
        const idx = ruleNames.findIndex((name) => name === ruleName);
        if (idx >= 0 && Array.isArray(ruleSystemPrompts) && ruleSystemPrompts[idx]) {
          return ruleSystemPrompts[idx];
        }
      }
      if (typeof selectedRuleIndex !== 'undefined' && Array.isArray(ruleSystemPrompts)) {
        return ruleSystemPrompts[selectedRuleIndex] || '';
      }
      return '';
    };

    const actionPrompt = {
      role: 'user',
      prompt: actionSpec.notes + '\n' + actionSpec.remark,
      system: ``
    };

    try {
      const sp = resolveSystemPrompt();
      if (sp && sp.trim()) {
        actionPrompt.system += `\n\n${sp.trim()}`;
      }
    } catch (e) {
      // ignore if state not available in this context
    }

    if (structureInfo && structureInfo.trim()) {
      actionPrompt.system += `\n\nCurrent Database Structure:\n${structureInfo}`;
    }

    try {
      const response = await fetch(AI_CHAT_ENDPOINT || import.meta.env.VITE_AI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionPrompt)
      });

      const data = await response.json();
      const content = (data.content || data.error || '').trim();

      const cleanedContent = content
        .replace(/```javascript\s*/g, '')
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      try {
        const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed;
        }
      } catch (parseErr) {
        // ignore parse error
      }

      return cleanedContent;
    } catch (err) {
      return null;
    }
  }, [functionsList, ruleNames, ruleSystemPrompts, selectedRuleIndex]);

  const executeAction = useCallback(async (parsed, context = null) => {
    if (typeof parsed === 'string') {
      parsed = {
        action: 'runFilter',
        details: { expression: parsed }
      };
    }
    if (!parsed || !parsed.action) {
      return false;
    }
    try {
      const qs = await getDocs(collection(db, 'variables'));
      const freshVars = [];
      qs.forEach((d) => freshVars.push({ id: d.id, ...d.data() }));

      const datalist = (context && Array.isArray(context.datalist)) ? context.datalist : freshVars;
      const updateContextItem = (id, updater) => {
        if (!context || !Array.isArray(context.datalist)) return;
        const idx = context.datalist.findIndex((v) => v.id === id);
        if (idx < 0) return;
        const current = context.datalist[idx];
        const next = updater(current);
        const copy = [...context.datalist];
        copy[idx] = next;
        context.datalist = copy;
        if (context.setDatalist) context.setDatalist(copy);
      };
      const removeContextItem = (id) => {
        if (!context || !Array.isArray(context.datalist)) return;
        const copy = context.datalist.filter((v) => v.id !== id);
        context.datalist = copy;
        if (context.setDatalist) context.setDatalist(copy);
      };

      const expression = (() => {
        if (parsed.details && parsed.details.expression && typeof parsed.details.expression === 'string') {
          return parsed.details.expression;
        }
        if (typeof selectedRuleIndex !== 'undefined' && Array.isArray(ruleExpressions)) {
          return ruleExpressions[selectedRuleIndex] || '';
        }
        return '';
      })();

      const result = runFilter({ datalist, expression });
      if (context) {
        context.datalist = result;
        if (context.setDatalist) context.setDatalist(result);
      }

      // updateContextItem/removeContextItem kept for future actions
      void updateContextItem;
      void removeContextItem;

      return true;
    } catch (err) {
      return false;
    }
  }, [db, getDocs, collection, runFilter, ruleExpressions, selectedRuleIndex]);

  const runActionSpecs = useCallback(async (actionSpecs) => {
    if (!actionSpecs || actionSpecs.length === 0) return;
    setAiLoading(true);
    setAiWarning('');
    setAiResponse(`Executing ${actionSpecs.length} action(s)...`);
    try {
      setExecProgress({ current: 0, total: actionSpecs.length, status: 'Starting', currentActionName: '' });
      setExecLog([]);
      let currentRelatedContext = null;
      const keywords = extractKeywords(aiPrompt);
      const relatedVariables = findRelatedVariables(variables, keywords, 5);
      currentRelatedContext = relatedVariables.length
        ? relatedVariables.map((v) => `- ${v.name}: ${v.description}${v.qty !== undefined ? ` (qty: ${v.qty})` : ''}${v.tag?.length ? ` [tags: ${v.tag.join(', ')}]` : ''}`).join('\n')
        : 'None';

      const runContext = { datalist: variables.slice(), setDatalist: setFilteredVariables };
      const enrichedVariables = listStructure({ datalist: runContext.datalist });
      runContext.datalist = enrichedVariables;

      setFilteredVariables(runContext.datalist);

      for (let i = 0; i < actionSpecs.length; i++) {
        const actionSpec = actionSpecs[i];
        if (!actionSpec.action && actionSpec.name) actionSpec.action = actionSpec.name;
        if (!actionSpec.description && actionSpec.notes) actionSpec.description = actionSpec.notes;
        const idx = i + 1;
        const actionName = actionSpec.action || `action-${idx} ${actionSpec.name || 'no name'}`;
        const actionDesc = actionSpec.description || '';

        const startEntry = { idx, action: actionName, description: actionDesc, status: 'AI processing', ts: new Date() };
        setExecLog((s) => [...s, startEntry]);
        setExecProgress({ current: idx, total: actionSpecs.length, status: 'AI processing', currentActionName: actionName });

        const relatedFieldsRaw = (() => {
          if (actionSpec && actionSpec.action) {
            const idxByFunction = (functionsList && functionsList.length)
              ? functionsList.findIndex((f) => (f.name || '') === actionSpec.action)
              : -1;
            if (idxByFunction >= 0 && ruleRelatedFields[idxByFunction] !== undefined) {
              return ruleRelatedFields[idxByFunction] || '';
            }
            const idxByName = (ruleNames && ruleNames.length)
              ? ruleNames.findIndex((n) => n === actionSpec.action)
              : -1;
            if (idxByName >= 0 && ruleRelatedFields[idxByName] !== undefined) {
              return ruleRelatedFields[idxByName] || '';
            }
          }
          return ruleRelatedFields[selectedRuleIndex] || '';
        })();

        const relatedFieldKeys = (() => {
          const raw = (relatedFieldsRaw || '').trim();
          if (!raw) return [];
          if (raw.toLowerCase() === 'all') return null;
          return raw.split(',').map((s) => s.trim()).filter(Boolean);
        })();

        const filterPathsByFields = (paths) => {
          if (relatedFieldKeys === null) return paths;
          if (!relatedFieldKeys || relatedFieldKeys.length === 0) return paths;
          return (paths || []).filter((p) => {
            const key = String(p).split(':')[0].trim();
            return relatedFieldKeys.some((k) => key === k || key.startsWith(`${k}.`) || key.startsWith(`${k}[`));
          });
        };

        const structureInfo = runContext.datalist.slice(0, 10).map((v, idx2) => {
          const paths = filterPathsByFields(v.structure || []).slice(0, 20);
          const structLines = paths.length
            ? paths.map((p) => `  - ${p}`).join('\n')
            : '  (no structure information)';
          const totalCount = (relatedFieldKeys === null) ? (v.structure || []).length : filterPathsByFields(v.structure || []).length;
          const more = totalCount > paths.length ? '\n  - ...' : '';
          return `Item ${idx2 + 1} (${v.name}):\n${structLines}${more}`;
        }).join('\n\n');

        let attempt = 0;
        let executed = false;
        let parsed = null;
        let content = '';

        while (attempt < 10) {
          const promptResult = await executeActionPrompt(aiPrompt, actionSpec, currentRelatedContext, structureInfo);
          parsed = promptResult;

          if (parsed) {
            executed = await executeAction(parsed, runContext);
            if (executed === true || (typeof executed === 'string' && executed.startsWith('Skipped , Existed'))) {
              break;
            }

            actionSpec.remark = `Previous action execution failed. Please regenerate with a working expression. Attempt ${attempt + 1}/3.`;
          } else {
            actionSpec.remark = `Previous action parse failed. Please regenerate a valid action JSON. Attempt ${attempt + 1}/3.`;
          }

          attempt += 1;
        }

        if (parsed) {
          setExecLog((s) => s.map((r) => (r.idx === idx ? { ...r, status: 'Applying action', ts: new Date() } : r)));
          setExecProgress({ current: idx, total: actionSpecs.length, status: 'Applying action', currentActionName: actionName });

          const statusStr = executed === true ? 'Done' : (typeof executed === 'string' && executed.startsWith('Skipped , Existed')) ? 'Skipped , Existed' : 'Failed';
          setExecLog((s) => s.map((r) => (r.idx === idx ? { ...r, status: statusStr, ts: new Date() } : r)));

          await appendLog({
            prompt: `${aiPrompt} ${actionDesc} [Action ${idx}/${actionSpecs.length}: ${actionName}]`,
            rawResponse: content,
            parsed,
            parseError: null,
            action: actionName,
            warning: executed === true ? null : (statusStr === 'Skipped , Existed' ? executed : `Execution failed for ${actionName}`),
            createdAt: new Date(),
          });

          if (executed && i < actionSpecs.length - 1) {
            try {
              const qs = await getDocs(collection(db, 'variables'));
              const freshVars = [];
              qs.forEach((doc) => freshVars.push({ id: doc.id, ...doc.data() }));
              const updatedKeywords = extractKeywords(aiPrompt);
              const updatedRelatedVars = findRelatedVariables(freshVars, updatedKeywords, 5);
              currentRelatedContext = updatedRelatedVars.length
                ? updatedRelatedVars.map((v) => `- ${v.name}: ${v.description}${v.qty !== undefined ? ` (qty: ${v.qty})` : ''}${v.tag?.length ? ` [tags: ${v.tag.join(', ')}]` : ''}`).join('\n')
                : 'None';
            } catch (err) {
              // ignore refresh error
            }
          }
        } else {
          setExecLog((s) => s.map((r) => (r.idx === idx ? { ...r, status: 'Failed', ts: new Date() } : r)));
          setAiWarning(`Failed to execute action ${idx}: ${actionName}.`);
          await appendLog({
            prompt: `${aiPrompt} [Action ${idx}/${actionSpecs.length}: ${actionName}]`,
            rawResponse: content,
            parsed: null,
            action: actionName,
            warning: `Failed to execute ${actionName}`,
            createdAt: new Date(),
          });
          break;
        }
      }

      await syncVariablesFromDatalist(runContext.datalist);
      setAiResponse(`Execution finished for ${actionSpecs.length} action(s).`);
    } catch (err) {
      setAiWarning('Execution error: ' + err.message);
    }
    setAiLoading(false);
    setPendingActions(null);
    setExecProgress((p) => (p ? { ...p, status: 'Finished' } : { current: actionSpecs.length, total: actionSpecs.length, status: 'Finished' }));
  }, [
    aiPrompt,
    appendLog,
    collection,
    db,
    executeAction,
    executeActionPrompt,
    findRelatedVariables,
    functionsList,
    getDocs,
    listStructure,
    ruleNames,
    ruleRelatedFields,
    selectedRuleIndex,
    setAiLoading,
    setAiResponse,
    setAiWarning,
    setPendingActions,
    setExecProgress,
    setExecLog,
    setFilteredVariables,
    syncVariablesFromDatalist,
    variables
  ]);

  const runTaskFunction = useCallback(async (taskFnSource, initialContext = null) => {
    const ctx = { ...(initialContext || taskFunctionContext || { currentStep: 0 }) };
    let iterations = 0;
    const maxIterations = 20;

    while (iterations < maxIterations) {
      let result = null;
      try {
        const fn = new Function('ctx', `return (${taskFnSource})(ctx);`);
        result = fn(ctx);
      } catch (e) {
        break;
      }

      const actions = Array.isArray(result) ? result : (result && Array.isArray(result.actions) ? result.actions : []);
      const done = !!(result && result.done);

      if (!actions.length) {
        if (done) break;
        break;
      }

      const prevStep = ctx.currentStep;
      await runActionSpecs(actions);
      if (ctx.currentStep === prevStep) ctx.currentStep = (ctx.currentStep || 0) + 1;
      iterations += 1;
    }

    setTaskFunctionContext(ctx);
  }, [runActionSpecs, taskFunctionContext]);

  const handleAiSubmit = useCallback(async (e) => {
    e.preventDefault();
    setAiLoading(true);
    setAiResponse('');
    setAiWarning('');
    setExecProgress(null);
    setExecLog([]);
    setPendingActions(null);
    try {
      const keywords = extractKeywords(aiPrompt);
      const relatedVariables = findRelatedVariables(variables, keywords, 5);
      const relatedContext = relatedVariables.length
        ? relatedVariables
            .map((v) => `- ${v.name}: ${v.description}${v.qty !== undefined ? ` (qty: ${v.qty})` : ''}${v.tag?.length ? ` [tags: ${v.tag.join(', ')}]` : ''}`)
            .join('\n')
        : 'None';

      const detectResult = await detectActionCount(aiPrompt, relatedContext);
      const actionSpecs = detectResult && detectResult.actions ? detectResult.actions : [];
      const taskFunction = detectResult && detectResult.taskFunction ? detectResult.taskFunction : null;

      try {
        await appendLog({
          prompt: aiPrompt,
          rawResponse: detectResult ? detectResult.content : '',
          parsed: detectResult ? detectResult.parsed : null,
          parseError: (detectResult && detectResult.error) ? detectResult.error : null,
          action: 'detectActions',
          warning: null,
          createdAt: new Date(),
        });
      } catch (e) {
        // ignore log error
      }

      if ((!actionSpecs || actionSpecs.length === 0) && !taskFunction) {
        setAiWarning('No valid actions detected from your instruction.');
        setAiLoading(false);
        setAiPrompt('');
        return;
      }

      if (taskFunction) {
        setPendingTaskFunction(taskFunction);
        setTaskFunctionText(taskFunction);
        setTaskFunctionContext({ currentStep: 0 });
        setWorkflowData(null);
        setWorkflowError('');
        setPendingActions(null);
        setAiResponse('Detected a task function. Please confirm to execute.');
        setAiLoading(false);
        return;
      }

      const preview = actionSpecs.slice(0, 50);
      setPendingActions(preview);
      setPendingTaskFunction(null);
      setAiResponse(`Detected ${actionSpecs.length} action(s). Previewing up to ${preview.length} action(s). Please confirm to execute.`);
    } catch (err) {
      const errMsg = 'Error: ' + err.message;
      setAiWarning(errMsg);
      try {
        await appendLog({
          prompt: aiPrompt,
          rawResponse: aiResponse || '',
          parsed: null,
          parseError: err.message,
          action: null,
          warning: errMsg,
          createdAt: new Date(),
        });
      } catch (e) {
        // ignore log error
      }
    }
    setAiLoading(false);
  }, [
    aiPrompt,
    aiResponse,
    appendLog,
    detectActionCount,
    setAiLoading,
    setAiPrompt,
    setAiResponse,
    setAiWarning,
    setExecLog,
    setExecProgress,
    setPendingActions,
    setPendingTaskFunction,
    setTaskFunctionContext,
    setTaskFunctionText,
    setWorkflowData,
    setWorkflowError,
    variables
  ]);

  const handlePromptToWorkflow = useCallback(async () => {
    if (!aiPrompt || !aiPrompt.trim()) return;
    setWorkflowLoading(true);
    setWorkflowError('');
    setWorkflowData(null);
    try {
      const keywords = extractKeywords(aiPrompt);
      const relatedVariables = findRelatedVariables(variables, keywords, 5);
      const relatedContext = relatedVariables.length
        ? relatedVariables
            .map((v) => `- ${v.name}: ${v.description}${v.qty !== undefined ? ` (qty: ${v.qty})` : ''}${v.tag?.length ? ` [tags: ${v.tag.join(', ')}]` : ''}`)
            .join('\n')
        : 'None';

      const detectResult = await detectActionCount(aiPrompt, relatedContext);
      const actionSpecs = detectResult && detectResult.actions ? detectResult.actions : [];
      const taskFunction = detectResult && detectResult.taskFunction ? detectResult.taskFunction : null;

      if (taskFunction) {
        setTaskFunctionText(taskFunction);
        const wf = await generateWorkflowVisualization(taskFunction);
        try {
          const startY = 80;
          const spacingY = 140;
          const centerX = 260;
          if (wf && Array.isArray(wf.nodes)) {
            const normalized = wf.nodes.map((n, i) => ({
              ...n,
              position: { x: centerX, y: startY + (i * spacingY) }
            }));
            setWorkflowData({ ...wf, nodes: normalized });
          } else {
            setWorkflowData(wf);
          }
        } catch (e) {
          setWorkflowData(wf);
        }
        return;
      }

      if (!actionSpecs || actionSpecs.length === 0) {
        setWorkflowError('No actions detected for workflow.');
        return;
      }

      const nodes = actionSpecs.map((a, i) => {
        const actionName = a.action || a.name || 'Action';
        const desc = a.notes || a.description || a.raw_instruction || '';
        return {
          id: `step_${i}`,
          type: 'action',
          label: `Step ${i + 1}: ${actionName}`,
          description: desc,
          position: { x: 260, y: 100 + (i * 140) },
          actions: [
            {
              action: actionName,
              raw_instruction: a.raw_instruction || '',
              notes: a.notes || a.description || ''
            }
          ]
        };
      });

      const edges = nodes.slice(0, -1).map((n, i) => ({
        id: `edge_${n.id}_${nodes[i + 1].id}`,
        from: n.id,
        to: nodes[i + 1].id,
        type: 'next',
        label: 'next'
      }));

      setWorkflowData({ nodes, edges });
    } catch (err) {
      setWorkflowError(err?.message || 'Failed to generate workflow from prompt');
    } finally {
      setWorkflowLoading(false);
    }
  }, [
    aiPrompt,
    detectActionCount,
    setTaskFunctionText,
    setWorkflowData,
    setWorkflowError,
    setWorkflowLoading,
    variables
  ]);

  const handleGenerateWorkflow = useCallback(async () => {
    if (!taskFunctionText || !taskFunctionText.trim()) return;
    setWorkflowLoading(true);
    setWorkflowError('');
    try {
      const wf = await generateWorkflowVisualization(taskFunctionText.trim());
      try {
        const startY = 80;
        const spacingY = 140;
        const centerX = 260;
        if (wf && Array.isArray(wf.nodes)) {
          const verticalNodes = wf.nodes.map((n, idx) => ({
            ...n,
            position: { x: Number(n?.position?.x ?? centerX), y: Number(n?.position?.y ?? (startY + idx * spacingY)) }
          }));
          const wf2 = { ...wf, nodes: verticalNodes };
          setWorkflowData(wf2);
        } else {
          setWorkflowData(wf);
        }
      } catch (e) {
        setWorkflowData(wf);
      }
    } catch (err) {
      setWorkflowData(null);
      setWorkflowError(err?.message || 'Failed to generate workflow');
    }
    setWorkflowLoading(false);
  }, [setWorkflowData, setWorkflowError, setWorkflowLoading, taskFunctionText]);

  const generateFunctionFromFlow = useCallback(async () => {
    try {
      const payload = buildWorkflowPayload({ rfNodes, rfEdges, workflowData, functionsList });
      if (!payload.nodes.length) {
        setAiWarning('No workflow nodes to convert.');
        return;
      }

      setAiLoading(true);
      const raw = await generateFunctionFromWorkflow(payload);

      if (!raw) {
        setAiWarning('AI did not return a function.');
        return;
      }

      const isArrowFunction = /^\s*\(\s*ctx\s*\)\s*=>\s*\{/.test(raw);
      const hasInitialization = /if\s*\(\s*!\s*ctx\.currentStep\s*\)/.test(raw);
      const hasReturn = /return\s*\{/.test(raw);
      const hasDone = /done\s*:\s*true/.test(raw);

      if (!isArrowFunction) {
        setAiWarning('Generated content does not start with (ctx) => {');
        setTaskFunctionText(raw);
        return;
      }

      if (!hasInitialization || !hasReturn || !hasDone) {
        // allow, but warn in console
      }

      setTaskFunctionText(raw);
      setPendingTaskFunction(raw);
      setAiResponse('Function generated from flow. Review and execute.');
    } catch (err) {
      setAiWarning('Failed to generate function from flow: ' + err.message);
    } finally {
      setAiLoading(false);
    }
  }, [functionsList, rfEdges, rfNodes, setAiLoading, setAiResponse, setAiWarning, setTaskFunctionText, workflowData]);

  const createFnPromptFromFunction = useCallback(() => {
    if (!taskFunctionText || !taskFunctionText.trim()) {
      setAiWarning('No task function available to convert to a prompt.');
      setTimeout(() => setAiWarning(''), 2000);
      return;
    }
    const cleaned = String(taskFunctionText).trim();
    const prompt = `Create a concise natural-language instruction (Project) that reproduces the behavior of this task function.\n\nTask function:\n${cleaned}`;
    setAiPrompt(prompt);
    setAiResponse('');
    setPendingActions(null);
    if (!tabSwitchLockRef.current) setActiveTab('variablePrompt');
  }, [setAiPrompt, setAiResponse, setAiWarning, setPendingActions, setActiveTab, taskFunctionText, tabSwitchLockRef]);

  const confirmPreview = useCallback(async () => {
    if (taskFunctionText && taskFunctionText.trim()) {
      const initialCtx = { currentStep: 0, ...(taskFunctionContext || {}) };
      await runTaskFunction(taskFunctionText.trim(), initialCtx);
      setTaskFunctionContext({ currentStep: 0 });
      setWorkflowData(null);
      setWorkflowError('');
      setPendingTaskFunction(null);
      return;
    }
    if (!pendingActions) return;
    await runActionSpecs(pendingActions);
  }, [pendingActions, runActionSpecs, runTaskFunction, setWorkflowData, setWorkflowError, taskFunctionContext, taskFunctionText]);

  const cancelPreview = useCallback(() => {
    setPendingActions(null);
    setPendingTaskFunction(null);
    setTaskFunctionContext({ currentStep: 0 });
    setWorkflowData(null);
    setWorkflowError('');
    setAiResponse('Action preview cancelled.');
  }, [setAiResponse, setPendingActions, setPendingTaskFunction, setTaskFunctionContext, setWorkflowData, setWorkflowError]);

  return {
    taskFunctionText,
    setTaskFunctionText,
    pendingActions,
    pendingTaskFunction,
    execProgress,
    execLog,
    filteredVariables,
    handleAiSubmit,
    handlePromptToWorkflow,
    handleGenerateWorkflow,
    generateFunctionFromFlow,
    createFnPromptFromFunction,
    confirmPreview,
    cancelPreview
  };
}
