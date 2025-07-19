import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Granular coordinate system schemas
export const coordinateSchema = z.object({
  worldId: z.string().uuid(),
  regionId: z.string().uuid(), 
  blockId: z.string().uuid(),
  cellId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
  z: z.number().optional() // Optional for 2D games
});

export const position2DSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const position3DSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});

// World hierarchy tables
export const worlds = pgTable("worlds", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  dimensions: integer("dimensions").notNull().default(3), // 2D or 3D
  maxPlayers: integer("max_players").notNull().default(10000),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// World regions table for sharding - each region has its own unification container
export const regions = pgTable("regions", {
  id: uuid("id").primaryKey().defaultRandom(),
  worldId: uuid("world_id").notNull().references(() => worlds.id),
  name: text("name").notNull(),
  gridX: integer("grid_x").notNull(), // Grid position in world
  gridY: integer("grid_y").notNull(),
  minX: real("min_x").notNull(),
  maxX: real("max_x").notNull(),
  minY: real("min_y").notNull(),
  maxY: real("max_y").notNull(),
  minZ: real("min_z"),
  maxZ: real("max_z"),
  unificationContainerId: text("unification_container_id").notNull(),
  serverNode: text("server_node").notNull(),
  playerCount: integer("player_count").notNull().default(0),
  maxPlayers: integer("max_players").notNull().default(100),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Blocks within regions - for procedural generation and object placement
export const blocks = pgTable("blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  regionId: uuid("region_id").notNull().references(() => regions.id),
  name: text("name").notNull(),
  gridX: integer("grid_x").notNull(), // Grid position in region
  gridY: integer("grid_y").notNull(),
  minX: real("min_x").notNull(),
  maxX: real("max_x").notNull(),
  minY: real("min_y").notNull(),
  maxY: real("max_y").notNull(),
  minZ: real("min_z"),
  maxZ: real("max_z"),
  biome: text("biome"),
  generatedObjects: jsonb("generated_objects").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Cells within blocks - finest granularity for precise object placement
export const cells = pgTable("cells", {
  id: uuid("id").primaryKey().defaultRandom(),
  blockId: uuid("block_id").notNull().references(() => blocks.id),
  gridX: integer("grid_x").notNull(), // Grid position in block
  gridY: integer("grid_y").notNull(),
  minX: real("min_x").notNull(),
  maxX: real("max_x").notNull(),
  minY: real("min_y").notNull(),
  maxY: real("max_y").notNull(),
  minZ: real("min_z"),
  maxZ: real("max_z"),
  terrainType: text("terrain_type"),
  objects: jsonb("objects").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Player table with granular positioning
export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  level: integer("level").notNull().default(1),
  experience: integer("experience").notNull().default(0),
  health: integer("health").notNull().default(100),
  mana: integer("mana").notNull().default(100),
  // Granular coordinate system
  worldId: uuid("world_id").notNull().references(() => worlds.id),
  regionId: uuid("region_id").notNull().references(() => regions.id),
  blockId: uuid("block_id").notNull().references(() => blocks.id),
  cellId: uuid("cell_id").notNull().references(() => cells.id),
  // Precise position within cell
  positionX: real("position_x").notNull().default(0),
  positionY: real("position_y").notNull().default(0),
  positionZ: real("position_z"), // Optional for 2D games
  inventory: jsonb("inventory").notNull().default({}),
  stats: jsonb("stats").notNull().default({}),
  guild: text("guild"),
  lastActive: timestamp("last_active").notNull().defaultNow(),
  isOnline: boolean("is_online").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Game objects - findable by UUID on admin backend
export const gameObjects = pgTable("game_objects", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // npc, item, structure, etc.
  name: text("name").notNull(),
  // Granular positioning
  worldId: uuid("world_id").notNull().references(() => worlds.id),
  regionId: uuid("region_id").notNull().references(() => regions.id),
  blockId: uuid("block_id").notNull().references(() => blocks.id),
  cellId: uuid("cell_id").notNull().references(() => cells.id),
  positionX: real("position_x").notNull(),
  positionY: real("position_y").notNull(),
  positionZ: real("position_z"),
  properties: jsonb("properties").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Game sessions for tracking player connections
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id").notNull().references(() => players.id),
  sessionToken: text("session_token").notNull().unique(),
  regionId: uuid("region_id").notNull().references(() => regions.id),
  unificationContainerId: text("unification_container_id").notNull(),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  isActive: boolean("is_active").notNull().default(true),
});

// Game events for audit trail and analytics - all with UUIDs for debugging
export const gameEvents = pgTable("game_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  traceId: uuid("trace_id").notNull().defaultRandom(), // For debugging and tracing
  playerId: uuid("player_id").references(() => players.id),
  gameObjectId: uuid("game_object_id").references(() => gameObjects.id),
  eventType: text("event_type").notNull(), // combat, movement, trade, etc.
  eventData: jsonb("event_data").notNull(),
  // Granular location tracking
  worldId: uuid("world_id").references(() => worlds.id),
  regionId: uuid("region_id").references(() => regions.id),
  blockId: uuid("block_id").references(() => blocks.id),
  cellId: uuid("cell_id").references(() => cells.id),
  unificationContainerId: text("unification_container_id"),
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
export const insertWorldSchema = createInsertSchema(worlds).omit({
  id: true,
  createdAt: true,
});

export const insertRegionSchema = createInsertSchema(regions).omit({
  id: true,
  createdAt: true,
});

export const insertBlockSchema = createInsertSchema(blocks).omit({
  id: true,
  createdAt: true,
});

export const insertCellSchema = createInsertSchema(cells).omit({
  id: true,
  createdAt: true,
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGameObjectSchema = createInsertSchema(gameObjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  startedAt: true,
  lastActivity: true,
});

export const insertGameEventSchema = createInsertSchema(gameEvents).omit({
  id: true,
  traceId: true,
  timestamp: true,
});

export const insertGuildSchema = createInsertSchema(guilds).omit({
  id: true,
  createdAt: true,
});

// Player update schema for gameplay updates with granular positioning
export const updatePlayerSchema = z.object({
  level: z.number().min(1).optional(),
  experience: z.number().min(0).optional(),
  health: z.number().min(0).max(100).optional(),
  mana: z.number().min(0).max(100).optional(),
  // Granular position updates
  worldId: z.string().uuid().optional(),
  regionId: z.string().uuid().optional(),
  blockId: z.string().uuid().optional(),
  cellId: z.string().uuid().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  positionZ: z.number().optional(),
  inventory: z.record(z.any()).optional(),
  stats: z.record(z.any()).optional(),
  guild: z.string().nullable().optional(),
  isOnline: z.boolean().optional(),
});

// Game object search schema for admin backend
export const gameObjectSearchSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  worldId: z.string().uuid().optional(),
  regionId: z.string().uuid().optional(),
  blockId: z.string().uuid().optional(),
  cellId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

// Event schemas for real-time gameplay with granular positioning
export const playerMovementEventSchema = z.object({
  traceId: z.string().uuid(),
  playerId: z.string().uuid(),
  // From position (granular)
  fromWorldId: z.string().uuid(),
  fromRegionId: z.string().uuid(),
  fromBlockId: z.string().uuid(),
  fromCellId: z.string().uuid(),
  fromX: z.number(),
  fromY: z.number(),
  fromZ: z.number().optional(),
  // To position (granular)
  toWorldId: z.string().uuid(),
  toRegionId: z.string().uuid(),
  toBlockId: z.string().uuid(),
  toCellId: z.string().uuid(),
  toX: z.number(),
  toY: z.number(),
  toZ: z.number().optional(),
  timestamp: z.number(),
});

export const combatEventSchema = z.object({
  traceId: z.string().uuid(),
  attackerId: z.string().uuid(),
  defenderId: z.string().uuid(),
  damage: z.number().min(0),
  skill: z.string(),
  // Location where combat occurred
  worldId: z.string().uuid(),
  regionId: z.string().uuid(),
  blockId: z.string().uuid(),
  cellId: z.string().uuid(),
  timestamp: z.number(),
});

export const chatEventSchema = z.object({
  traceId: z.string().uuid(),
  playerId: z.string().uuid(),
  channel: z.enum(["global", "world", "region", "block", "guild", "whisper"]),
  message: z.string().max(500),
  targetId: z.string().uuid().optional(),
  // Location context for regional chat
  worldId: z.string().uuid().optional(),
  regionId: z.string().uuid().optional(),
  blockId: z.string().uuid().optional(),
  timestamp: z.number(),
});

// Types
export type World = typeof worlds.$inferSelect;
export type InsertWorld = z.infer<typeof insertWorldSchema>;

export type Region = typeof regions.$inferSelect;
export type InsertRegion = z.infer<typeof insertRegionSchema>;

export type Block = typeof blocks.$inferSelect;
export type InsertBlock = z.infer<typeof insertBlockSchema>;

export type Cell = typeof cells.$inferSelect;
export type InsertCell = z.infer<typeof insertCellSchema>;

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type UpdatePlayer = z.infer<typeof updatePlayerSchema>;

export type GameObject = typeof gameObjects.$inferSelect;
export type InsertGameObject = z.infer<typeof insertGameObjectSchema>;
export type GameObjectSearch = z.infer<typeof gameObjectSearchSchema>;

export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;

export type GameEvent = typeof gameEvents.$inferSelect;
export type InsertGameEvent = z.infer<typeof insertGameEventSchema>;

export type Guild = typeof guilds.$inferSelect;
export type InsertGuild = z.infer<typeof insertGuildSchema>;

export type PlayerMovementEvent = z.infer<typeof playerMovementEventSchema>;
export type CombatEvent = z.infer<typeof combatEventSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;

export type Coordinate = z.infer<typeof coordinateSchema>;
export type Position2D = z.infer<typeof position2DSchema>;
export type Position3D = z.infer<typeof position3DSchema>;

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
