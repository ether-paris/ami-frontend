import { env } from "$env/dynamic/private";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./db/schema";

// Use a relative path as a fallback so Vite doesn't crash during the Docker build
// when absolute directories (like /data) haven't been created yet.
const dbPath = env.DB_PATH || "tutor.db";

// Initialize SQLite database
const sqlite = new Database(dbPath, { create: true });

// Enable foreign keys
sqlite.exec("PRAGMA foreign_keys = ON;");

// Create tables if they don't exist (you can keep your manual table creations here
// if you aren't strictly running Drizzle migrations during startup)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL
    -- Add other columns from schema.ts
  );
`);

// Initialize Drizzle
export const db = drizzle(sqlite, { schema });
export { sqlite };
