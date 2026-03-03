export const generateWorkflowVisualization = async (taskFunctionString) => {
  const prompt = {
    role: 'user',
    prompt: `Analyze this task function and create a visual workflow structure:\n\n${taskFunctionString}\n\nIdentify all control flow: steps, loops, conditions, parallel actions, etc.`,
    system: `
You are a workflow analyzer that converts JavaScript task functions into visual workflow graphs.

INPUT: A JavaScript function with steps and control flow
OUTPUT: JSON structure representing the workflow graph

ANALYZE FOR:
1. Sequential steps (if ctx.currentStep === N)
2. Loops (forEach, map, for, while)
3. Conditionals (if/else branches)
4. Parallel actions (multiple actions in one step)
5. Data transformations (filter, map, reduce)

OUTPUT FORMAT (JSON):
{
  "nodes": [
    {
      "id": "step_0",
      "type": "action|loop|condition|parallel|transform|end",
      "label": "Step 1: Find Item",
      "description": "What this step does in plain language",
      "actions": [
        { "action": "runFilter", "notes": "Find item named Hulk" }
      ],
      "position": { "x": 100, "y": 100 },
      "metadata": {
        "stepNumber": 0,
        "loopType": "forEach|map|filter",
        "condition": "if expression",
        "parallelCount": 3
      }
    }
  ],
  "edges": [
    {
      "id": "edge_0_1",
      "from": "step_0",
      "to": "step_1",
      "type": "next|loop|branch|parallel",
      "label": "Case/condition to go to this step"
    }
  ]
}

NODE TYPES:
- "action": Single action or step
- "loop": forEach, map, filter operations
- "condition": if/else branches
- "parallel": Multiple simultaneous actions
- "transform": Data transformation

EDGE TYPES:
- "next": Sequential flow
- "loop": Loop iteration
- "branch": Conditional branch (true/false)
- "parallel": Parallel execution

LAYOUT RULES:
  - Sequential: For linear sequential steps set position.x = 260 (center) and position.y = 100 + (index * 150). Do NOT spread sequential nodes horizontally - they must stack vertically in increasing y.
  - Branches: For conditional branches, offset branch nodes horizontally by about +/-200 from center (x = 260 +/- 200) and set y relative to the branch depth (y = parentY + 140 * depth). Keep branch siblings at the same y level.
  - Loops: Keep the loop node at the loop start y, and arrange internal loop nodes vertically under the loop start with increasing y.
  - Parallel: Arrange parallel nodes centered around x = 260 with small equal horizontal offsets, but keep them at the same y level.
  - Positions: All x/y values must be integers and reasonable for rendering.

  IMPORTANT:
  - MANDATORY: Follow the above layout rules exactly. Sequential steps must have steadily increasing y values and the same x (260). Do not return a purely horizontal layout for sequential flows.
  - Return ONLY valid JSON
  - Include all control flow structures
  - Each node MUST include a short description
  - Each edge MUST include a human-readable label describing the case/condition
  `
  };

  const response = await fetch((import.meta.env.VITE_AI_CHAT_ENDPOINT), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prompt)
  });

  const data = await response.json();
  const content = (data.content || data.error || '').trim()
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  if (!content) {
    throw new Error('Empty workflow response');
  }

  return JSON.parse(content);
};

export const buildWorkflowPayload = ({ rfNodes, rfEdges, workflowData, functionsList }) => {
  const nodesSrc = (rfNodes && rfNodes.length) ? rfNodes : (workflowData?.nodes || []);
  const edgesSrc = (rfEdges && rfEdges.length) ? rfEdges : (workflowData?.edges || []);

  const exportNodes = (nodesSrc || []).map((n) => {
    const actionsRaw = Array.isArray(n.actions)
      ? n.actions
      : Array.isArray(n.data?.actions)
        ? n.data.actions
        : [];
    const actions = actionsRaw.map((a) => {
      const out = { action: '', notes: '', linkedFunctionName: '', linkedRuleId: '', linkName: '' };
      if (!a) return out;
      if (typeof a === 'string') {
        out.action = a;
      } else {
        out.action = a.action || a.name || '';
        out.notes = a.notes || a.description || '';
        out.linkedFunctionName = a.linkedFunctionName || '';
        out.linkedRuleId = a.linkedRuleId || a.ruleId || '';
      }
      if (!out.linkName) {
        if (out.linkedFunctionName) out.linkName = out.linkedFunctionName;
        else if (out.linkedRuleId && Array.isArray(functionsList) && functionsList.length) {
          const found = functionsList.find((f) => (f.id || f.ruleId || '') === out.linkedRuleId || (f.id || '') === out.linkedRuleId);
          if (found) out.linkName = found.name || found.title || '';
        }
      }
      return out;
    });

    return {
      id: String(n.id),
      type: n.type || 'action',
      label: (n.data && n.data.labelText) ? String(n.data.labelText) : (n.data && n.data.label) ? String(n.data.label) : String(n.label || n.id),
      description: (n.data && n.data.description) ? String(n.data.description) : String(n.description || ''),
      position: n.position || { x: 0, y: 0 },
      metadata: n.metadata || n.data?.metadata || {},
      actions
    };
  });

  const exportEdges = (edgesSrc || []).map((e) => ({
    id: String(e.id || ''),
    from: String(e.source || e.from || ''),
    to: String(e.target || e.to || ''),
    label: e.label || ''
  }));

  return { nodes: exportNodes, edges: exportEdges };
};

export const generateFunctionFromWorkflow = async (payload) => {
  const systemPrompt = `You are a task function generator that converts workflow JSON into executable JavaScript functions.

REQUIRED OUTPUT FORMAT:
Return ONLY a JavaScript arrow function with this EXACT structure (no markdown, no code blocks, no explanations):

(ctx) => {
    if (!ctx.currentStep) ctx.currentStep = 0;
    
    if (ctx.currentStep === 0) {
        return {
            actions: [
                { action: 'actionName', notes: 'description' }
            ]
        };
    }
    
    if (ctx.currentStep === 1) {
        return {
            actions: [
                { action: 'anotherAction', notes: 'description' }
            ]
        };
    }
    
    return { actions: [], done: true };
}

CRITICAL RULES:
1. Start with: (ctx) => {
2. First line MUST be: if (!ctx.currentStep) ctx.currentStep = 0;
3. Use numeric step indices (0, 1, 2, ...) based on metadata.stepNumber from nodes
4. Each step MUST return an object: { actions: [...] }
5. Each action object MUST include ALL fields: action, notes
6. Copy values from workflow node.actions array to output actions
7. If a field is empty in source, use empty string ''
8. Use single quotes (') for all strings
9. Final step MUST return: { actions: [], done: true }
10. Skip nodes with type === 'end' or 'start' (only process 'action' nodes)
11. NO markdown formatting, NO code blocks, NO explanatory text

MAPPING INSTRUCTIONS:
- Sort nodes by metadata.stepNumber (ascending)
- For each node where type === 'action':
  - Create if (ctx.currentStep === {metadata.stepNumber}) { ... }
  - Map each item in node.actions array to action object
  - Preserve all fields: action, notes, linkedFunctionName, linkedRuleId, linkName
- Nodes without actions should still have empty actions array: []

EXAMPLE INPUT:
{
  "nodes": [
    {
      "id": "step_0",
      "type": "action",
      "metadata": { "stepNumber": 0 },
      "actions": [
        { "action": "MoveTo", "notes": "Go home" }
      ]
    },
    {
      "id": "step_1",
      "type": "action",
      "metadata": { "stepNumber": 1 },
      "actions": [
        { "action": "Wait", "notes": "Wait 5min" }
      ]
    },
    { "id": "step_end", "type": "end", "metadata": {}, "actions": [] }
  ],
  "edges": []
}

EXAMPLE OUTPUT:
(ctx) => {
    if (!ctx.currentStep) ctx.currentStep = 0;
    
    if (ctx.currentStep === 0) {
        return {
            actions: [
                { action: 'MoveTo', notes: 'Go home'}
            ]
        };
    }
    
    if (ctx.currentStep === 1) {
        return {
            actions: [
                { action: 'Wait', notes: 'Wait 5min'}
            ]
        };
    }
    
    return { actions: [], done: true };
}`;

  const userPrompt = `Generate a JavaScript task function from this workflow JSON. Return ONLY the arrow function with no markdown or explanations.\n\nWorkflow JSON:\n${JSON.stringify(payload, null, 2)}`;

  const prompt = {
    role: 'user',
    prompt: userPrompt,
    system: systemPrompt
  };

  const resp = await fetch((import.meta.env.VITE_AI_CHAT_ENDPOINT), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prompt)
  });

  if (!resp.ok) {
    throw new Error(`API request failed: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  let raw = (data.content || data.error || '').trim();

  raw = raw
    .replace(/```javascript\s*/gi, '')
    .replace(/```js\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  return raw;
};
