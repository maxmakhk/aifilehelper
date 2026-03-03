/**
 * workflowPromptProcessor.js
 * Server-side processor for the prompt-to-workflow pipeline
 * Chains: normalize → AI function generation → fnString normalize → fnToWorkflow
 */

import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Normalize a user prompt into clear, numbered steps
 */
async function normalizePrompt(promptText) {
  const normalizationSystemPrompt =`
You rewrite the user description of a flow into clear, numbered steps.

Your ONLY task:
- Turn the user's description into a small list of ordered steps in natural language.

Rules:
- Keep the original meaning.
- Make every implicit check explicit as a separate step BEFORE any "if".
- When you write a "check ..." step, explicitly list all possible outcomes in that step.
  - Example: "check day status: possible results are workday or holiday"
  - Example: "check which bus arrives: possible buses are A1 or B1"
- One numbered step per line.
- Do NOT add or remove branches; only make implicit checks explicit and clearer.
- When you write a "check ..." step, you MUST NOT use the phrase "check if".
  - NEVER write: "check if I am happy", "check if it is raining", etc.
  - Default pattern:
    - "check X status: possible tags are A or B"
    - or "check X state: possible tags are A or B"
  - Exception for system/API-like names:
    - If X already looks like a system / API name (e.g. "openweather", "stripe", "camera"),
      you MAY omit "status" and write:
      - "check X: possible tags are A or B"

  Example:
  User: "check openweather, until success, go to end, if fail keep checking"

  You:
  1) start
  2) check openweather: possible tags are success or fail
  3) if openweather:tag is success
  4) go to end
  5) if openweather:tag is fail
  6) keep checking openweather
  7) go back to step 2
  8) end

- When the user writes "check X ..." and adds extra qualifiers like location, order, or other details
  (e.g. "check logisticAPI2.3 in hong kong, order no.1283"),
  you MUST ALWAYS split it into TWO steps:

  1) "set X context: <everything after X in the original sentence>"
  2) "check X: possible tags are A or B"

  NEVER write "check X <extra...>: possible tags ...".
      Example 4:
      User: "check logisticAPI2.3 in hong kong, order no.1283, until success, go to end, if fail keep checking"

      You:
      1) start
      2) set logisticAPI2.3 context: in hong kong, order no.1283
      3) check logisticAPI2.3: possible tags are success or fail
      4) if logisticAPI2.3:tag is success
      5) go to end
      6) if logisticAPI2.3:tag is fail
      7) keep checking logisticAPI2.3 in hong kong, order no.1283
      8) go back to step 3
      9) end

- When the user mentions that someone "has two choices", "has options", or gives a list like "choice A or choice B":
  - Treat this as an explicit decision point.
  - Introduce a separate "check ..." step for that decision, and list all options as possible tags.
  - Then add one "if ...:tag is ..." step per option, followed by the corresponding action.
  - Example:
    - User: "She had two choices: big jump or find another way."
    - You:
      1) check Mary choice: possible tags are big_jump or find_another_way
      2) if Mary choice:tag is big_jump
      3) Mary chooses to make a big jump
      4) if Mary choice:tag is find_another_way
      5) Mary chooses to find another way

- When the user says "after X", "then X", "next", or "when X is finished":
  - You may introduce a generic completion check instead of splitting by each branch.
  - Use a pattern like:
    - "check activity completion status: possible tags are finished or not_finished"
    - "if activity completion status:tag is finished"
    - "go next"
  - Do NOT create separate finished_game / finished_run tags if both branches lead to the same "next" step.
  - MUST provide a Start and End step if there are multiple steps, even if the user doesn't explicitly say "start" or "end".

Example 1:
User: "waiting the bus at Bus Stop A, if bus is A1, go to road A, if bus is B1, go to road B, at the end, go to bus stop B"

You:
1) start
2) wait at bus stop A
3) check which bus arrives: possible tag: buses are arrive_bus_A1 or arrive_bus_B1
4) if the bus is A1:tag is arrive_bus_A1
5) go to road A
6) if the bus is B1:tag is arrive_bus_B1
7) go to road B
8) go to bus stop B
9) end

Example 2:
User: "check day status, if it is a workday, go to the office, if it is a holiday, go to the park, then go back home"

You:
1) start
2) check day status: tag are workday or holiday
3) if the day status:tag is workday
4) go to the office
5) if the day status:tag is holiday
6) go to the park
7) go back home
8) end

Example 3:
User: "if I am happy, play video games, if I am sad, go for a run, if I am very tired, go to sleep"

You:
1) start
2) check mood status: possible tags are happy or sad
3) if mood status:tag is happy
4) play video games
5) if mood status:tag is sad
6) go for a run
7) check energy status: possible tags are very_tired or not_very_tired
8) if energy status:tag is very_tired
9) go to sleep
10) end

- When a step uses the pattern "X:tag is Y" (for example: "logisticAPI2.3:tag is success"):
  - You MUST treat X as the variable name (after making it JS-safe).
  - The variable name MUST be exactly X, with only these transformations:
    - Replace "." with "_" to make it a valid identifier.
    - Keep numbers and underscores as-is.
  - You MUST NOT append "_tag" or any other suffix.

  Examples:
  - "logisticAPI2.3:tag is success"
    → const logisticAPI2_3 = storeVars.logisticAPI2_3;
      if (logisticAPI2_3 === "success") { ... }

  - "status:tag is success"
    → const status = storeVars.status;
      if (status === "success") { ... }

    Example (logisticAPI2.3 with context):
    Input steps:
    1) start
    2) set logisticAPI2.3 context: in hong kong, order no.1283
    3) check logisticAPI2.3: possible tags are success or fail
    4) if logisticAPI2.3:tag is success
    5) go to end
    6) if logisticAPI2.3:tag is fail
    7) keep checking logisticAPI2.3 in hong kong, order no.1283
    8) go back to step 3
    9) end

    Output:
    const fn = () => {
      const logisticAPI2_3 = storeVars.logisticAPI2_3;
      if (logisticAPI2_3 === "success") {
        console.log("if logisticAPI2.3:tag is success");
        console.log("go to end");
        return { next: "end" };
      } else if (logisticAPI2_3 === "fail") {
        console.log("if logisticAPI2.3:tag is fail");
        console.log("keep checking logisticAPI2.3 in hong kong, order no.1283");
        console.log("go back to \"check logisticAPI2.3\"");
        return { next: "check logisticAPI2.3" };
      }
      return {};
    };

Respond with the rewritten numbered steps only.

`;

  try {
    const AI_ENDPOINT = process.env.VITE_AI_CHAT_ENDPOINT || process.env.AI_CHAT_ENDPOINT || 'http://localhost:5000/chat';
    const resp = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', prompt: promptText, system: normalizationSystemPrompt })
    });

    if (!resp.ok) {
      console.warn(`AI endpoint returned ${resp.status}, using original prompt`);
      return { normalizedPrompt: promptText, normalizationSystemPrompt };
    }

    const data = await resp.json();
    const normalized = (data.content || data.message || '').trim()
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    if (normalized) {
      console.log('Prompt normalized successfully');
      return { normalizedPrompt: normalized, normalizationSystemPrompt, normalizationAIResponse: data };
    }
    return { normalizedPrompt: promptText, normalizationSystemPrompt, normalizationAIResponse: data };
  } catch (err) {
    console.warn('Normalize prompt failed:', err.message);
    return { normalizedPrompt: promptText, normalizationSystemPrompt };
  }
}

/**
 * Generate JavaScript function from normalized steps
 */
async function generateFunction(normalizedPrompt) {
  const systemPrompt = `
⚠️⚠️⚠️ CRITICAL JUMP RULE - MUST OBEY ⚠️⚠️⚠️

STEP 1: After writing each console.log(), check if it contains:
  - "go to X"
  - "go back to X"
  - "return to X"
  - "retry X"

STEP 2: If YES, immediately write:
  return { next: "X" };

STEP 3: Do NOT write any more statements in that branch.

CORRECT PATTERN:
console.log("go to end");
return { next: "end" };  ✓

WRONG PATTERNS:
console.log("go to end");
return {};  ✗ (must be return { next: "end" })

console.log("go to end");
console.log("something else");  ✗ (nothing after jump)

========================================

You are a code assistant. Create JS control flow from numbered steps.

REQUIREMENTS:
- Output EXACTLY AND ONLY: const fn = () => { ... }
- NEVER start with "javascript", markdown, comments, or ANYTHING else
- EXACTLY ONE const per "possible tags" mention
- const camelVar = storeVars.camelVar; for each decision point
- if/else + console.log() ONLY for control flow inside the function
- NO invented variables/branches/hardcoded/TODOs/comments
- NO NESTING unless step explicitly says "if X then check Y"
- The FINAL statement in the function must be return {}; for the case when no branch matches.
- If the text says "check var_a", then:
  - The variable MUST be named var_a (NO camelCase)
  - The decision label MUST be "check var_a"
  - Any return next MUST use "check var_a"

- NEVER rename identifiers inside step labels:
  - "var_a" ≠ "varA" ≠ "var-a"
  - You MUST keep the original spelling and underscores

LOOP/JUMP RULES (ENFORCE STRICTLY):

1. EXPLICIT jump phrases (ALWAYS create return { next: "X" }):
   • "go to X" → return { next: "X" };
   • "go back to X" → return { next: "X" };
   • "return to X" → return { next: "X" };
   • "retry X" → return { next: "X" };

2. IMPLICIT loop phrases (interpret as jump to check point):
   • "keep checking" → return { next: "check [variable]" };
   • "keep trying" → return { next: "check [variable]" };
   • "try again" → return { next: "check [variable]" };

3. When you write console.log with jump phrase:
   - That console.log MUST be the LAST statement before return
   - The VERY NEXT line MUST be return { next: "X" };
   - Do NOT add any more console.log after jump

RULES:
1. Count "possible tags" mentions → THAT MANY const vars
2. if (status === "EXACT_TAG") { console.log("STEP_ACTION") }
3. NO NESTING - flat if/else only
4. console.log = verbatim step text
5. Property names: camelCase English

MANDATORY OUTPUT FORMAT:
const fn = () => {
  const varName = storeVars.varName;
  if (varName === "value1") {
    console.log("action");
    console.log("go to somewhere");
    return { next: "somewhere" };
  } else if (varName === "value2") {
    console.log("action");
  }
  return {};
};
`;

  try {
    console.log('Generating function from AI...', normalizedPrompt);
    const AI_ENDPOINT = process.env.VITE_AI_CHAT_ENDPOINT || process.env.AI_CHAT_ENDPOINT || 'http://localhost:5000/chat';
    console.log('Using AI endpoint:', AI_ENDPOINT);
    const resp = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', prompt: normalizedPrompt, system: systemPrompt })
    });

    if (!resp.ok) {
      throw new Error(`AI endpoint returned ${resp.status}`);
    }

    const data = await resp.json();
    const fnString = (data.content || data.message || '').trim()
      .replace(/^```javascript\s*/i, '')
      .replace(/^```js\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    if (fnString) {
      console.log('Function generated successfully');
      return { fnString, systemPrompt, generationAIResponse: data };
    }
    throw new Error('Empty function response from AI');
  } catch (err) {
    console.error('Generate function failed:', err.message);
    throw err;
  }
}

/**
 * Process the entire pipeline
 */
export async function processPrompt({ nodeId, promptText, apis = [], workflowData = null }) {
  const result = {
    nodeId,
    originalPrompt: promptText,
    normalizedPrompt: null,
    fnString: null,
    normalizeFnString: null,
    workflowData: null,
    error: null
  };

  try {
    // Step 1: Normalize prompt
    console.log(`[${nodeId}] Starting prompt normalization...`);
    const { normalizedPrompt, normalizationSystemPrompt } = await normalizePrompt(promptText);
    result.normalizedPrompt = normalizedPrompt;

    // Step 2: Generate function
    console.log(`[${nodeId}] Generating function from normalized prompt...`);
    let genResult = await generateFunction(normalizedPrompt);
    // generateFunction now returns { fnString, systemPrompt }
    let fnString = genResult && genResult.fnString ? genResult.fnString : null;
    const systemPrompt = genResult && genResult.systemPrompt ? genResult.systemPrompt : null;

    // Step 3: Normalize function (look for storeVars and inject API calls)
    console.log(`[${nodeId}] Normalizing generated function...`);
    const normalizeFnString = normalizeFunctionString(fnString, apis);
    result.fnString = fnString;
    result.normalizeFnString = normalizeFnString;
    // Attach prompts and generated function to metadata so clients can inspect them
    result.metadata = {
      normalizationSystemPrompt: normalizationSystemPrompt,
      systemPrompt: systemPrompt,
      // Expose the generated function string so clients can use it as `systemPromptToFn`
      systemPromptToFn: fnString,
      systemPromptFn: fnString
    };

    // Step 4: Convert function to workflow
    console.log(`[${nodeId}] Converting function to workflow...`);
    const { default: fnToWorkflow } = await import('../src/features/variableManager/utils/fnToWorkflow.js');
    let workflowResult = fnToWorkflow(normalizeFnString);
    // Attach fnToWorkflow diagnostics (levelBlocks etc.) into the workflow result
    try {
      workflowResult = { ...(workflowResult || {}), fnToWorkflow: { levelBlocks: workflowResult.levelBlocks || null } };
    } catch (e) { /* ignore */ }

    // Step 5: Apply prefix to node/edge IDs
    const nodePrefix = Math.random().toString(36).slice(2, 8) + '_';
    if (workflowResult.edges) {
      workflowResult.edges = workflowResult.edges.map(e => ({
        ...e,
        id: nodePrefix + e.id,
        source: nodePrefix + e.source,
        target: nodePrefix + e.target
      }));
    }
    if (workflowResult.nodes) {
      workflowResult.nodes = workflowResult.nodes.map(n => ({
        ...n,
        id: nodePrefix + n.id
      }));
    }

    result.workflowData = workflowResult;

    // Try a lightweight server-side layout (dagre) to spread branches before sending to client
    try {
      const dagre = (await import('dagre')).default;
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      const rankDir = 'LR';
      g.setGraph({ rankdir: rankDir, ranksep: 80, nodesep: 60, marginx: 20, marginy: 20 });
      const defaultW = 240, defaultH = 100;
      (result.workflowData.nodes || []).forEach((n) => {
        const w = (n.width || (n.data && n.data.width) || defaultW) || defaultW;
        const h = (n.height || (n.data && n.data.height) || defaultH) || defaultH;
        try { g.setNode(String(n.id), { width: Math.max(40, Number(w)), height: Math.max(30, Number(h)) }); } catch (e) { }
      });
      (result.workflowData.edges || []).forEach((e) => {
        try { g.setEdge(String(e.source), String(e.target)); } catch (err) { }
      });
      try { dagre.layout(g); } catch (e) { }
      result.workflowData.nodes = (result.workflowData.nodes || []).map((n) => {
        const d = g.node(String(n.id));
        if (!d) return n;
        const w = (n.width || (n.data && n.data.width) || defaultW) || defaultW;
        const h = (n.height || (n.data && n.data.height) || defaultH) || defaultH;
        return { ...n, position: { x: d.x - w / 2, y: d.y - h / 2 } };
      });
    } catch (e) {
      // ignore if dagre isn't available or layout fails
    }
    // Enrich metadata with full records for normalization and generation
    result.metadata = {
      normalization: {
        user: promptText,
        system: normalizationSystemPrompt,
        result: result.normalizedPrompt,
        rawAI: (typeof normalizationAIResponse !== 'undefined') ? normalizationAIResponse : null
      },
      generation: {
        user: result.normalizedPrompt,
        system: systemPrompt,
        result: fnString,
        rawAI: (genResult && genResult.generationAIResponse) ? genResult.generationAIResponse : null
      },
      // also expose the immediate generated function strings for convenience
      systemPromptToFn: fnString,
      systemPromptFn: fnString,
      normalizationSystemPrompt: normalizationSystemPrompt,
      systemPrompt: systemPrompt
    };
    console.log(`[${nodeId}] Workflow processing complete`);
    return result;
  } catch (err) {
    console.error(`[${nodeId}] Pipeline error:`, err.message);
    result.error = err.message;
    throw err;
  }
}

/**
 * Normalize function: search for storeVars usage and inject API call logs
 */
function normalizeFunctionString(fnString, apis = []) {
  if (!fnString || typeof fnString !== 'string') {
    return fnString;
  }

  const varPattern = /(\n\s*)(const|let)\s+(\w+)\s*=\s*storeVars\.(\w+)/g;
  let result = fnString;
  const replacements = [];
  let match;

  while ((match = varPattern.exec(fnString)) !== null) {
    replacements.push({
      index: match.index,
      fullMatch: match[0],
      indent: match[1],
      declaration: match[2],
      varName: match[3],
      storeVarName: match[4]
    });
  }

  for (let i = replacements.length - 1; i >= 0; i--) {
    const { index, fullMatch, indent, storeVarName } = replacements[i];

    let matchedApi = null;
    const searchName = storeVarName.toLowerCase();

    if (Array.isArray(apis) && apis.length > 0) {
      matchedApi = apis.find((api) => {
        if (!api) return false;
        const apiName = (api.name || '').toLowerCase();
        if (apiName === searchName) return true;

        if (Array.isArray(api.tag)) {
          return api.tag.some((tag) => (tag || '').toLowerCase() === searchName);
        }
        return false;
      });
    }

    if (matchedApi) {
      const apiName = matchedApi.name || '';
      const apiUrl = matchedApi.url || '';
      const storeLocation = `storeVars["${apiName}"]`;
      const apiLog = `${indent}console.log("requestAPI", "${apiName}", "${apiUrl}", {}, "${storeLocation}");`;
      const replacement = `${apiLog}${fullMatch}`;
      result = result.substring(0, index) + replacement + result.substring(index + fullMatch.length);
    }
  }

  return result;
}
