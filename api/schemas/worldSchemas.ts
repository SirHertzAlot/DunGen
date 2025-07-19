import { z } from 'zod';

// World region and zone schemas
export const coordinatesSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().default(0)
});

export const boundingBoxSchema = z.object({
  minX: z.number(),
  maxX: z.number(),
  minY: z.number(),
  maxY: z.number(),
  minZ: z.number().default(0),
  maxZ: z.number().default(100)
});

export const createRegionSchema = z.object({
  name: z.string().min(1).max(100),
  bounds: boundingBoxSchema,
  serverNode: z.string().min(1).max(50),
  maxPlayers: z.number().min(1).max(1000).default(100),
  biome: z.enum(['forest', 'desert', 'mountain', 'ocean', 'plains', 'swamp', 'tundra', 'volcano']),
  difficulty: z.enum(['peaceful', 'easy', 'normal', 'hard', 'extreme']),
  resources: z.array(z.object({
    type: z.string(),
    density: z.number().min(0).max(1),
    respawnTime: z.number().min(0) // in seconds
  })).default([])
});

export const updateRegionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['active', 'maintenance', 'offline']).optional(),
  maxPlayers: z.number().min(1).max(1000).optional(),
  difficulty: z.enum(['peaceful', 'easy', 'normal', 'hard', 'extreme']).optional()
});

// World events and phenomena
export const worldEventSchema = z.object({
  type: z.enum(['weather', 'invasion', 'boss_spawn', 'resource_bonus', 'pvp_event', 'quest_event']),
  regionId: z.string().uuid().optional(), // Global if not specified
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  startTime: z.number(), // Unix timestamp
  duration: z.number().min(0), // in seconds
  parameters: z.record(z.any()).default({}),
  rewards: z.array(z.object({
    type: z.enum(['item', 'experience', 'currency', 'skill_points']),
    value: z.any(),
    condition: z.string().optional()
  })).default([])
});

// Resource and object placement
export const spawnPointSchema = z.object({
  position: coordinatesSchema,
  type: z.enum(['player', 'npc', 'resource', 'treasure', 'portal']),
  regionId: z.string().uuid(),
  isActive: z.boolean().default(true),
  respawnTime: z.number().min(0).default(0),
  conditions: z.array(z.string()).default([]), // Spawn conditions
  metadata: z.record(z.any()).default({})
});

export const worldObjectSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['building', 'decoration', 'interactive', 'barrier', 'portal']),
  position: coordinatesSchema,
  rotation: z.object({
    x: z.number().default(0),
    y: z.number().default(0),
    z: z.number().default(0)
  }),
  scale: z.object({
    x: z.number().default(1),
    y: z.number().default(1),
    z: z.number().default(1)
  }),
  modelId: z.string(),
  regionId: z.string().uuid(),
  properties: z.record(z.any()).default({}),
  isCollidable: z.boolean().default(true),
  isInteractable: z.boolean().default(false)
});

// Weather and environmental systems
export const weatherSchema = z.object({
  type: z.enum(['clear', 'rain', 'storm', 'snow', 'fog', 'sandstorm', 'volcanic']),
  intensity: z.number().min(0).max(1),
  duration: z.number().min(0), // in seconds, 0 = permanent until changed
  visibility: z.number().min(0).max(1).default(1),
  effects: z.array(z.object({
    type: z.enum(['movement_speed', 'visibility', 'damage', 'mana_regen', 'health_regen']),
    modifier: z.number(),
    target: z.enum(['all', 'players', 'npcs', 'specific_class'])
  })).default([])
});

export const dayNightCycleSchema = z.object({
  cycleDuration: z.number().min(60).max(86400), // 1 minute to 24 hours in seconds
  currentTime: z.number().min(0).max(1), // 0 = midnight, 0.5 = noon, 1 = midnight
  seasonMultiplier: z.number().min(0.5).max(2).default(1),
  effects: z.object({
    npcBehavior: z.boolean().default(true),
    spawnRates: z.boolean().default(true),
    visualEffects: z.boolean().default(true)
  })
});

// Territory and guild system
export const territorySchema = z.object({
  name: z.string().min(1).max(100),
  ownerId: z.string().uuid(), // Guild or player ID
  ownerType: z.enum(['guild', 'player', 'system']),
  bounds: boundingBoxSchema,
  regionId: z.string().uuid(),
  controlPoints: z.array(coordinatesSchema),
  defenses: z.array(z.object({
    type: z.enum(['wall', 'tower', 'gate', 'trap']),
    position: coordinatesSchema,
    level: z.number().min(1).max(10),
    health: z.number().min(0)
  })).default([]),
  taxes: z.object({
    playerEntry: z.number().min(0).default(0),
    tradeCommission: z.number().min(0).max(0.5).default(0),
    resourceGathering: z.number().min(0).max(0.5).default(0)
  }),
  permissions: z.object({
    allowEntry: z.enum(['all', 'allies', 'members', 'none']).default('all'),
    allowPvP: z.boolean().default(false),
    allowBuilding: z.enum(['all', 'allies', 'members', 'none']).default('members'),
    allowResourceGathering: z.enum(['all', 'allies', 'members', 'none']).default('members')
  })
});

// Dynamic content and procedural generation
export const dungeonInstanceSchema = z.object({
  templateId: z.string(),
  instanceId: z.string().uuid(),
  difficulty: z.enum(['easy', 'normal', 'hard', 'nightmare']),
  partyId: z.string().uuid().optional(),
  maxPlayers: z.number().min(1).max(10),
  timeLimit: z.number().min(0).default(3600), // seconds
  generatedSeed: z.number(),
  layout: z.array(z.object({
    roomId: z.string(),
    position: coordinatesSchema,
    connections: z.array(z.string()),
    roomType: z.enum(['entrance', 'combat', 'treasure', 'boss', 'puzzle', 'exit']),
    spawns: z.array(spawnPointSchema)
  })),
  objectives: z.array(z.object({
    id: z.string(),
    type: z.enum(['kill_all', 'collect_item', 'reach_exit', 'survive_time', 'solve_puzzle']),
    description: z.string(),
    isCompleted: z.boolean().default(false),
    progress: z.number().min(0).default(0),
    target: z.number().min(1)
  }))
});

// Market and economic systems
export const marketListingSchema = z.object({
  sellerId: z.string().uuid(),
  item: z.object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.string(),
    rarity: z.string(),
    level: z.number(),
    stats: z.record(z.number()),
    quantity: z.number().min(1)
  }),
  price: z.number().min(0),
  currency: z.enum(['gold', 'silver', 'gems', 'tokens']),
  expiresAt: z.number(), // Unix timestamp
  regionId: z.string().uuid().optional(), // Global market if not specified
  buyoutPrice: z.number().min(0).optional() // For auction-style listings
});

// Export all schemas and types
export type Coordinates = z.infer<typeof coordinatesSchema>;
export type BoundingBox = z.infer<typeof boundingBoxSchema>;
export type CreateRegionData = z.infer<typeof createRegionSchema>;
export type UpdateRegionData = z.infer<typeof updateRegionSchema>;
export type WorldEvent = z.infer<typeof worldEventSchema>;
export type SpawnPoint = z.infer<typeof spawnPointSchema>;
export type WorldObject = z.infer<typeof worldObjectSchema>;
export type Weather = z.infer<typeof weatherSchema>;
export type DayNightCycle = z.infer<typeof dayNightCycleSchema>;
export type Territory = z.infer<typeof territorySchema>;
export type DungeonInstance = z.infer<typeof dungeonInstanceSchema>;
export type MarketListing = z.infer<typeof marketListingSchema>;
