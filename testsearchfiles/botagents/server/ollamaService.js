// server/ollamaService.js
// Service for requesting nodes and edges from Ollama (local LLM)

/**
 * Request workflow from Ollama API
 * @param {Object} options - Configuration options
 * @param {string} options.systemPrompt - System prompt describing available objects and actions
 * @param {string} options.userPrompt - User's task description
 * @param {string} options.ollamaUrl - Ollama API endpoint URL (from .env, e.g., http://localhost:11434/api/chat)
 * @param {string} options.ollamaModel - Ollama model name (from .env, defaults to 'gemma3:4b')
 * @returns {Promise<{ollamaResult: {content: string, rawMessage: Object, parsedWorkflow: Object}}>} Complete Ollama response
 */
async function requestFromOllama({
  systemPrompt = '',
  userPrompt = '',
  ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat',
  ollamaModel = process.env.OLLAMA_MODEL || 'gemma3:4b'
} = {}) {
  
  console.log('[ollamaService] Requesting workflow from Ollama...');
  console.log(`[ollamaService] ollamaUrl: ${ollamaUrl}`);
  console.log(`[ollamaService] ollamaModel: ${ollamaModel}`);
  
  // Validation
  if (!userPrompt || !systemPrompt) {
    console.warn('[ollamaService] ⚠ userPrompt or systemPrompt is empty');
    return { ollamaResult: { content: '', rawMessage: null, parsedWorkflow: null } };
  }

  try {
    // Build the prompt for Ollama to generate nodes and edges
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

    // Call Ollama API
    const response = await fetch(ollamaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      console.error(`[ollamaService] ✗ Ollama API error: ${response.status} ${response.statusText}`);
      return { ollamaResult: { content: '', rawMessage: null, parsedWorkflow: null } };
    }

    const data = await response.json();
    console.log('[ollamaService] ✓ Received response from Ollama');

    // Extract content from Ollama response
    const content = data.message?.content || '';
    if (!content) {
      console.warn('[ollamaService] ⚠ Empty response from Ollama');
      return { ollamaResult: { content: '', rawMessage: data.message || null, parsedWorkflow: null } };
    }

    // Parse JSON from response (Ollama may include markdown, so extract JSON)
    let parsedWorkflow = null;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (typeof jsonMatch[1] === 'string' ? jsonMatch[1] : jsonMatch[0]) : content;
      parsedWorkflow = JSON.parse(jsonStr);
      console.log('[ollamaService] ✓ Successfully parsed JSON from Ollama response');
    } catch (parseErr) {
      console.error(`[ollamaService] ✗ Failed to parse Ollama response as JSON:`, parseErr.message);
      console.log('[ollamaService] Raw response (first 300 chars):', content.substring(0, 300));
    }

    // Return the complete raw Ollama result
    console.log('[ollamaService] ✓ Returning complete Ollama response');
    return { ollamaResult: { content, rawMessage: data.message || null, parsedWorkflow } };

  } catch (err) {
    console.error('[ollamaService] ✗ Error requesting from Ollama:', err.message);
    return { ollamaResult: { content: '', rawMessage: null, parsedWorkflow: null } };
  }
}

export { requestFromOllama };
