import { env } from "$env/dynamic/private";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./db/schema";

const dbPath = env.DB_PATH || "tutor.db";

// Initialize SQLite database
const sqlite = new Database(dbPath, { create: true });

// Enable foreign keys
sqlite.exec("PRAGMA foreign_keys = ON;");

// Create tables exactly matching your Drizzle schema
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT,
    created_at INTEGER DEFAULT (current_timestamp)
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    characters_processed INTEGER,
    tokens_consumed INTEGER,
    timestamp INTEGER DEFAULT (current_timestamp),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Initialize Drizzle
export const db = drizzle(sqlite, { schema });
export { sqlite };
