import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from '../src/lib/server/db/schema';
import { join } from 'path';

// Create or connect to the database
const sqlite = new Database(`${process.env.HOME}/data/tutor.db`);
const db = drizzle(sqlite, { schema });

console.log('Running database migrations...');

try {
  // Enable foreign keys
  sqlite.exec('PRAGMA foreign_keys = ON;');
  
  // Run drizzle-orm migrations from the generated 'drizzle' folder
  await migrate(db, { migrationsFolder: join(import.meta.dirname, '../drizzle') });
  
  console.log('✅ Database migration completed successfully');
  
} catch (error) {
  console.error('❌ Database migration failed:', error);
  process.exit(1);
} finally {
  sqlite.close();
}