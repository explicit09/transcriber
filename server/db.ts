import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleSQLite } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Use SQLite in-memory database if DATABASE_URL is not set
let db;
if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set, using SQLite in-memory database for testing");
  // Create an in-memory SQLite database
  const sqlite = new Database(':memory:');
  db = drizzleSQLite(sqlite, { schema });
  
  // Create tables
  const createTable = sqlite.prepare(`
    CREATE TABLE IF NOT EXISTS transcriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      text TEXT,
      error TEXT,
      speaker_labels INTEGER DEFAULT 0,
      speaker_count INTEGER,
      has_timestamps INTEGER DEFAULT 0,
      duration REAL,
      language TEXT,
      translated_text TEXT,
      summary TEXT,
      action_items TEXT,
      keywords TEXT,
      meeting_title TEXT,
      meeting_date TEXT,
      participants TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  createTable.run();
} else {
  // Use PostgreSQL with Neon
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
}

export { db };