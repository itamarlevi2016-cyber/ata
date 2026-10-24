import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(), payload: text('payload').notNull(),
  version: integer('version').notNull().default(1),
  deleted: integer('deleted').notNull().default(0), updatedAt: integer('updated_at').notNull(),
  updatedBy: text('updated_by'),
});
export const sharedState = sqliteTable('shared_state', {
  id: integer('id').primaryKey(), revision: integer('revision').notNull().default(0),
  mutation: text('mutation').notNull().default(''), seedVersion: text('seed_version').notNull().default(''),
});
export const profileHistory = sqliteTable('profile_history', {
  id: text('id').primaryKey(), profileId: text('profile_id').notNull(),
  payload: text('payload').notNull(), version: integer('version').notNull(),
  deleted: integer('deleted').notNull(), changedAt: integer('changed_at').notNull(),
  changedBy: text('changed_by'),
});
export const appliedRequests = sqliteTable('applied_requests', {
  id: text('id').primaryKey(), revision: integer('revision').notNull(),
});
// חברות המרחב: בקשות הצטרפות ממתינות, מאושרות או נדחות. מנהלות מאשרות מתוך האתר.
export const members = sqliteTable('members', {
  email: text('email').primaryKey(), name: text('name').notNull().default(''),
  status: text('status').notNull().default('pending'), role: text('role').notNull().default('member'),
  note: text('note').notNull().default(''), requestedAt: integer('requested_at').notNull(),
  decidedAt: integer('decided_at'), decidedBy: text('decided_by'),
});
export const celebrations = sqliteTable('celebrations', {
  id: text('id').primaryKey(), groom: text('groom').notNull(), bride: text('bride').notNull(),
  createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
});
