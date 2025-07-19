import { z } from 'zod';

// Player authentication schemas
export const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100)
});

export const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

// Player position and movement schemas
export const positionSchema = z.object({
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  z: z.number().min(-1000).max(1000).default(0)
});

export const movePlayerSchema = z.object({
  from: positionSchema,
  to: positionSchema,
  speed: z.number().min(0.1).max(100).default(5),
  timestamp: z.number()
});

// Inventory and item schemas
export const itemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.enum(['weapon', 'armor', 'consumable', 'material', 'quest']),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
  level: z.number().min(1).max(100),
  stats: z.record(z.number()).default({}),
  durability: z.number().min(0).max(100).optional(),
  stackSize: z.number().min(1).max(1000).default(1)
});

export const inventorySlotSchema = z.object({
  slot: z.number().min(0).max(99),
  item: itemSchema.optional(),
  quantity: z.number().min(0).max(1000).default(1)
});

export const updateInventorySchema = z.object({
  action: z.enum(['add', 'remove', 'move', 'use']),
  slot: z.number().min(0).max(99),
  item: itemSchema.optional(),
  quantity: z.number().min(1).max(1000).default(1),
  targetSlot: z.number().min(0).max(99).optional()
});

// Combat and skills schemas
export const skillSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  level: z.number().min(1).max(100),
  experience: z.number().min(0),
  category: z.enum(['combat', 'magic', 'crafting', 'gathering', 'social'])
});

export const combatActionSchema = z.object({
  action: z.enum(['attack', 'defend', 'cast', 'item', 'flee']),
  targetId: z.string().uuid().optional(),
  skillId: z.string().optional(),
  itemId: z.string().uuid().optional(),
  position: positionSchema.optional()
});

// Character stats and progression
export const characterStatsSchema = z.object({
  strength: z.number().min(1).max(1000),
  dexterity: z.number().min(1).max(1000),
  intelligence: z.number().min(1).max(1000),
  vitality: z.number().min(1).max(1000),
  energy: z.number().min(1).max(1000),
  luck: z.number().min(1).max(1000)
});

export const levelUpSchema = z.object({
  newLevel: z.number().min(2).max(100),
  statAllocations: z.object({
    strength: z.number().min(0).max(10).default(0),
    dexterity: z.number().min(0).max(10).default(0),
    intelligence: z.number().min(0).max(10).default(0),
    vitality: z.number().min(0).max(10).default(0),
    energy: z.number().min(0).max(10).default(0),
    luck: z.number().min(0).max(10).default(0)
  })
}).refine(data => {
  const total = Object.values(data.statAllocations).reduce((sum, val) => sum + val, 0);
  return total <= 5; // Max 5 stat points per level
}, {
  message: "Cannot allocate more than 5 stat points per level",
  path: ["statAllocations"]
});

// Social features schemas
export const friendRequestSchema = z.object({
  targetUsername: z.string().min(3).max(50)
});

export const guildInviteSchema = z.object({
  guildId: z.string().uuid(),
  targetPlayerId: z.string().uuid(),
  message: z.string().max(200).optional()
});

export const chatMessageSchema = z.object({
  channel: z.enum(['global', 'region', 'guild', 'party', 'whisper']),
  message: z.string().min(1).max(500),
  targetId: z.string().uuid().optional() // For whispers
});

// Player preferences and settings
export const playerSettingsSchema = z.object({
  graphics: z.object({
    quality: z.enum(['low', 'medium', 'high', 'ultra']),
    resolution: z.string().regex(/^\d+x\d+$/),
    fullscreen: z.boolean(),
    vsync: z.boolean()
  }).optional(),
  audio: z.object({
    masterVolume: z.number().min(0).max(100),
    musicVolume: z.number().min(0).max(100),
    effectsVolume: z.number().min(0).max(100),
    voiceVolume: z.number().min(0).max(100)
  }).optional(),
  controls: z.object({
    keyBindings: z.record(z.string()),
    mouseSensitivity: z.number().min(0.1).max(10),
    invertMouse: z.boolean()
  }).optional(),
  social: z.object({
    allowFriendRequests: z.boolean(),
    allowGuildInvites: z.boolean(),
    allowPartyInvites: z.boolean(),
    showOnlineStatus: z.boolean()
  }).optional()
});

// Export all schemas
export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;
export type Position = z.infer<typeof positionSchema>;
export type MovePlayerData = z.infer<typeof movePlayerSchema>;
export type Item = z.infer<typeof itemSchema>;
export type InventorySlot = z.infer<typeof inventorySlotSchema>;
export type UpdateInventoryData = z.infer<typeof updateInventorySchema>;
export type Skill = z.infer<typeof skillSchema>;
export type CombatAction = z.infer<typeof combatActionSchema>;
export type CharacterStats = z.infer<typeof characterStatsSchema>;
export type LevelUpData = z.infer<typeof levelUpSchema>;
export type FriendRequestData = z.infer<typeof friendRequestSchema>;
export type GuildInviteData = z.infer<typeof guildInviteSchema>;
export type ChatMessageData = z.infer<typeof chatMessageSchema>;
export type PlayerSettings = z.infer<typeof playerSettingsSchema>;
