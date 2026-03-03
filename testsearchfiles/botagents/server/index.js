import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import db from './db.js';
import { randomUUID } from 'crypto';
import http from 'http';
import { Server } from 'socket.io';
import { runWorkflow } from './workflowRunner.js';
import runManager from './runManager.js';
import { processPrompt } from './workflowPromptProcessor.js';
import projectManager from './projectManager.js';
import path from 'path';
import { initializeApp } from 'firebase/app';

// System prompt generator (moved out of client code)
import { generateSystemPrompt } from './systemPromptGenerator.js';
import { requestNodesAndEdgesFromXai } from './xaiService.js';
import { requestFromOllama } from './ollamaService.js';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.json());
app.use(cors());

// Initialize Firebase for server-side Firestore operations (used by endpoints below)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID || ''
};

console.log('[Firebase Init] Config loaded. projectId:', firebaseConfig.projectId ? '(set)' : '(empty)');
console.log('[Firebase Init] apiKey:', firebaseConfig.apiKey ? '(set)' : '(empty)');
console.log('[Firebase Init] authDomain:', firebaseConfig.authDomain ? '(set)' : '(empty)');

let firebaseApp = null;
let firestore = null;
try {
  if (firebaseConfig.projectId) {
    firebaseApp = initializeApp(firebaseConfig);
    firestore = getFirestore(firebaseApp);
    console.log('[Firebase Init] ✓ Initialized Firebase successfully');
  } else {
    console.warn('[Firebase Init] ✗ Firebase not configured - missing projectId. Set VITE_FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID in .env');
  }
} catch (e) {
  console.error('[Firebase Init] ✗ Failed to initialize Firebase:', e.message);
}

// -- Helpers ---------------------------------------------------------------
function normalizeTs(val) {
  if (!val) return new Date().toISOString();
  try { if (typeof val.toDate === 'function') return val.toDate().toISOString(); } catch (e) { }
  if (typeof val === 'string') return val;
  try { return new Date(val).toISOString(); } catch (e) { return new Date().toISOString(); }
}

// Ensure rule_categories table exists (migration scripts created it, but be safe)
db.exec(`
  CREATE TABLE IF NOT EXISTS rule_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL
  );
`);

// Ensure rules table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    rule_id TEXT,
    type TEXT,
    name TEXT,
    expr TEXT,
    detect_prompt TEXT,
    system_prompt TEXT,
    related_fields TEXT,
    category_id TEXT,
    workflow_object TEXT,
    created_at TEXT,
    updated_at TEXT
  );
`);

// Ensure logs table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );
`);

// Ensure variables table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS variables (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    qty REAL,
    tag TEXT,
    signal TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Load persisted runs_store.json (if present) before initializing runtime
(async () => {
  try {
    const runsPath = path.join(process.cwd(), 'runs_store.json');
    await projectManager.loadFromDisk(runsPath);
  } catch (e) {
    console.warn('Error loading runs_store.json at startup', e);
  }

  // Initialize project manager with Socket.IO after loading
  projectManager.init(io);

  // Save on graceful shutdown
  const saveAndExit = async () => {
    try {
      const runsPath = path.join(process.cwd(), 'runs_store.json');
      await projectManager.saveToDisk(runsPath);
      console.log('Saved runs_store.json on shutdown');
    } catch (e) {
      console.error('Error saving runs_store.json on shutdown', e);
    }
    process.exit(0);
  };

  process.on('SIGINT', saveAndExit);
  process.on('SIGTERM', saveAndExit);
})();

// ------------------ Rule Categories API ----------------------------------
app.get('/api/rule-categories', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, name, description, created_at FROM rule_categories ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ------------------ Logs API ----------------------------------------------
app.get('/api/logs', (req, res) => {
  try {
    const loadAll = req.query.all === 'true';
    const limitClause = loadAll ? '' : 'LIMIT 10';
    const rows = db.prepare(`SELECT id, payload FROM logs ORDER BY created_at DESC ${limitClause}`).all();

    // Parse the payload back out so the frontend receives the expected shape
    const logs = rows.map(r => {
      let data = {};
      try { data = JSON.parse(r.payload); } catch (e) { }
      return { id: r.id, ...data };
    });

    res.json({ logs, allLoaded: loadAll || logs.length < 10 });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.post('/api/logs', (req, res) => {
  try {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    // Merge ID/createdAt just in case so they exist in payload too
    const payloadData = { ...req.body, id, createdAt: req.body.createdAt || createdAt };

    const stmt = db.prepare('INSERT INTO logs (id, created_at, payload) VALUES (?, ?, ?)');
    stmt.run(id, createdAt, JSON.stringify(payloadData));
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ------------------ External APIs (server-mediated) ----------------------
// Add a new external API (server will persist to Firestore)
app.post('/api/external-apis', async (req, res) => {
  try {
    if (!firestore) return res.status(500).json({ error: 'firebase_not_configured' });
    const { name, url, tags = [], function: fn = '', cssStyle = '', description = '' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name_required' });
    const docRef = await addDoc(collection(firestore, 'VariableManager-apis'), {
      name,
      url,
      description: description || '',
      tags: Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim()).filter(Boolean),
      function: fn || '',
      metadata: { cssStyle: cssStyle || '' },
      lastPrompt: '',
      createdAt: new Date(),
    });
    const out = { id: docRef.id, name, url, description: description || '', tags: Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim()).filter(Boolean), function: fn || '', metadata: { cssStyle: cssStyle || '' }, lastPrompt: '', createdAt: new Date() };
    // notify project manager / running runners (if projectId provided)
    try {
      const projectId = req.body?.projectId;
      if (projectId) {
        const proj = projectManager.getProject(projectId);
        if (proj) {
          proj.apis = proj.apis ? (proj.apis.concat([out])) : [out];
          projectManager.broadcastToProject(projectId, 'workflow_updated', { projectId, apisCount: proj.apis.length, apis: proj.apis });
        }
      }
    } catch (e) {}
    res.json(out);
  } catch (err) { console.error('POST /api/external-apis error', err); res.status(500).json({ error: String(err) }); }
});

// Update API metadata
app.put('/api/external-apis/:id', async (req, res) => {
  console.log('Received PUT /api/external-apis/:id with id=', req.params.id, 'body=', req.body);
  try {
    console.log('PUT /api/external-apis/:id called with id=', req.params.id, 'bodyKeys=', Object.keys(req.body || {}));
    if (!firestore){
      console.log('Firestore not configured, cannot update API metadata');
      return res.status(500).json({ error: 'firebase_not_configured' });
    }
    const id = req.params.id;
    console.log('Step 1: Extracting projectId and metadata from body');
    const { projectId, ...metadata } = req.body || {};
    const metaFromBody = (metadata.metadata && typeof metadata.metadata === 'object') ? metadata.metadata : {};
    console.log('Step 2: projectId=', projectId, 'metadata keys=', Object.keys(metadata));
    const apiRef = doc(firestore, 'VariableManager-apis', id);
    console.log('Step 3: Created apiRef');
    const updateData = {};
    // Only include fields that should be persisted to Firestore
    if (metadata.name !== undefined) updateData.name = metadata.name;
    if (metadata.url !== undefined) updateData.url = metadata.url;
    if (metadata.description !== undefined) updateData.description = metadata.description;
    if (metadata['function'] !== undefined) updateData.function = metadata['function'];
    if (metadata.tags !== undefined) updateData.tags = Array.isArray(metadata.tags) ? metadata.tags : String(metadata.tags).split(',').map(t => t.trim()).filter(Boolean);
    const metaImage = metadata.image !== undefined ? metadata.image : metaFromBody.image;
    const metaSize = metadata.size !== undefined ? metadata.size : metaFromBody.size;
    const metaCss = metadata.cssStyle !== undefined ? metadata.cssStyle : metaFromBody.cssStyle;
    if (metaImage !== undefined) updateData['metadata.image'] = metaImage;
    if (metaSize !== undefined) updateData['metadata.size'] = metaSize;
    if (metaCss !== undefined) updateData['metadata.cssStyle'] = metaCss;
    updateData.updatedAt = serverTimestamp();
    console.log('Step 4: Built updateData before filtering:', JSON.stringify(updateData, null, 2));
    Object.keys(updateData).forEach(k => { if (updateData[k] === undefined) delete updateData[k]; });
    console.log('Step 5: Final updateData for Firestore:', JSON.stringify(updateData, null, 2));
    try {
      console.log('Step 6: About to call updateDoc');
      await updateDoc(apiRef, updateData);
      console.log(`Step 7: Updated API ${id} in Firestore successfully`);
    } catch (innerErr) {
      console.error('Firestore updateDoc failed for API id=', id, 'Error:', innerErr);
      return res.status(500).json({ error: 'firestore_update_failed', detail: String(innerErr && innerErr.message ? innerErr.message : innerErr) });
    }
    // notify running runners via projectManager
    try {
      if (projectId) {
        const proj = projectManager.getProject(projectId);
        if (proj) {
          // update apis array in-memory if present
          proj.apis = proj.apis ? proj.apis.map(a => {
            if (String(a.id) !== String(id)) return a;
            const mergedMetadata = { ...(a.metadata || {}) };
            if (metaFromBody.image !== undefined) mergedMetadata.image = metaFromBody.image;
            if (metaFromBody.size !== undefined) mergedMetadata.size = metaFromBody.size;
            if (metaFromBody.cssStyle !== undefined) mergedMetadata.cssStyle = metaFromBody.cssStyle;
            if (metadata.image !== undefined) mergedMetadata.image = metadata.image;
            if (metadata.size !== undefined) mergedMetadata.size = metadata.size;
            if (metadata.cssStyle !== undefined) mergedMetadata.cssStyle = metadata.cssStyle;
            return { ...a, ...metadata, metadata: mergedMetadata };
          }) : proj.apis;
          projectManager.broadcastToProject(projectId, 'workflow_updated', { projectId, apisCount: (proj.apis || []).length, apis: proj.apis });
        }
      } else {
        // No projectId provided — update any loaded projects that include this api id
        for (const [pid, proj] of projectManager.projects.entries()) {
          try {
            if (proj && Array.isArray(proj.apis) && proj.apis.find(a => String(a.id) === String(id))) {
              proj.apis = proj.apis.map(a => {
                if (String(a.id) !== String(id)) return a;
                const mergedMetadata = { ...(a.metadata || {}) };
                if (metaFromBody.image !== undefined) mergedMetadata.image = metaFromBody.image;
                if (metaFromBody.size !== undefined) mergedMetadata.size = metaFromBody.size;
                if (metaFromBody.cssStyle !== undefined) mergedMetadata.cssStyle = metaFromBody.cssStyle;
                if (metadata.image !== undefined) mergedMetadata.image = metadata.image;
                if (metadata.size !== undefined) mergedMetadata.size = metadata.size;
                if (metadata.cssStyle !== undefined) mergedMetadata.cssStyle = metadata.cssStyle;
                return { ...a, ...metadata, metadata: mergedMetadata };
              });
              projectManager.broadcastToProject(pid, 'workflow_updated', { projectId: pid, apisCount: proj.apis.length, apis: proj.apis });
              console.log(`Notified project ${pid} of API ${id} update`);
            }
          } catch (inner) {
            console.error('Error updating project apis for pid=', pid, inner);
          }
        }
      }
    } catch (e) { console.error('projectManager notify failed', e); }
    res.json({ success: true });
  } catch (err) {
    console.log('PUT ERROR /api/external-apis/:id outer catch error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// Delete API
app.delete('/api/external-apis/:id', async (req, res) => {
  try {
    if (!firestore) return res.status(500).json({ error: 'firebase_not_configured' });
    const id = req.params.id;
    await deleteDoc(doc(firestore, 'VariableManager-apis', id));
    try {
      const projectId = req.body?.projectId;
      if (projectId) {
        const proj = projectManager.getProject(projectId);
        if (proj) {
          proj.apis = proj.apis ? proj.apis.filter(a => String(a.id) !== String(id)) : proj.apis;
          projectManager.broadcastToProject(projectId, 'workflow_updated', { projectId, apisCount: (proj.apis || []).length, apis: proj.apis });
        }
      }
    } catch (e) {}
    res.json({ success: true });
  } catch (err) { console.error('DELETE /api/external-apis/:id error', err); res.status(500).json({ error: String(err) }); }
});

// Save API prompt (record last prompt)
app.post('/api/external-apis/:id/prompt', async (req, res) => {
  try {
    console.log("firestore=", firestore);
    if (!firestore) return res.status(500).json({ error: 'firebase_not_configured' });
    const id = req.params.id;
    const prompt = req.body?.prompt || '';
    const apiRef = doc(firestore, 'VariableManager-apis', id);
    await updateDoc(apiRef, { lastPrompt: prompt, updatedAt: serverTimestamp() });
    res.json({ success: true });
  } catch (err) { console.error('POST /api/external-apis/:id/prompt error', err); res.status(500).json({ error: String(err) }); }
});

// ------------------ Project State API (debug) --------------------------
// Return in-memory project state (nodes, edges, apis, storeVars, status)
app.get('/api/projects/:projectId/state', (req, res) => {
  try {
    const projectId = req.params.projectId;
    if (!projectId) return res.status(400).json({ error: 'projectId_required' });
    const project = projectManager.getProject(projectId);
    if (!project) return res.status(404).json({ error: 'not_found' });
    // Return a shallow copy to avoid accidental mutation by callers
    const out = {
      projectId,
      nodes: project.nodes || [],
      edges: project.edges || [],
      apis: project.apis || [],
      storeVars: project.storeVars || {},
      status: project.status || 'stopped',
      activeNodeId: project.activeNodeId || null,
      activeEdgeId: project.activeEdgeId || null,
      stepDelay: project.stepDelay || 1000
    };
    console.log(`[API] GET /api/projects/${projectId}/state -> returning project state`);
    res.json(out);
  } catch (err) {
    console.error('GET /api/projects/:projectId/state error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: String(err) });
  }
});

// ------------------ Global Store API (debug) --------------------------
// Return the single-layer global store object maintained by ProjectManager
app.get('/api/global-store', (req, res) => {
  try {
    const out = projectManager.getGlobalVars();
    res.json({ test: "OK", globalStoreVars: out });
  } catch (err) {
    console.error('GET /api/global-store error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: String(err) });
  }
});

// POST to set a global var for testing: { key: 'name', value: any }
app.post('/api/global-store', (req, res) => {
  try {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key_required' });
    projectManager.setGlobalVar(key, value);
    res.json({ success: true, key, value });
  } catch (err) {
    console.error('POST /api/global-store error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: String(err) });
  }
});

// POST generate system prompt server-side
app.post('/api/generate-system-prompt', async (req, res) => {
  console.log('Received POST /api/generate-system-prompt with body:', req.body.userPrompt, req.body.functionsList.length);
  try {
    const { userPrompt, functionsList, apis } = req.body || {};
    const result = generateSystemPrompt({ userPrompt, functionsList, apis });



    // ============================================================================
    // 02 28 REQUEST NODES AND EDGES FROM xAI
    // ============================================================================
    // This function calls xAI to generate nodes and edges from the user prompt
    // and system prompt. The xAI_ENDPOINT, XAI_API_KEY, and XAI_MODEL should be
    // configured in .env (e.g., XAI_ENDPOINT=https://api.x.ai/v1/chat/completions)
    //
    // To enable this: uncomment the code below and ensure .env is configured
    // ============================================================================
    
    /* UNCOMMENT TO ENABLE XAI INTEGRATION:
    try {
      const { nodesResult, edgesResult } = await requestNodesAndEdgesFromXai({
        systemPrompt: result.systemPrompt,
        userPrompt: userPrompt,
        xaiEndpoint: process.env.XAI_ENDPOINT,
        xaiApiKey: process.env.XAI_API_KEY,
        xaiModel: process.env.XAI_MODEL
      });
      
      // Merge nodes and edges into result
      result.nodes = nodesResult;
      result.edges = edgesResult;
      
      console.log(`[xAI] Successfully generated ${nodesResult.length} nodes and ${edgesResult.length} edges`);
    } catch (xaiErr) {
      console.error('[xAI] Error generating nodes/edges:', xaiErr.message);
      // Continue without xAI nodes/edges if request fails
      result.nodes = [];
      result.edges = [];
    }
    */

    // ============================================================================
    // REQUEST NODES AND EDGES FROM OLLAMA (LOCAL LLM)
    // ============================================================================
    // This function calls Ollama to generate nodes and edges from the user prompt
    // and system prompt. OLLAMA_URL and OLLAMA_MODEL should be configured in .env
    // (e.g., OLLAMA_URL=http://localhost:11434/api/chat, OLLAMA_MODEL=gemma3:4b)
    //
    // Ollama must be running locally before enabling this.
    // To enable this: uncomment the code below and ensure Ollama is running
    // ============================================================================
    
    try {
      const { ollamaResult } = await requestFromOllama({
        systemPrompt: result.systemPrompt,
        userPrompt: userPrompt,
        ollamaUrl: process.env.OLLAMA_URL,
        ollamaModel: process.env.OLLAMA_MODEL
      });
      
      // Return the complete Ollama result
      result.ollamaResult = ollamaResult;
      result.aimodel = process.env.OLLAMA_MODEL || 'gemma3:4b';
      
      // Extract nodes and edges from parsed workflow if available
      if (ollamaResult?.parsedWorkflow) {
        result.nodes = Array.isArray(ollamaResult.parsedWorkflow.nodes) ? ollamaResult.parsedWorkflow.nodes : [];
        result.edges = Array.isArray(ollamaResult.parsedWorkflow.edges) ? ollamaResult.parsedWorkflow.edges : [];
        console.log(`[Ollama] Successfully parsed ${result.nodes.length} nodes and ${result.edges.length} edges`);
      } else {
        result.nodes = [];
        result.edges = [];
        console.log('[Ollama] No parsed workflow available, but raw Ollama result available');
      }
      
    } catch (ollamaErr) {
      console.error('[Ollama] Error requesting from Ollama:', ollamaErr.message);
      // Continue without Ollama result if request fails
      result.ollamaResult = null;
      result.nodes = [];
      result.edges = [];
    }

    console.log('Generated system prompt result:', result);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('POST /api/generate-system-prompt error', err && err.stack ? err.stack : err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.post('/api/rule-categories', (req, res) => {
  try {
    const id = req.body.id || randomUUID();
    const name = req.body.name || 'Unnamed';
    const description = req.body.description || null;
    const created_at = normalizeTs(req.body.created_at || new Date().toISOString());
    const stmt = db.prepare('INSERT OR REPLACE INTO rule_categories (id, name, description, created_at) VALUES (?, ?, ?, ?)');
    stmt.run(id, name, description, created_at);
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.put('/api/rule-categories/:id', (req, res) => {
  try {
    const id = req.params.id;
    const name = req.body.name;
    const description = req.body.description;
    const stmt = db.prepare('UPDATE rule_categories SET name = ?, description = ? WHERE id = ?');
    stmt.run(name, description, id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.delete('/api/rule-categories/:id', (req, res) => {
  try {
    const id = req.params.id;
    const stmt = db.prepare('DELETE FROM rule_categories WHERE id = ?');
    stmt.run(id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ------------------ Rules API --------------------------------------------
app.get('/api/rules', (req, res) => {
  try {
    const categoryId = req.query.categoryId;
    let rows;
    if (categoryId && categoryId !== 'all') {
      rows = db.prepare('SELECT * FROM rules WHERE category_id = ? ORDER BY created_at DESC').all(categoryId);
    } else {
      rows = db.prepare('SELECT * FROM rules ORDER BY created_at DESC').all();
    }
    console.log(`check0221 Loaded ${rows.length} rules for categoryId=${categoryId || 'all'}`);
    // parse JSON workflow_object when present
    const parsed = rows.map(r => ({ ...r, workflowObject: r.workflow_object ? (() => { try { return JSON.parse(r.workflow_object); } catch (e) { return r.workflow_object; } })() : null }));
    res.json(parsed);
  } catch (err) { 
    console.error('check0221 Error loading rules:', err);
    res.status(500).json({ error: String(err) }); 

  }
});

app.get('/api/rules/:id', (req, res) => {
  try {
    const id = req.params.id;
    const row = db.prepare('SELECT * FROM rules WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const out = { ...row, workflowObject: row.workflow_object ? (() => { try { return JSON.parse(row.workflow_object); } catch (e) { return row.workflow_object; } })() : null };
    res.json(out);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.post('/api/rules', (req, res) => {
  try {
    const id = req.body.id || randomUUID();
    const rule_id = req.body.ruleId || req.body.rule_id || req.body.ruleId || id;
    const type = req.body.type || '';
    const name = req.body.name || '';
    const expr = typeof req.body.expr === 'string' ? req.body.expr : (req.body.expr ? JSON.stringify(req.body.expr) : '');
    const detect_prompt = req.body.detectPrompt || req.body.detect_prompt || '';
    const system_prompt = req.body.systemPrompt || req.body.system_prompt || '';
    const related_fields = req.body.relatedFields ? (typeof req.body.relatedFields === 'string' ? req.body.relatedFields : JSON.stringify(req.body.relatedFields)) : '';
    const category_id = req.body.categoryId || req.body.category_id || '';
    let workflow_object = req.body.workflowObject || req.body.workflow_object || '';
    if (workflow_object && typeof workflow_object !== 'string') {
      try { workflow_object = JSON.stringify(workflow_object); } catch (e) { workflow_object = String(workflow_object); }
    }
    const created_at = normalizeTs(req.body.created_at || req.body.createdAt || new Date().toISOString());
    const updated_at = normalizeTs(req.body.updated_at || req.body.updatedAt || new Date().toISOString());

    const stmt = db.prepare(`INSERT OR REPLACE INTO rules (
      id, rule_id, type, name, expr, detect_prompt, system_prompt, related_fields, category_id, workflow_object, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(id, rule_id, type, name, expr, detect_prompt, system_prompt, related_fields, category_id, workflow_object, created_at, updated_at);
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.delete('/api/rules/:id', (req, res) => {
  try {
    const id = req.params.id;
    const stmt = db.prepare('DELETE FROM rules WHERE id = ?');
    stmt.run(id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ------------------ Variables API ----------------------------------------
app.get('/api/variables', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM variables ORDER BY created_at DESC').all();
    // Parse tag and signal JSON fields
    const parsed = rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      qty: r.qty,
      tag: r.tag ? (() => { try { return JSON.parse(r.tag); } catch (e) { return []; } })() : [],
      signal: r.signal ? (() => { try { return JSON.parse(r.signal); } catch (e) { return {}; } })() : {},
      created_at: r.created_at,
      updated_at: r.updated_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
    res.json(parsed);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.post('/api/variables', (req, res) => {
  try {
    const id = req.body.id || randomUUID();
    const name = req.body.name || '';
    const description = typeof req.body.description === 'string' ? req.body.description : (req.body.description ? JSON.stringify(req.body.description) : '');
    const qty = typeof req.body.qty === 'number' ? req.body.qty : 0;
    const tag = req.body.tag ? (Array.isArray(req.body.tag) ? JSON.stringify(req.body.tag) : (typeof req.body.tag === 'string' ? req.body.tag : JSON.stringify(req.body.tag))) : '[]';
    const signal = req.body.signal ? (typeof req.body.signal === 'string' ? req.body.signal : JSON.stringify(req.body.signal)) : '{}';
    const created_at = normalizeTs(req.body.createdAt || req.body.created_at || new Date().toISOString());
    const updated_at = normalizeTs(req.body.updatedAt || req.body.updated_at || new Date().toISOString());

    const stmt = db.prepare('INSERT OR REPLACE INTO variables (id, name, description, qty, tag, signal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run(id, name, description, qty, tag, signal, created_at, updated_at);
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.put('/api/variables/:id', (req, res) => {
  try {
    const id = req.params.id;
    const name = req.body.name;
    const description = typeof req.body.description === 'string' ? req.body.description : (req.body.description ? JSON.stringify(req.body.description) : undefined);
    const qty = typeof req.body.qty === 'number' ? req.body.qty : undefined;
    const tag = req.body.tag ? (Array.isArray(req.body.tag) ? JSON.stringify(req.body.tag) : (typeof req.body.tag === 'string' ? req.body.tag : JSON.stringify(req.body.tag))) : undefined;
    const updated_at = normalizeTs(new Date().toISOString());

    let updates = [];
    let params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (qty !== undefined) { updates.push('qty = ?'); params.push(qty); }
    if (tag !== undefined) { updates.push('tag = ?'); params.push(tag); }
    updates.push('updated_at = ?');
    params.push(updated_at);
    params.push(id);

    if (updates.length > 0) {
      const stmt = db.prepare(`UPDATE variables SET ${updates.join(', ')} WHERE id = ?`);
      stmt.run(...params);
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.delete('/api/variables/:id', (req, res) => {
  try {
    const id = req.params.id;
    const stmt = db.prepare('DELETE FROM variables WHERE id = ?');
    stmt.run(id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.post('/api/variables/:id/signal/:signalName', (req, res) => {
  try {
    const id = req.params.id;
    const signalName = req.params.signalName;

    const row = db.prepare('SELECT signal FROM variables WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });

    let signal = {};
    try { signal = JSON.parse(row.signal || '{}'); } catch (e) { }

    const newSignalData = { ...req.body, lastUpdatedAt: req.body.lastUpdatedAt || new Date().toISOString() };
    signal[signalName] = newSignalData;

    const updated_at = normalizeTs(new Date().toISOString());
    const stmt = db.prepare('UPDATE variables SET signal = ?, updated_at = ? WHERE id = ?');
    stmt.run(JSON.stringify(signal), updated_at, id);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.put('/api/variables/:id/signal/:signalName/:fieldName', (req, res) => {
  try {
    const id = req.params.id;
    const signalName = req.params.signalName;
    const fieldName = req.params.fieldName;
    const value = req.body.value;

    const row = db.prepare('SELECT signal FROM variables WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });

    let signal = {};
    try { signal = JSON.parse(row.signal || '{}'); } catch (e) { }

    if (!signal[signalName]) signal[signalName] = {};
    signal[signalName][fieldName] = value;
    signal[signalName].lastUpdatedAt = new Date().toISOString();

    const updated_at = normalizeTs(new Date().toISOString());
    const stmt = db.prepare('UPDATE variables SET signal = ?, updated_at = ? WHERE id = ?');
    stmt.run(JSON.stringify(signal), updated_at, id);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.delete('/api/variables/:id/signal/:signalName', (req, res) => {
  try {
    const id = req.params.id;
    const signalName = req.params.signalName;

    const row = db.prepare('SELECT signal FROM variables WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });

    let signal = {};
    try { signal = JSON.parse(row.signal || '{}'); } catch (e) { }

    delete signal[signalName];

    const updated_at = normalizeTs(new Date().toISOString());
    const stmt = db.prepare('UPDATE variables SET signal = ?, updated_at = ? WHERE id = ?');
    stmt.run(JSON.stringify(signal), updated_at, id);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// 建立一個 world（測試用）
app.post('/worlds', (req, res) => {
  const id = randomUUID();
  const name = req.body.name || 'Untitled World';
  const createdAt = new Date().toISOString();

  const stmt = db.prepare(
    'INSERT INTO worlds (id, name, created_at) VALUES (?, ?, ?)'
  );
  stmt.run(id, name, createdAt);

  res.json({ id, name, createdAt });
});

// 取得全部 worlds
app.get('/worlds', (req, res) => {
  const rows = db.prepare('SELECT * FROM worlds').all();
  res.json(rows);
});

// ------------------ Socket.IO Workflow Execution -------------------------
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Register client with ProjectManager
  projectManager.registerClient(socket.id, socket);

  // Send all project statuses immediately on connect
  const allStatuses = projectManager.getAllProjectStatuses();
  socket.emit('all_project_statuses', allStatuses);
  console.log(`[Socket] Sent all project statuses to ${socket.id}:`, allStatuses);

  // Client wants to watch a project
  socket.on('watch_project', (data) => {
    const { projectId } = data || {};
    if (!projectId) return;
    console.log(`[Socket] Client ${socket.id} wants to watch project ${projectId}`);
    projectManager.watchProject(socket.id, projectId);
  });

  // Client wants to unwatch current project
  socket.on('unwatch_project', () => {
    const client = projectManager.clients.get(socket.id);
    if (client && client.projectId) {
      projectManager.unwatchProject(socket.id, client.projectId);
      client.projectId = null;
    }
  });

  // Client triggers run/stop for a project
  socket.on('project_control', (data) => {
    const { projectId, action } = data || {};
    if (!projectId || !action) return;

    console.log(`[Socket] Client ${socket.id} ${action} project ${projectId}`);

    // Ensure client is watching this project
    const client = projectManager.clients.get(socket.id);
    if (client && client.projectId !== projectId) {
      console.log(`[Socket] Client ${socket.id} not watching ${projectId}, auto-watching now`);
      projectManager.watchProject(socket.id, projectId);
    }

    if (action === 'run') {
      // Load or update project with provided data
      const nodes = data.nodes || [];
      const edges = data.edges || [];
      const apis = data.apis || [];
      const stepDelay = data.stepDelay || 1000;
      
      console.log(`[Socket] Starting project ${projectId} with ${nodes.length} nodes, ${edges.length} edges`);
      
      // Start project (sets status to 'running', execution loop will pick it up)
      projectManager.startProject(projectId, nodes, edges, apis, stepDelay);
      
    } else if (action === 'stop') {
      console.log(`[Socket] Stopping project ${projectId}`);
      // Stop project (sets status to 'stopped', execution loop will abort it)
      projectManager.stopProject(projectId);
    }
  });

  // Client updates workflow (nodes/edges)
  socket.on('update_project_workflow', (data) => {
    const { projectId, nodes, edges } = data || {};
    if (!projectId) return;

    console.log(`[Socket] Client ${socket.id} updated workflow for ${projectId}`);
    projectManager.updateProjectWorkflow(projectId, nodes, edges);
  });

  // Allow clients to subscribe to run updates by runId
  socket.on('run.subscribe', (data) => {
    try {
      const { runId } = data || {};
      if (!runId) return socket.emit('run_error', { message: 'runId required to subscribe' });
      const room = `run:${runId}`;
      socket.join(room);
      const run = runManager.getRun(runId);
      socket.emit('run_status', run ? { runId: run.runId, status: run.status, projectId: run.projectId } : { notFound: true });
    } catch (e) { console.warn('subscribe error', e); }
  });

  // Allow clients to unsubscribe from run updates
  socket.on('run.unsubscribe', (data) => {
    try {
      const { runId } = data || {};
      if (!runId) return;
      socket.leave(`run:${runId}`);
    } catch (e) { }
  });

  // Client-side control messages forwarded to run manager
  socket.on('run.control', (data) => {
    try {
      const { runId, event, payload } = data || {};
      if (!runId || !event) return socket.emit('run_control_ack', { ok: false, message: 'runId and event required' });
      const ok = runManager.receiveClientEvent(runId, event, payload);
      socket.emit('run_control_ack', { ok });
    } catch (e) { socket.emit('run_control_ack', { ok: false, message: String(e) }); }
  });

  // Allow starting a run via socket (convenience)
  socket.on('run.start', (data) => {
    try {
      const run = runManager.startRun(data || {});
      socket.emit('run.started', { runId: run.runId, projectId: run.projectId });
    } catch (e) { socket.emit('run_error', { message: String(e) }); }
  });

  socket.on('run_workflow', async (data) => {
    try {
      console.log(`[Socket ${socket.id}] Starting workflow execution`);
      await runWorkflow(socket, data);
    } catch (err) {
      console.error('Workflow execution error:', err);
      try {
        socket.emit('workflow_complete');
      } catch (e) { }
    }
  });

  socket.on('process_prompt', async (data) => {
    const { nodeId, promptText, apis = [], workflowData = null } = data;
    console.log(`[Socket ${socket.id}] Processing prompt for node:`, nodeId);

    try {
      // Emit start event
      socket.emit('prompt_processing_start', { nodeId });

      // Run the pipeline
      const result = await processPrompt({ nodeId, promptText, apis, workflowData });

      // Emit progress events
      socket.emit('prompt_normalized', {
        nodeId,
        normalizedPrompt: result.normalizedPrompt,
        originalPrompt: result.originalPrompt
      });

      socket.emit('function_generated', {
        nodeId,
        fnString: result.fnString,
        normalizeFnString: result.normalizeFnString
      });

      // Emit final result
      socket.emit('workflow_ready', {
        nodeId,
        workflowData: result.workflowData,
        nodes: result.workflowData?.nodes || [],
        edges: result.workflowData?.edges || [],
        metadata: {
          originalPrompt: result.originalPrompt,
          normalizedPrompt: result.normalizedPrompt,
          fnString: result.fnString,
          normalizeFnString: result.normalizeFnString
        }
      });

      console.log(`[Socket ${socket.id}] Prompt processing completed for node:`, nodeId);
    } catch (err) {
      console.error(`[Socket ${socket.id}] Prompt processing failed:`, err);
      socket.emit('prompt_error', {
        nodeId,
        message: err.message || 'Failed to process prompt'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    projectManager.unregisterClient(socket.id);
  });
});

// Initialize run manager with io so it can broadcast to rooms
runManager.init(io);

// Initialize project manager with io and start execution loop
projectManager.init(io);

// ------------------ Run Control REST API --------------------------------
app.post('/api/run/start', (req, res) => {
  try {
    const { projectId, nodes, edges, apis, options } = req.body || {};
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    const run = runManager.startRun({ projectId, nodes, edges, apis, options });
    res.json({ success: true, runId: run.runId });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.post('/api/run/stop', (req, res) => {
  try {
    const { runId } = req.body || {};
    if (!runId) return res.status(400).json({ error: 'runId required' });
    const r = runManager.stopRun(runId);
    res.json({ success: !!r });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/run/status', (req, res) => {
  try {
    const { projectId, runId } = req.query || {};
    if (projectId) {
      const s = runManager.getRunStatusByProject(projectId);
      //console.log(`[RunStatus] query projectId=${projectId} -> ${s ? `runId=${s.runId} status=${s.status}` : 'no-run'}`);
      return res.json(s || {});
    }
    if (runId) {
      const s = runManager.getRun(runId);
      return res.json(s || {});
    }
    res.status(400).json({ error: 'projectId or runId required' });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/projects/statuses', (req, res) => {
  try {
    const statuses = projectManager.getAllProjectStatuses();
    res.json(statuses);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

const port = process.env.PORT || 3001;
server.listen(port, () => {
  console.log('server running on', port);
});
