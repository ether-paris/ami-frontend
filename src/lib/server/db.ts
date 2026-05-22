import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './db/schema';

// Initialize SQLite database
const sqlite = new Database(process.env.DB_PATH || '/data/tutor.db');
const db = drizzle(sqlite, { schema });

// Enable foreign keys
sqlite.exec('PRAGMA foreign_keys = ON;');

// Create tables if they don't exist (simplified example)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    -- Add other columns from schema.ts
  );
`);

// Add more tables as needed...

export { db, sqlite };