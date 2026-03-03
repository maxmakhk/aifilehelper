// server/xaiService.js
// Service for requesting nodes and edges from xAI (workflow generation)

/**
 * Request workflow nodes and edges from xAI API
 * @param {Object} options - Configuration options
 * @param {string} options.systemPrompt - System prompt describing available objects and actions
 * @param {string} options.userPrompt - User's task description
 * @param {string} options.xaiEndpoint - xAI API endpoint URL (from .env)
 * @param {string} options.xaiApiKey - xAI API key (from .env)
 * @param {string} options.xaiModel - xAI model name (from .env, defaults to 'grok-2')
 * @returns {Promise<{nodesResult: Array, edgesResult: Array}>} Parsed nodes and edges from xAI
 */
async function requestNodesAndEdgesFromXai({
  systemPrompt = '',
  userPrompt = '',
  xaiEndpoint = process.env.XAI_ENDPOINT || 'https://api.x.ai/v1/chat/completions',
  xaiApiKey = process.env.XAI_API_KEY || '',
  xaiModel = process.env.XAI_MODEL || 'grok-2'
} = {}) {
  
  console.log('[xaiService] Requesting nodes and edges from xAI...');
  console.log(`[xaiService] xaiEndpoint: ${xaiEndpoint}`);
  console.log(`[xaiService] xaiModel: ${xaiModel}`);
  
  // Validation
  if (!xaiApiKey) {
    console.warn('[xaiService] ⚠ XAI_API_KEY not configured in .env');
    return { nodesResult: [], edgesResult: [] };
  }

  if (!userPrompt || !systemPrompt) {
    console.warn('[xaiService] ⚠ userPrompt or systemPrompt is empty');
    return { nodesResult: [], edgesResult: [] };
  }

  try {
    // Build the prompt for xAI to generate nodes and edges
    const prompt = `${systemPrompt}

User Task: ${userPrompt}

Please respond with ONLY valid JSON in this exact format (no markdown, no code blocks, just raw JSON):
{
  "nodes": [
    {"id": "node1", "type": "action", "label": "ActionName", "position": {"x": 0, "y": 0}, "data": {"label": "ActionName", "fnString": "async function handler(ctx) { /* implementation */ }"}},
    {"id": "node2", "type": "action", "label": "AnotherAction", "position": {"x": 200, "y": 0}, "data": {"label": "AnotherAction", "fnString": "async function handler(ctx) { /* implementation */ }"}}
  ],
  "edges": [
    {"id": "edge_node1_node2", "source": "node1", "target": "node2", "label": "next"},
    {"id": "edge_node2_node1", "source": "node2", "target": "node1", "label": "repeat"}
  ]
}`;

    // Call xAI API
    const response = await fetch(xaiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${xaiApiKey}`
      },
      body: JSON.stringify({
        model: xaiModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      console.error(`[xaiService] ✗ xAI API error: ${response.status} ${response.statusText}`);
      return { nodesResult: [], edgesResult: [] };
    }

    const data = await response.json();
    console.log('[xaiService] ✓ Received response from xAI');

    // Extract content from xAI response
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      console.warn('[xaiService] ⚠ Empty response from xAI');
      return { nodesResult: [], edgesResult: [] };
    }

    // Parse JSON from response (xAI may include markdown, so extract JSON)
    let parsedWorkflow = null;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (typeof jsonMatch[1] === 'string' ? jsonMatch[1] : jsonMatch[0]) : content;
      parsedWorkflow = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error(`[xaiService] ✗ Failed to parse xAI response as JSON:`, parseErr.message);
      console.log('[xaiService] Raw response:', content.substring(0, 200));
      return { nodesResult: [], edgesResult: [] };
    }

    // Validate structure
    const nodesResult = Array.isArray(parsedWorkflow.nodes) ? parsedWorkflow.nodes : [];
    const edgesResult = Array.isArray(parsedWorkflow.edges) ? parsedWorkflow.edges : [];

    console.log(`[xaiService] ✓ Successfully parsed workflow: ${nodesResult.length} nodes, ${edgesResult.length} edges`);

    return { nodesResult, edgesResult };

  } catch (err) {
    console.error('[xaiService] ✗ Error requesting nodes/edges from xAI:', err.message);
    return { nodesResult: [], edgesResult: [] };
  }
}

export { requestNodesAndEdgesFromXai };
