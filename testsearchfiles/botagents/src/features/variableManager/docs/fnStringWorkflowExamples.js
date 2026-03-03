/**
 * fnString Integration Example
 *
 * Complete workflow example showing:
 * - Multiple nodes with fnString
 * - Legacy API nodes (for comparison)
 * - Edge selection and conditional logic
 * - Data transformation and storage
 * - Error handling
 */

/**
 * Example 1: Simple Weather Workflow
 *
 * This workflow:
 * 1. Fetches weather data from Open-Meteo API
 * 2. Checks if temperature is above threshold
 * 3. Routes to different nodes based on result
 */
export const weatherWorkflow = {
  nodes: [
    {
      id: 'start',
      type: 'action',
      position: { x: 260, y: 100 },
      data: {
        labelText: 'Start',
      },
    },
    {
      id: 'fetch_weather',
      type: 'action',
      position: { x: 260, y: 250 },
      data: {
        labelText: 'Fetch Weather Data',
        fnString: `
          const { fetch, config, setVar, console } = ctx;
          const url = config.baseUrl + '?latitude=' + config.lat + '&longitude=' + config.lon + '&current=temperature_2m';
          
          console.log('Fetching weather from:', url);
          const response = await fetch(url);
          const data = await response.json();
          
          const temp = data.current.temperature_2m;
          setVar('current_temperature', temp);
          setVar('weather_data', data);
          
          console.log('Current temperature:', temp);
        `,
        config: {
          baseUrl: 'https://api.open-meteo.com/v1/forecast',
          lat: 51.5074, // London
          lon: -0.1278,
        },
      },
    },
    {
      id: 'temp_high',
      type: 'action',
      position: { x: 80, y: 400 },
      data: {
        labelText: 'Temperature is High',
        fnString: `
          const { console, setVar } = ctx;
          console.log('Processing high temperature case');
          setVar('temp_category', 'high');
        `,
      },
    },
    {
      id: 'temp_normal',
      type: 'action',
      position: { x: 260, y: 400 },
      data: {
        labelText: 'Temperature is Normal',
        fnString: `
          const { console, setVar } = ctx;
          console.log('Processing normal temperature case');
          setVar('temp_category', 'normal');
        `,
      },
    },
    {
      id: 'temp_low',
      type: 'action',
      position: { x: 440, y: 400 },
      data: {
        labelText: 'Temperature is Low',
        fnString: `
          const { console, setVar } = ctx;
          console.log('Processing low temperature case');
          setVar('temp_category', 'low');
        `,
      },
    },
    {
      id: 'end',
      type: 'action',
      position: { x: 260, y: 550 },
      data: {
        labelText: 'End',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'fetch_weather' },
    {
      id: 'e2',
      source: 'fetch_weather',
      target: 'temp_high',
      label: 'current_temperature > 20',
    },
    {
      id: 'e3',
      source: 'fetch_weather',
      target: 'temp_normal',
      label: 'current_temperature >= 10 && current_temperature <= 20',
    },
    {
      id: 'e4',
      source: 'fetch_weather',
      target: 'temp_low',
      label: 'current_temperature < 10',
    },
    { id: 'e5', source: 'temp_high', target: 'end' },
    { id: 'e6', source: 'temp_normal', target: 'end' },
    { id: 'e7', source: 'temp_low', target: 'end' },
  ],
};

/**
 * Example 2: Data Fetching and Transformation
 *
 * This workflow:
 * 1. Fetches user data
 * 2. Fetches posts for that user
 * 3. Transforms and combines the data
 * 4. Stores result
 */
export const userPostsWorkflow = {
  nodes: [
    {
      id: 'fetch_user',
      type: 'action',
      position: { x: 260, y: 100 },
      data: {
        labelText: 'Fetch User',
        fnString: `
          const { fetch, config, setVar } = ctx;
          const response = await fetch(config.userUrl);
          const user = await response.json();
          setVar('user', user);
        `,
        config: {
          userUrl: 'https://jsonplaceholder.typicode.com/users/1',
        },
      },
    },
    {
      id: 'fetch_posts',
      type: 'action',
      position: { x: 260, y: 250 },
      data: {
        labelText: 'Fetch User Posts',
        fnString: `
          const { fetch, config, storeVars, setVar } = ctx;
          const userId = storeVars?.user?.id;
          const url = config.postsUrl.replace('{id}', userId);
          const response = await fetch(url);
          const posts = await response.json();
          setVar('posts', posts);
        `,
        config: {
          postsUrl: 'https://jsonplaceholder.typicode.com/users/{id}/posts',
        },
      },
    },
    {
      id: 'combine_data',
      type: 'action',
      position: { x: 260, y: 400 },
      data: {
        labelText: 'Combine Data',
        fnString: `
          const { storeVars, setVar } = ctx;
          const user = storeVars?.user;
          const posts = storeVars?.posts;
          
          const combined = {
            user: {
              id: user?.id,
              name: user?.name,
              email: user?.email,
            },
            posts: posts?.map(p => ({
              id: p.id,
              title: p.title,
              body: p.body.substring(0, 100) + '...',
            })) || [],
            postCount: posts?.length || 0,
          };
          
          setVar('user_with_posts', combined);
        `,
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'fetch_user', target: 'fetch_posts' },
    { id: 'e2', source: 'fetch_posts', target: 'combine_data' },
  ],
};

/**
 * Example 3: Conditional Routing with Error Handling
 *
 * This workflow:
 * 1. Fetches data from an API with retry logic
 * 2. Validates the response
 * 3. Routes based on validation result
 * 4. Handles errors gracefully
 */
export const robustApiWorkflow = {
  nodes: [
    {
      id: 'fetch_with_retry',
      type: 'action',
      position: { x: 260, y: 100 },
      data: {
        labelText: 'API Call (with Retry)',
        fnString: `
          const { fetch, config, setVar, console } = ctx;
          let lastError = null;
          
          for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
            try {
              console.log('Attempt', attempt, 'of', config.maxRetries);
              const response = await fetch(config.apiUrl, {
                timeout: config.timeout,
              });
              
              if (response.ok) {
                const data = await response.json();
                setVar('api_result', data);
                setVar('fetch_status', 'success');
                console.log('API call succeeded');
                return;
              } else {
                lastError = new Error('HTTP ' + response.status + ' ' + response.statusText);
              }
            } catch (error) {
              lastError = error;
              console.error('Attempt failed:', error.message);
            }
            
            if (attempt < config.maxRetries) {
              const delay = config.retryDelay * (2 ** (attempt - 1));
              console.log('Waiting', delay, 'ms before retry...');
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
          
          const errorMsg = lastError?.message || 'Unknown error';
          setVar('fetch_status', 'failed');
          setVar('api_error', errorMsg);
          console.error('API call failed after all retries:', errorMsg);
        `,
        config: {
          apiUrl: 'https://api.example.com/data',
          maxRetries: 3,
          retryDelay: 1000, // milliseconds
          timeout: 5000,
        },
      },
    },
    {
      id: 'handle_success',
      type: 'action',
      position: { x: 80, y: 250 },
      data: {
        labelText: 'Process Success',
        fnString: `
          const { storeVars, setVar } = ctx;
          const result = storeVars?.api_result;
          setVar('processing_result', 'Data processed successfully');
        `,
      },
    },
    {
      id: 'handle_failure',
      type: 'action',
      position: { x: 440, y: 250 },
      data: {
        labelText: 'Handle Failure',
        fnString: `
          const { storeVars, setVar } = ctx;
          const error = storeVars?.api_error;
          setVar('error_result', 'Failed to fetch: ' + error);
        `,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'fetch_with_retry',
      target: 'handle_success',
      label: 'fetch_status === true',
    },
    {
      id: 'e2',
      source: 'fetch_with_retry',
      target: 'handle_failure',
      label: 'fetch_status === false',
    },
  ],
};

/**
 * Example 4: Mixed Legacy and fnString Nodes
 *
 * Shows how legacy API nodes and fnString nodes coexist
 */
export const mixedWorkflow = {
  nodes: [
    // Legacy API node (no fnString)
    {
      id: 'legacy_api',
      type: 'api',
      position: { x: 260, y: 100 },
      data: {
        labelText: 'JSONPlaceholder',
        url: 'https://jsonplaceholder.typicode.com/todos/1',
        varName: 'todo',
      },
    },
    // fnString node that processes legacy result
    {
      id: 'process_todo',
      type: 'action',
      position: { x: 260, y: 250 },
      data: {
        labelText: 'Process Todo',
        fnString: `
          const { storeVars, setVar } = ctx;
          const todo = storeVars?.todo;
          
          if (!todo) {
            throw new Error('No todo data from previous node');
          }
          
          const processed = {
            ...todo,
            processed: true,
            processedAt: new Date().toISOString(),
          };
          
          setVar('processed_todo', processed);
        `,
      },
    },
  ],
  edges: [{ id: 'e1', source: 'legacy_api', target: 'process_todo' }],
};

/**
 * Example 5: Complex Business Logic
 *
 * Real-world example: Order processing workflow
 */
export const orderProcessingWorkflow = {
  nodes: [
    {
      id: 'validate_order',
      type: 'action',
      position: { x: 260, y: 100 },
      data: {
        labelText: 'Validate Order',
        fnString: `
          const { config, storeVars, setVar } = ctx;
          const order = storeVars?.order;
          
          // Validation rules
          const errors = [];
          
          if (!order?.items || order.items.length === 0) {
            errors.push('Order must contain items');
          }
          
          if ((order?.total || 0) < config.minOrderValue) {
            errors.push('Order total below minimum');
          }
          
          if ((order?.items || []).some(item => item.price < 0)) {
            errors.push('Item prices cannot be negative');
          }
          
          if (errors.length === 0) {
            setVar('validation_result', 'valid');
          } else {
            setVar('validation_result', 'invalid');
            setVar('validation_errors', errors);
          }
        `,
        config: {
          minOrderValue: 10,
        },
      },
    },
    {
      id: 'check_inventory',
      type: 'action',
      position: { x: 80, y: 250 },
      data: {
        labelText: 'Check Inventory',
        fnString: `
          const { fetch, storeVars, setVar } = ctx;
          const order = storeVars?.order;
          
          const inventoryCheck = await fetch('/api/inventory/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: order.items }),
          });
          
          const result = await inventoryCheck.json();
          setVar('inventory_available', result.available);
        `,
      },
    },
    {
      id: 'process_payment',
      type: 'action',
      position: { x: 260, y: 250 },
      data: {
        labelText: 'Process Payment',
        fnString: `
          const { fetch, storeVars, setVar, config } = ctx;
          const order = storeVars?.order;
          
          const paymentResponse = await fetch(config.paymentApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + config.apiKey,
            },
            body: JSON.stringify({
              amount: order.total,
              currency: 'USD',
              reference: order.id,
            }),
          });
          
          const result = await paymentResponse.json();
          setVar('payment_result', result);
          setVar('payment_status', result.success ? 'paid' : 'failed');
        `,
        config: {
          paymentApiUrl: 'https://payment-processor.example.com/charge',
          apiKey: 'sk_live_...',
        },
      },
    },
    {
      id: 'send_confirmation',
      type: 'action',
      position: { x: 440, y: 250 },
      data: {
        labelText: 'Send Confirmation',
        fnString: `
          const { fetch, storeVars, setVar } = ctx;
          const order = storeVars?.order;
          
          const emailResponse = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: order.customer_email,
              template: 'order_confirmation',
              variables: { order },
            }),
          });
          
          const result = await emailResponse.json();
          setVar('confirmation_sent', result.success);
        `,
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'validate_order',
      target: 'check_inventory',
      label: 'validation_result === valid',
    },
    {
      id: 'e2',
      source: 'check_inventory',
      target: 'process_payment',
      label: 'inventory_available === true',
    },
    {
      id: 'e3',
      source: 'process_payment',
      target: 'send_confirmation',
      label: 'payment_status === paid',
    },
  ],
};

export default {
  weatherWorkflow,
  userPostsWorkflow,
  robustApiWorkflow,
  mixedWorkflow,
  orderProcessingWorkflow,
};
