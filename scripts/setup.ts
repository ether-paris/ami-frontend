#!/usr/bin/env bun

import { $ } from 'bun';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from '../src/lib/server/db/schema';
import { join } from 'path';

console.log('🚀 Setting up Ami French Tutor...\n');

// Step 1: Check if .env file exists
const envPath = new URL('../.env', import.meta.url);
try {
  await Bun.file(envPath).text();
  console.log('✅ .env file found');
} catch {
  console.log('❌ .env file not found');
  console.log('Please create .env file from .env.example:');
  console.log('  cp .env.example .env');
  console.log('Then edit .env with your credentials\n');
  process.exit(1);
}

// Step 2: Run database migrations
console.log('📂 Running database migrations...');
try {
  const sqlite = new Database(`${process.env.HOME}/data/tutor.db`);
  const db = drizzle(sqlite, { schema });
  
  // Enable foreign keys
  sqlite.exec('PRAGMA foreign_keys = ON;');
  
  // Run official Drizzle migrations
  await migrate(db, { migrationsFolder: join(import.meta.dirname, '../drizzle') });
  
  sqlite.close();
  console.log('✅ Database setup complete\n');
} catch (error) {
  console.error('❌ Database setup failed:', error);
  process.exit(1);
}

// Step 3: Install dependencies if needed
console.log('📦 Checking dependencies...');
try {
  // This will throw if dependencies are missing
  await $`bun pm list`;
  console.log('✅ Dependencies installed\n');
} catch {
  console.log('⚠️  Dependencies not found, installing...');
  await $`bun install`;
  console.log('✅ Dependencies installed\n');
}

console.log('🎉 Setup complete!');
console.log('\nNext steps:');
console.log('1. Edit .env with your credentials');
console.log('2. Run: npm run dev');
console.log('3. Visit: http://localhost:5173');