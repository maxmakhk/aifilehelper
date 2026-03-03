#!/usr/bin/env node
import db from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Load .env from project root if present (same helper used in other migration)
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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    });
  }
} catch (e) {
  // ignore
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID || ''
};

function normalizeTs(val) {
  if (!val) return new Date().toISOString();
  try { if (typeof val.toDate === 'function') return val.toDate().toISOString(); } catch (e) {}
  if (typeof val === 'string') return val;
  try { return new Date(val).toISOString(); } catch (e) { return new Date().toISOString(); }
}

function ensureTable() {
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
}

async function migrate() {
  try {
    if (!firebaseConfig.projectId) {
      console.error('Missing Firebase configuration in environment. Set VITE_FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID etc.');
      process.exit(1);
    }

    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);

    ensureTable();

    // Read variables collection
    const snap = await getDocs(collection(firestore, 'variables'));
    const insertStmt = db.prepare(`INSERT OR REPLACE INTO variables (
      id, name, description, qty, tag, signal, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

    let count = 0;
    snap.forEach((doc) => {
      try {
        const d = doc.data ? doc.data() : {};
        const id = String(d.id || doc.id || '').trim();
        const name = d.name || '';
        const description = typeof d.description === 'string' ? d.description : (d.description ? JSON.stringify(d.description) : '');
        const qty = typeof d.qty === 'number' ? d.qty : 0;
        const tag = d.tag ? (Array.isArray(d.tag) ? JSON.stringify(d.tag) : (typeof d.tag === 'string' ? d.tag : JSON.stringify(d.tag))) : '[]';
        const signal = d.signal ? (typeof d.signal === 'string' ? d.signal : JSON.stringify(d.signal)) : '{}';
        const created_at = normalizeTs(d.createdAt || d.created_at || null);
        const updated_at = normalizeTs(d.updatedAt || d.updated_at || null);

        if (!id) {
          console.warn('Skipping variable doc with missing id:', doc.id);
          return;
        }

        insertStmt.run(id, name, description, qty, tag, signal, created_at, updated_at);
        count += 1;
      } catch (err) {
        console.error('Failed to migrate variable', doc.id, err);
      }
    });

    console.log(`Migrated ${count} variable record(s) from 'variables' collection into SQLite (table: variables).`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
