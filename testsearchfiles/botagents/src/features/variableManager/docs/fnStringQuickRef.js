/**
 * fnString Quick Reference Card
 *
 * Keep this handy while writing fnString scripts!
 */

// ==============================================================================
// CONTEXT OBJECT - What's available in your script
// ==============================================================================

/**
 * const ctx = {
 *   // HTTP requests
 *   fetch: window.fetch,
 *
 *   // Logging
 *   console: { log, error, warn, info },
 *
 *   // UI
 *   alert: window.alert,
 *
 *   // Current state
 *   node: currentNode,          // The node being executed
 *   storeVars: { /*all vars*/ }, // Read-only workflow variables
 *   config: { /*node config*/ },  // This node's config object
 *   apis: [ /*api defs*/ ],      // Available API definitions
 *
 *   // Control
 *   setVar(name, value),        // Store a workflow variable
 * };
 */

// ==============================================================================
// COMMON PATTERNS
// ==============================================================================

const patterns = {
  // Fetch JSON from API
  fetchJson: `
    const { fetch, config, setVar } = ctx;
    const response = await fetch(config.url);
    const data = await response.json();
    setVar('result', data);
  `,

  // Fetch with error handling
  fetchWithError: `
    const { fetch, config, setVar } = ctx;
    try {
      const response = await fetch(config.url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      setVar('result', data);
    } catch (error) {
      setVar('error', error.message);
    }
  `,

  // Use previous node results
  usePreviousResult: `
    const { storeVars, setVar } = ctx;
    const prev = storeVars?.previous_var;
    if (!prev) throw new Error('No previous data');
    // Process prev...
    setVar('result', processed);
  `,

  // Conditional logic
  conditional: `
    const { storeVars, setVar } = ctx;
    if (storeVars?.some_var === 'expected') {
      setVar('branch', 'A');
    } else {
      setVar('branch', 'B');
    }
  `,

  // Loop and process
  loop: `
    const { storeVars, setVar } = ctx;
    const items = storeVars?.items || [];
    const processed = items.map(item => ({
      ...item,
      processed: true,
    }));
    setVar('processed_items', processed);
  `,

  // POST request
  postRequest: `
    const { fetch, config, setVar } = ctx;
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config.payload),
    });
    const result = await response.json();
    setVar('result', result);
  `,

  // Retry logic
  retryLogic: `
    const { fetch, config, setVar } = ctx;
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        const response = await fetch(config.url);
        if (response.ok) {
          const data = await response.json();
          setVar('result', data);
          return;
        }
      } catch (error) {
        if (attempt < config.maxRetries) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    setVar('error', 'Max retries exceeded');
  `,

  // Delay/timeout
  delay: `
    const { config } = ctx;
    await new Promise(resolve => setTimeout(resolve, config.delayMs || 1000));
  `,

  // Parse and transform
  transform: `
    const { storeVars, setVar } = ctx;
    const raw = storeVars?.raw_data;
    const transformed = {
      id: raw.id,
      name: raw.full_name.toUpperCase(),
      email: raw.contact?.email || null,
      createdAt: new Date(raw.timestamp).toISOString(),
    };
    setVar('data', transformed);
  `,
};

// ==============================================================================
// CONFIGURATION OBJECT - Define per-node settings
// ==============================================================================

const configExamples = {
  simple: {
    url: 'https://api.example.com/data',
    timeout: 5000,
  },

  withCredentials: {
    url: 'https://api.example.com/data',
    apiKey: 'sk_live_123456',
    bearerToken: 'eyJhbGc...',
  },

  withDefaults: {
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 5000,
    fallbackValue: 'unknown',
  },

  dynamic: {
    baseUrl: 'https://api.example.com',
    endpoint: '/users',
    minAge: 18,
    maxAge: 65,
  },
};

// ==============================================================================
// EDGE LABELS - Control flow routing
// ==============================================================================

const edgeLabels = {
  simple: 'success',  // Literal labels
  equals: 'var === true',  // Exact match
  comparison: 'count > 10',  // Numeric comparison
  else: 'else',  // Default case
  combined: 'status === success && count > 0',  // Combined conditions
};

// ==============================================================================
// VARIABLE NORMALIZATION
// ==============================================================================

/**
 * Variable names are normalized automatically:
 * 
 * Input                 Output
 * "myVar"        ->     "myvar"
 * "myVar"        ->     "myvar"
 * "my.var"       ->     "my_var"
 * "My.Var.Name"  ->     "my_var_name"
 * 
 * When setting variables, use natural names - normalization happens automatically!
 */

// ✓ Correct
setVar('user_data', {});          // → storeVars.user_data
setVar('user.data', {});          // → storeVars.user_data  (dot converted to underscore)
setVar('UserData', {});           // → storeVars.userdata

// ==============================================================================
// ERROR HANDLING GOTCHAS
// ==============================================================================

const errorTips = {
  // ✓ Correct - will catch errors
  correct: `
    try {
      const res = await fetch(url);
      const data = await res.json();
      setVar('data', data);
    } catch (error) {
      console.error('Failed:', error.message);
    }
  `,

  // ✗ Wrong - HTTP errors not caught
  wrong1: `
    const res = await fetch(url);  // Doesn't throw on 404, 500, etc
    const data = await res.json();
    setVar('data', data);
  `,

  // ✓ Correct - check response.ok
  correct2: `
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    setVar('data', data);
  `,

  // ✗ Wrong - promises not awaited
  wrong2: `
    fetch(url).then(res => res.json()).then(data => setVar('data', data));
    // Function returns immediately, execution continues before fetch completes!
  `,

  // ✓ Correct - await all async operations
  correct3: `
    const res = await fetch(url);
    const data = await res.json();
    setVar('data', data);
  `,
};

// ==============================================================================
// DEBUGGING TIPS
// ==============================================================================

const debuggingTips = {
  // Always log what you're doing
  logging: `
    const { fetch, config, setVar, console } = ctx;
    console.log('Starting node, config:', config);
    const response = await fetch(config.url);
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Data received:', data);
    setVar('result', data);
    console.log('Variable stored');
  `,

  // Debug context
  inspect: `
    const { ctx } = arguments[0];
    console.log('Full context:', ctx);
    console.log('Current vars:', ctx.storeVars);
    console.log('Node config:', ctx.config);
  `,

  // Validate before using
  validation: `
    const { storeVars, setVar } = ctx;
    const required = storeVars?.user_id;
    if (!required) {
      console.error('Missing required variable: user_id');
      setVar('error', 'Missing user_id');
      return;  // Exit early
    }
    // Continue...
  `,
};

// ==============================================================================
// COMMON MISTAKES & FIXES
// ==============================================================================

const commonMistakes = {
  mistake1: {
    wrong: `setVar('result', data); setVar('data', data); console.log('done');`,
    issue: 'Everything on one line? Hard to read and debug',
    fix: `
      setVar('result', data);
      setVar('data', data);
      console.log('done');
    `,
  },

  mistake2: {
    wrong: `
      const data = await fetch(url);  // Forgot .json()!
      console.log(data);  // Logs Response object, not JSON
    `,
    fix: `
      const response = await fetch(url);
      const data = await response.json();  // Must await
      console.log(data);
    `,
  },

  mistake3: {
    wrong: `
      fetch(url).then(res => res.json()).then(data => {
        setVar('data', data);
      });
      // Function returns before fetch completes!
    `,
    fix: `
      const res = await fetch(url);
      const data = await res.json();
      setVar('data', data);
    `,
  },

  mistake4: {
    wrong: `
      if (storeVars.user === 'admin') { }  // Case sensitive!
      setVar('userRole', 'Admin');  // Different case
    `,
    fix: `
      // Normalize in your code
      if ((storeVars?.user || '').toLowerCase() === 'admin') { }
      setVar('user_role', 'Admin');
    `,
  },

  mistake5: {
    wrong: `
      // Config might not exist!
      const url = config.baseUrl + '/api';
      if (!config.apiKey) { }
    `,
    fix: `
      const url = (config?.baseUrl || 'https://api.example.com') + '/api';
      const key = config?.apiKey || 'default_key';
    `,
  },
};

// ==============================================================================
// TEMPLATE
// ==============================================================================

/**
 * Use this as a starting point for new fnString nodes
 */
export const fnStringTemplate = `
  const { fetch, config, setVar, console, storeVars } = ctx;
  
  try {
    // Log start
    console.log('Starting node execution, config:', config);
    
    // Validate inputs
    const requiredVar = storeVars?.some_var;
    if (!requiredVar) {
      throw new Error('Missing required variable: some_var');
    }
    
    // Main logic here
    const url = config.url || 'https://api.example.com/data';
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    
    const data = await response.json();
    console.log('Data received:', data);
    
    // Store results
    setVar('result', data);
    setVar('status', 'success');
    
  } catch (error) {
    console.error('Error in node:', error.message);
    setVar('error', error.message);
    setVar('status', 'failed');
    // Re-throw to show error in UI
    throw error;
  }
`;

// ==============================================================================
// QUICK CHECKLIST
// ==============================================================================

export const checklist = {
  before: [
    '☐ Is fnString field defined in node.data?',
    '☐ Does config have all required values?',
    '☐ Are API URLs correct?',
    '☐ Is the body valid JavaScript?',
  ],
  during: [
    '☐ Use await for all async operations',
    '☐ Check response.ok before reading response body',
    '☐ Call setVar() to store results',
    '☐ Call setVar() for error conditions',
  ],
  debugging: [
    '☐ Check browser console for logs and errors',
    '☐ Look for "Node <id>: fnString execution error:" messages',
    '☐ Verify setVar() calls update storeVars',
    '☐ Check variable name normalization',
  ],
};

export default {
  patterns,
  configExamples,
  edgeLabels,
  errorTips,
  debuggingTips,
  commonMistakes,
  fnStringTemplate,
  checklist,
};
