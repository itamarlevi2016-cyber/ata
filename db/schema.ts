import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(), payload: text('payload').notNull(),
  version: integer('version').notNull().default(1),
  deleted: integer('deleted').notNull().default(0), updatedAt: integer('updated_at').notNull(),
});
export const sharedState = sqliteTable('shared_state', {
  id: integer('id').primaryKey(), revision: integer('revision').notNull().default(0),
  mutation: text('mutation').notNull().default(''), seedVersion: text('seed_version').notNull().default(''),
});
export const profileHistory = sqliteTable('profile_history', {
  id: text('id').primaryKey(), profileId: text('profile_id').notNull(),
  payload: text('payload').notNull(), version: integer('version').notNull(),
  deleted: integer('deleted').notNull(), changedAt: integer('changed_at').notNull(),
});
export const appliedRequests = sqliteTable('applied_requests', {
  id: text('id').primaryKey(), revision: integer('revision').notNull(),
});
export const celebrations = sqliteTable('celebrations', {
  id: text('id').primaryKey(), groom: text('groom').notNull(), bride: text('bride').notNull(),
  createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
});
