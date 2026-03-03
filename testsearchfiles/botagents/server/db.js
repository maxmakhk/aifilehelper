// server/db.js
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB 檔案放在專案根目錄 /data 內
const dbPath = path.join(__dirname, '..', 'data', 'botagents.db');
const db = new Database(dbPath);

// 初始化資料表（先做一個 worlds 作示例）
db.exec(`
  CREATE TABLE IF NOT EXISTS worlds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export default db;
