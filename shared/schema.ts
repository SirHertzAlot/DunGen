import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Player table with MMORPG-specific fields
export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  level: integer("level").notNull().default(1),
  experience: integer("experience").notNull().default(0),
  health: integer("health").notNull().default(100),
  mana: integer("mana").notNull().default(100),
  positionX: real("position_x").notNull().default(0),
  positionY: real("position_y").notNull().default(0),
  positionZ: real("position_z").notNull().default(0),
  regionId: text("region_id").notNull().default("region_0_0"),
  inventory: jsonb("inventory").notNull().default({}),
  stats: jsonb("stats").notNull().default({}),
  guild: text("guild"),
  lastActive: timestamp("last_active").notNull().defaultNow(),
  isOnline: boolean("is_online").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// World regions table for sharding
export const regions = pgTable("regions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  minX: real("min_x").notNull(),
  maxX: real("max_x").notNull(),
  minY: real("min_y").notNull(),
  maxY: real("max_y").notNull(),
  serverNode: text("server_node").notNull(),
  playerCount: integer("player_count").notNull().default(0),
  maxPlayers: integer("max_players").notNull().default(100),
  status: text("status").notNull().default("active"), // active, maintenance, offline
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Game sessions for tracking player connections
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id").notNull().references(() => players.id),
  sessionToken: text("session_token").notNull().unique(),
  regionId: text("region_id").notNull().references(() => regions.id),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  isActive: boolean("is_active").notNull().default(true),
});

// Game events for audit trail and analytics
export const gameEvents = pgTable("game_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id").references(() => players.id),
  eventType: text("event_type").notNull(), // combat, movement, trade, etc.
  eventData: jsonb("event_data").notNull(),
  regionId: text("region_id"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// Guilds table
export const guilds = pgTable("guilds", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  leaderId: uuid("leader_id").notNull().references(() => players.id),
  memberCount: integer("member_count").notNull().default(1),
  maxMembers: integer("max_members").notNull().default(50),
  level: integer("level").notNull().default(1),
  experience: integer("experience").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas
export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRegionSchema = createInsertSchema(regions).omit({
  createdAt: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  startedAt: true,
  lastActivity: true,
});

export const insertGameEventSchema = createInsertSchema(gameEvents).omit({
  id: true,
  timestamp: true,
});

export const insertGuildSchema = createInsertSchema(guilds).omit({
  id: true,
  createdAt: true,
});

// Player update schema for gameplay updates
export const updatePlayerSchema = z.object({
  level: z.number().min(1).optional(),
  experience: z.number().min(0).optional(),
  health: z.number().min(0).max(100).optional(),
  mana: z.number().min(0).max(100).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  positionZ: z.number().optional(),
  regionId: z.string().optional(),
  inventory: z.record(z.any()).optional(),
  stats: z.record(z.any()).optional(),
  guild: z.string().nullable().optional(),
  isOnline: z.boolean().optional(),
});

// Event schemas for real-time gameplay
export const playerMovementEventSchema = z.object({
  playerId: z.string().uuid(),
  fromX: z.number(),
  fromY: z.number(),
  fromZ: z.number(),
  toX: z.number(),
  toY: z.number(),
  toZ: z.number(),
  timestamp: z.number(),
});

export const combatEventSchema = z.object({
  attackerId: z.string().uuid(),
  defenderId: z.string().uuid(),
  damage: z.number().min(0),
  skill: z.string(),
  timestamp: z.number(),
});

export const chatEventSchema = z.object({
  playerId: z.string().uuid(),
  channel: z.enum(["global", "region", "guild", "whisper"]),
  message: z.string().max(500),
  targetId: z.string().uuid().optional(),
  timestamp: z.number(),
});

// Types
export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type UpdatePlayer = z.infer<typeof updatePlayerSchema>;

export type Region = typeof regions.$inferSelect;
export type InsertRegion = z.infer<typeof insertRegionSchema>;

export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;

export type GameEvent = typeof gameEvents.$inferSelect;
export type InsertGameEvent = z.infer<typeof insertGameEventSchema>;

export type Guild = typeof guilds.$inferSelect;
export type InsertGuild = z.infer<typeof insertGuildSchema>;

export type PlayerMovementEvent = z.infer<typeof playerMovementEventSchema>;
export type CombatEvent = z.infer<typeof combatEventSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;

// Admin user schema for dashboard access
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("viewer"), // admin, moderator, viewer
  permissions: jsonb("permissions").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLogin: timestamp("last_login"),
});

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({
  id: true,
  createdAt: true,
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
