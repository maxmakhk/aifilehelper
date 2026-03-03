/**
 * WorkflowTypes.ts
 * Type definitions for the workflow execution engine, including support for custom function strings (fnString).
 */

/**
 * Configuration object for fnString scripts
 * Can be customized per node to pass settings and parameters to the script
 */
export interface ScriptConfig {
  [key: string]: any;
}

/**
 * Data structure for a workflow node
 * Supports both legacy API-based nodes and new fnString-based custom function nodes
 */
export interface WorkflowNodeData {
  // Display and labeling
  labelText?: string;
  label?: string;
  description?: string;

  // Node type classification
  type?: 'api' | 'action' | 'decision' | 'loop' | 'parallel' | 'condition' | 'workflowNode';

  // URL/API configuration (used for legacy API nodes without fnString)
  url?: string;
  apiUrl?: string;

  // Variable storage (used for legacy API nodes without fnString)
  varName?: string;
  variable?: string;

  // Conditional logic evaluation metadata
  checkVar?: string; // Variable name to check in conditions
  checkPath?: string; // Dot-notation path for nested property access (e.g., "data.weather.temp")

  // Custom function support (new feature)
  fnString?: string; // JavaScript async function body to execute for this node
  config?: ScriptConfig; // Configuration object passed to the fnString script

  // UI and action metadata
  actions?: Array<any>;
  metadata?: Record<string, any>;
}

/**
 * A workflow node with position and React Flow metadata
 */
export interface WorkflowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
  metadata?: Record<string, any>;
}

/**
 * A workflow edge connecting two nodes
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  from?: string; // Alternative property name
  to?: string; // Alternative property name
  label?: string;
  type?: string;
}

/**
 * The complete workflow object stored in Firestore
 */
export interface WorkflowObject {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/**
 * Firestore document structure for a rule with embedded workflow
 */
export interface RuleDocument {
  id: string;
  ruleId: string;
  name: string;
  type: string; // e.g., "Rule Checker"
  expr?: string; // Expression string
  detectPrompt?: string;
  systemPrompt?: string;
  relatedFields?: Array<string | { fieldName: string; fieldPath: string }>;
  categoryId?: string;
  
  // Workflow structure
  workflowObject: WorkflowObject;
  
  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: any;
}

/**
 * Context object provided to fnString scripts during execution
 * Scripts can use these tools and data to implement custom logic
 */
export interface FnStringContext {
  // Standard browser APIs
  fetch: typeof window.fetch;
  console: Console;
  alert?: typeof window.alert;

  // Workflow data
  node: WorkflowNode; // The current node being executed
  storeVars: Record<string, any>; // Read-only view of current workflow variables
  config: ScriptConfig; // Configuration passed to this node

  // Workflow control
  setVar: (name: string, value: any) => void; // Set a workflow variable
  apis: Array<any>; // Available API definitions

  [key: string]: any; // Allow extension
}
