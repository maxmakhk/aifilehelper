export default async function promptToFunction(normalizedPrompt) {
  if (!normalizedPrompt) return '';
  const sys = `
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
    let payload = {
      role: 'user', prompt: normalizedPrompt, system: sys
    }
    

    const r = await fetch((import.meta.env.VITE_AI_CHAT_ENDPOINT), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    const content = (d.content || d.error || '').trim().replace(/```js\s*/g, '').replace(/```\s*/g, '').trim();

    payload.response = content;

    console.log('promptToFunction payload:', payload);

    if (content && content.indexOf('const fn') === 0) return content;
    return `const fn = () => {\n  // Could not generate function automatically\n  return {}\n}`;
  } catch (err) {
    console.warn('promptToFunction failed:', err);
    return `const fn = () => {\n  // Error generating function\n  return {}\n}`;
  }
}
