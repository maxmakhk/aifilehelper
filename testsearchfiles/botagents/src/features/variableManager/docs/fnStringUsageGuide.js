/**
 * fnString Usage Guide
 *
 * This document provides comprehensive examples and patterns for using custom
 * function strings (fnString) in workflow nodes.
 */

// ==============================================================================
// OVERVIEW
// ==============================================================================

/**
 * fnString allows you to write custom JavaScript async functions that execute
 * within the workflow engine. Instead of relying on pre-configured API nodes,
 * you can now implement complex logic, conditional API calls, data transformations,
 * and more—all within a single node.
 *
 * Key benefits:
 * - Full JavaScript control over node execution
 * - Access to workflow variables (storeVars)
 * - Control over result storage and transformation
 * - Support for complex conditional logic
 * - Better error handling and logging
 *
 * Structure:
 * - fnString contains ONLY the function body (no function declaration)
 * - Receives a 'ctx' parameter with access to APIs and utilities
 * - Should be an async function (can use await)
 * - Can call ctx.setVar() to store results
 */

// ==============================================================================
// BASIC EXAMPLE: Simple API Call
// ==============================================================================

/**
 * Simple API call without transformation
 * This replaces a traditional UI-configured API node
 */
export const basicApiNode = {
  id: 'node_1',
  type: 'action',
  position: { x: 0, y: 0 },
  data: {
    labelText: 'Fetch User Data',
    fnString: `
      const { fetch, config, setVar, console } = ctx;
      const userId = config.userId || '123';
      const url = config.baseUrl + '/users/' + userId;
      
      console.log('Fetching from:', url);
      const response = await fetch(url);
      const userData = await response.json();
      
      setVar('user_data', userData);
      console.log('User data stored:', userData);
    `,
    config: {
      baseUrl: 'https://api.example.com',
      userId: '456',
    },
  },
};

// ==============================================================================
// INTERMEDIATE EXAMPLE: API with Error Handling
// ==============================================================================

/**
 * API call with comprehensive error handling and retry logic
 */
export const apiWithErrorHandlingNode = {
  id: 'node_weather',
  type: 'action',
  position: { x: 0, y: 150 },
  data: {
    labelText: 'Fetch Weather (with retry)',
    fnString: `
      const { fetch, config, setVar, console } = ctx;
      let retries = config.maxRetries || 3;
      let response = null;
      let error = null;
      
      for (let i = 0; i < retries; i++) {
        try {
          console.log('Attempt', i + 1, '/', retries);
          response = await fetch(config.weatherUrl);
          if (response.ok) {
            break;
          } else {
            error = new Error('HTTP ' + response.status);
            console.error('Request failed:', error.message);
          }
        } catch (e) {
          error = e;
          console.error('Network error:', e.message);
          // Wait before retry
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      if (!response || !response.ok) {
        const errorMsg = error?.message || 'Unknown error';
        setVar('weather_error', errorMsg);
        throw new Error('Failed to fetch weather: ' + errorMsg);
      }
      
      const weatherData = await response.json();
      setVar('weather', weatherData);
      console.log('Weather data:', weatherData);
    `,
    config: {
      weatherUrl: 'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current=temperature_2m',
      maxRetries: 3,
    },
  },
};

// ==============================================================================
// ADVANCED EXAMPLE: Multiple API Calls with Transformation
// ==============================================================================

/**
 * Complex workflow: fetch from two APIs, combine and transform results
 */
export const multiApiTransformNode = {
  id: 'node_combined',
  type: 'action',
  position: { x: 0, y: 300 },
  data: {
    labelText: 'Fetch and combine data',
    fnString: `
      const { fetch, config, setVar, console, storeVars } = ctx;
      
      // Fetch first resource
      const user1Response = await fetch(config.url1);
      const user1 = await user1Response.json();
      console.log('User 1 fetched:', user1);
      
      // Fetch second resource
      const user2Response = await fetch(config.url2);
      const user2 = await user2Response.json();
      console.log('User 2 fetched:', user2);
      
      // Combine and transform
      const combined = {
        users: [user1, user2],
        totalCount: 2,
        fetchedAt: new Date().toISOString(),
        emailDomains: [user1.email?.split('@')[1], user2.email?.split('@')[1]],
      };
      
      setVar('combined_users', combined);
      console.log('Combined result:', combined);
    `,
    config: {
      url1: 'https://jsonplaceholder.typicode.com/users/1',
      url2: 'https://jsonplaceholder.typicode.com/users/2',
    },
  },
};

// ==============================================================================
// ADVANCED EXAMPLE: Conditional Logic and Branching
// ==============================================================================

/**
 * Node that performs different actions based on stored variables
 * Example: Call different APIs based on user type
 */
export const conditionalApiNode = {
  id: 'node_conditional',
  type: 'action',
  position: { x: 0, y: 450 },
  data: {
    labelText: 'Route based on user type',
    fnString: `
      const { fetch, config, setVar, console, storeVars } = ctx;
      
      // Check user type from previous nodes
      const userType = storeVars?.user_type || 'guest';
      console.log('User type:', userType);
      
      let url, resultVar;
      
      if (userType === 'premium') {
        url = config.premiumUrl;
        resultVar = 'premium_features';
      } else if (userType === 'standard') {
        url = config.standardUrl;
        resultVar = 'standard_features';
      } else {
        url = config.guestUrl;
        resultVar = 'guest_features';
      }
      
      console.log('Calling:', url);
      const response = await fetch(url);
      const data = await response.json();
      
      setVar(resultVar, data);
      setVar('route_taken', userType);
      console.log('Routed to', userType, ':', data);
    `,
    config: {
      premiumUrl: 'https://api.example.com/premium',
      standardUrl: 'https://api.example.com/standard',
      guestUrl: 'https://api.example.com/guest',
    },
  },
};

// ==============================================================================
// ADVANCED EXAMPLE: Using Context APIs
// ==============================================================================

/**
 * Node that uses the APIs array from context to match and call an API
 */
export const contextApisNode = {
  id: 'node_context_api',
  type: 'action',
  position: { x: 0, y: 600 },
  data: {
    labelText: 'Use context APIs',
    fnString: `
      const { fetch, config, setVar, console, apis } = ctx;
      
      console.log('Available APIs:', apis.length);
      
      // Find an API by name from the provided apis array
      const targetApiName = config.apiName || 'openweather';
      const matchedApi = apis.find(a => 
        (a.name || '').toLowerCase() === targetApiName.toLowerCase()
      );
      
      if (!matchedApi) {
        throw new Error('API not found: ' + targetApiName);
      }
      
      console.log('Found API:', matchedApi.name, 'URL:', matchedApi.url);
      
      const response = await fetch(matchedApi.url);
      const data = await response.json();
      
      setVar(config.resultVar || matchedApi.name, data);
      console.log('API result stored as:', config.resultVar || matchedApi.name);
    `,
    config: {
      apiName: 'openweather',
      resultVar: 'weather_data',
    },
  },
};

// ==============================================================================
// ADVANCED EXAMPLE: Data Validation and Filtering
// ==============================================================================

/**
 * Node that fetches data and validates/filters it
 */
export const validationNode = {
  id: 'node_validation',
  type: 'action',
  position: { x: 0, y: 750 },
  data: {
    labelText: 'Fetch and validate',
    fnString: `
      const { fetch, config, setVar, console } = ctx;
      
      // Fetch data
      const response = await fetch(config.sourceUrl);
      const allData = await response.json();
      console.log('Fetched', allData.length, 'items');
      
      // Validate and filter
      const validated = allData.filter(item => {
        // Check required fields
        if (!item.id || !item.email) return false;
        
        // Validate email format
        const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+\$/;
        if (!emailRegex.test(item.email)) return false;
        
        // Check age if present
        if (item.age !== undefined && item.age < config.minAge) return false;
        
        return true;
      });
      
      console.log('Valid items:', validated.length, 'of', allData.length);
      
      if (validated.length === 0) {
        setVar('validation_status', 'no_valid_items');
      } else {
        setVar('validation_status', 'success');
        setVar('validated_data', validated);
      }
    `,
    config: {
      sourceUrl: 'https://api.example.com/records',
      minAge: 18,
    },
  },
};

// ==============================================================================
// CONTEXT OBJECT API REFERENCE
// ==============================================================================

/**
 * The 'ctx' object provided to fnString functions has the following structure:
 *
 * ctx = {
 *   // Standard browser APIs
 *   fetch: Function,           // window.fetch bound to window context
 *   console: Console,          // Logging (console.log, console.error, etc.)
 *   alert: Function,           // window.alert if available
 *
 *   // Workflow data
 *   node: WorkflowNode,        // Current node being executed
 *   storeVars: Object,         // Read-only current workflow variables
 *   config: Object,            // Configuration for this node
 *   apis: Array,               // Available API definitions
 *
 *   // Workflow control
 *   setVar: (name, value) => void,  // Store a variable for use in subsequent nodes
 * }
 *
 * Usage patterns:
 * - Destructure to access: const { fetch, setVar, config } = ctx;
 * - Read workflow state: storeVars.some_variable
 * - Write workflow state: setVar('my_var', value)
 * - Config per-node: config.setting1, config.setting2
 * - API access: apis.find(a => a.name === 'MyAPI')
 */

// ==============================================================================
// COMMON PATTERNS
// ==============================================================================

/**
 * Pattern: Using previous node results
 */
export const patternUsePreviousResults = {
  fnString: `
    const { console, storeVars, setVar } = ctx;
    const previousResult = storeVars?.previous_node_result;
    
    if (!previousResult) {
      throw new Error('Previous node did not store result');
    }
    
    // Process the result
    const processed = previousResult.map(x => x * 2);
    setVar('processed_result', processed);
  `,
};

/**
 * Pattern: Sequential async operations
 */
export const patternSequentialOps = {
  fnString: `
    const { fetch, setVar } = ctx;
    
    // Operation 1
    const res1 = await fetch('/api/step1');
    const data1 = await res1.json();
    setVar('step1_result', data1);
    
    // Operation 2 (can use result from operation 1)
    const res2 = await fetch('/api/step2?prev=' + data1.id);
    const data2 = await res2.json();
    setVar('step2_result', data2);
  `,
};

/**
 * Pattern: Conditional fetching based on config
 */
export const patternConditionalFetch = {
  fnString: `
    const { fetch, config, setVar } = ctx;
    
    if (config.enabled === false) {
      setVar('fetch_result', null);
      return;
    }
    
    const response = await fetch(config.url);
    const data = await response.json();
    setVar('fetch_result', data);
  `,
};

// ==============================================================================
// MIGRATION NOTES
// ==============================================================================

export const migrationExample = {
  before: {
    type: 'api',
    data: {
      labelText: 'WeatherService',
      url: 'https://api.weatherapi.com/v1.1/current.json?key=KEY&q=London',
      varName: 'weather',
    },
  },

  after: {
    type: 'action',
    data: {
      labelText: 'Fetch Weather',
      fnString: `
        const { fetch, config, setVar } = ctx;
        const url = config.baseUrl + '?key=' + config.apiKey + '&q=' + config.city;
        const response = await fetch(url);
        const data = await response.json();
        setVar('weather', data);
      `,
      config: {
        baseUrl: 'https://api.weatherapi.com/v1.1/current.json',
        apiKey: 'YOUR_KEY',
        city: 'London',
      },
    },
  },
};
