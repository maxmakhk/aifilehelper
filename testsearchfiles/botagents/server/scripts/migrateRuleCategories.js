#!/usr/bin/env node
import db from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Try to load .env from project root if present (so running with plain `node` finds VITE_* vars)
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '..', '..');
  const envPath = path.join(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      // remove surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    });
  }
} catch (e) {
  // ignore .env loading errors
}

// Read Firebase config from environment (support VITE_ prefixed vars used by the app)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID || ''
};

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rule_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

function normalizeCreatedAt(val) {
  if (!val) return new Date().toISOString();
  try {
    // Firestore Timestamp has toDate()
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
  } catch (e) {}
  if (typeof val === 'string') return val;
  try { return new Date(val).toISOString(); } catch (e) { return new Date().toISOString(); }
}

async function migrate() {
  try {
    if (!firebaseConfig.projectId) {
      console.error('Missing Firebase configuration in environment. Set VITE_FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID etc.');
      process.exit(1);
    }

    // initialize firebase (client SDK)
    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);

    ensureTable();

    // Try the app's collection name first, then fall back to legacy 'RuleCategory'
    let snap = await getDocs(collection(firestore, 'VariableManager-ruleCategories'));
    let usedCollection = 'VariableManager-ruleCategories';
    if (!snap || snap.size === 0) {
      // fallback
      snap = await getDocs(collection(firestore, 'RuleCategory'));
      usedCollection = 'RuleCategory';
    }

    const insertStmt = db.prepare('INSERT OR REPLACE INTO rule_categories (id, name, description, created_at) VALUES (?, ?, ?, ?)');

    let count = 0;
    snap.forEach((doc) => {
      try {
        const data = doc.data ? doc.data() : {};
        const id = String(doc.id || data.id || '').trim();
        const name = (data.name || '').trim();
        const description = data.description == null ? null : String(data.description);
        const created_at = normalizeCreatedAt(data.createdAt || data.created_at || data.ts || null);

        if (!id || !name) {
          console.warn('Skipping document missing id or name:', doc.id);
          return;
        }

        insertStmt.run(id, name, description, created_at);
        count += 1;
      } catch (err) {
        console.error('Failed to migrate doc', doc.id, err);
      }
    });

    console.log(`Migrated ${count} rule category record(s) from '${usedCollection}' into SQLite (table: rule_categories).`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

// Run the migration when executed
migrate();
