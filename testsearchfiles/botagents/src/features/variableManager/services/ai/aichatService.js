/**
 * AI Chat Service
 * Handles communication with the AI chat API
 */

export const AI_CHAT_ENDPOINT = import.meta.env.VITE_AI_CHAT_ENDPOINT;

/**
 * Generate a rule from a natural language prompt
 */
export async function generateRuleFromPrompt(prompt) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt cannot be empty');
  }

  const systemPrompt = `You are a JavaScript rule generator. Output NOTHING except a valid JavaScript boolean expression.

The expression will be evaluated with a variable \`v\` that has these properties:
- v.name (string): variable name
- v.description (string): variable description
- v.qty (number): quantity
- v.tag (array of strings): tags
- v.signal {[event name]: [dynamic properties]} (object): signal event data if exists

Generate a signal JavaScript expression that returns true or false. Examples:
- v.qty > 5
- v.qty % 2 === 1
- v.name.includes('test')
- v.tag.includes('important')
- v.qty >= 10 && v.name.length > 3
- v.description !== ''
- v.signal && v.signal.[event name].[someProperty] === 'someValue'

Respond with ONLY the expression, no explanation, no backticks, no extra text.`;

  try {
    const response = await fetch(AI_CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'user',
        prompt: prompt,
        system: systemPrompt,
      }),
    });

    const data = await response.json();
    const expression = (data.content || '').trim();

    if (!expression) {
      throw new Error('No expression generated from AI');
    }

    return expression;
  } catch (err) {
    console.error('Error generating rule from prompt:', err);
    throw err;
  }
}

/**
 * Generate workflow visualization from a rule or action description
 */
export async function generateWorkflowVisualization(prompt) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt cannot be empty');
  }

  const systemPrompt = `You are a workflow visualization generator. You must respond with ONLY valid JSON (no markdown, no backticks, no explanation).

Generate a workflow object with this schema:
{
  "nodes": [
    { "id": "unique_id", "label": "Node Label", "type": "workflowNode", "description": "Description", "actions": [], "metadata": {}, "position": { "x": 0, "y": 0 } }
  ],
  "edges": [
    { "id": "edge_id", "source": "source_node_id", "target": "target_node_id", "label": "edge label" }
  ]
}

Create nodes for each major step. Use logical positioning (x incrementally increases, y varies for parallel paths).`;

  try {
    const response = await fetch(AI_CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'user',
        prompt: prompt,
        system: systemPrompt,
      }),
    });

    const data = await response.json();
    const content = (data.content || '').trim();

    if (!content) {
      throw new Error('No workflow generated from AI');
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      throw new Error('Invalid JSON response from AI workflow generator');
    }

    return parsed;
  } catch (err) {
    console.error('Error generating workflow visualization:', err);
    throw err;
  }
}
