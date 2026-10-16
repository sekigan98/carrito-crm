import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import {sql} from "drizzle-orm";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(),
  role: text("role").notNull(), passwordHash: text("password_hash").notNull(),
  active: integer("active").notNull().default(1), mustChangePassword: integer("must_change_password").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(), userId: text("user_id").notNull().references(() => users.id),
  csrf: text("csrf").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [index("sessions_user").on(t.userId)]);
export const records = sqliteTable("records", {
  id: text("id").primaryKey(), module: text("module").notNull(), title: text("title").notNull(), status: text("status").notNull(),
  ownerId: text("owner_id").notNull().references(() => users.id), data: text("data").notNull(),
  version: integer("version").notNull().default(1), archived: integer("archived").notNull().default(0), mutationToken: text("mutation_token"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("records_module").on(t.module,t.archived), index("records_owner").on(t.ownerId)]);
export const grants = sqliteTable("grants", {
  recordId: text("record_id").notNull().references(() => records.id), userId: text("user_id").notNull().references(() => users.id),
  grantedBy: text("granted_by").notNull().references(() => users.id), expiresAt: integer("expires_at"), createdAt: text("created_at").notNull(),
}, t => [primaryKey({ columns: [t.recordId,t.userId] })]);
export const accessRequests = sqliteTable("access_requests", {
  id: text("id").primaryKey(), recordId: text("record_id").notNull().references(() => records.id),
  userId: text("user_id").notNull().references(() => users.id), reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), createdAt: text("created_at").notNull(),
  decidedBy: text("decided_by"), decidedAt: text("decided_at"), decisionToken: text("decision_token"),
}, t => [index("requests_status").on(t.status), uniqueIndex("requests_record_user_pending").on(t.recordId,t.userId).where(sql`${t.status} = 'pending'`)]);
export const locks = sqliteTable("record_locks", {
  recordId: text("record_id").primaryKey().references(() => records.id), userId: text("user_id").notNull().references(() => users.id),
  leaseId: text("lease_id").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const audit = sqliteTable("audit", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), recordId: text("record_id"),
  action: text("action").notNull(), beforeJson: text("before_json"), afterJson: text("after_json"), createdAt: text("created_at").notNull(),
}, t => [index("audit_record").on(t.recordId,t.createdAt)]);
export const loginAttempts = sqliteTable("login_attempts", {
  email: text("email").primaryKey(), attempts: integer("attempts").notNull().default(0), windowUntil: integer("window_until").notNull(),
});
