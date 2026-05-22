import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  google_id: text('google_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name'),
  created_at: integer('created_at', { mode: 'timestamp' }).default(sql`(current_timestamp)`),
});

export const usage_logs = sqliteTable('usage_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().references(() => users.id),
  resource_type: text('resource_type').notNull(),
  characters_processed: integer('characters_processed'),
  tokens_consumed: integer('tokens_consumed'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`(current_timestamp)`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UsageLog = typeof usage_logs.$inferSelect;
export type NewUsageLog = typeof usage_logs.$inferInsert;