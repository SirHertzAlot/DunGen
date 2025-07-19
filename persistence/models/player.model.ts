import { z } from 'zod';

/**
 * Player model with validation schemas and transformations
 * Handles player data structure, validation, and serialization
 */

// Base player validation schema
export const PlayerModelSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email(),
  passwordHash: z.string().min(1),
  level: z.number().int().min(1).max(100),
  experience: z.number().min(0),
  health: z.number().min(0).max(1000),
  mana: z.number().min(0).max(1000),
  positionX: z.number(),
  positionY: z.number(),
  positionZ: z.number(),
  regionId: z.string().min(1),
  inventory: z.record(z.any()),
  stats: z.record(z.number()),
  guild: z.string().nullable(),
  lastActive: z.date(),
  isOnline: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// Player stats schema
export const PlayerStatsSchema = z.object({
  strength: z.number().int().min(1).max(1000),
  dexterity: z.number().int().min(1).max(1000),
  intelligence: z.number().int().min(1).max(1000),
  vitality: z.number().int().min(1).max(1000),
  energy: z.number().int().min(1).max(1000),
  luck: z.number().int().min(1).max(1000)
});

// Inventory item schema
export const InventoryItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.enum(['weapon', 'armor', 'consumable', 'material', 'quest', 'misc']),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary', 'artifact']),
  level: z.number().int().min(1).max(100),
  quantity: z.number().int().min(1).max(1000),
  durability: z.number().min(0).max(100).optional(),
  stats: z.record(z.number()).optional(),
  enchantments: z.array(z.object({
    id: z.string(),
    name: z.string(),
    effect: z.string(),
    value: z.number()
  })).optional(),
  socketedGems: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    effect: z.string(),
    value: z.number()
  })).optional()
});

// Inventory schema
export const PlayerInventorySchema = z.object({
  slots: z.record(z.string(), InventoryItemSchema.optional()),
  maxSlots: z.number().int().min(1).max(200),
  currency: z.object({
    gold: z.number().min(0),
    silver: z.number().min(0),
    gems: z.number().min(0),
    tokens: z.number().min(0)
  })
});

// Player position schema
export const PlayerPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  regionId: z.string(),
  facing: z.number().min(0).max(360).optional() // Direction in degrees
});

// Player profile schema (public information)
export const PlayerProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  level: z.number(),
  guild: z.string().nullable(),
  achievements: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    unlockedAt: z.date(),
    rarity: z.enum(['common', 'rare', 'epic', 'legendary'])
  })),
  stats: z.object({
    totalPlayTime: z.number().min(0),
    monstersKilled: z.number().min(0),
    playersKilled: z.number().min(0),
    deaths: z.number().min(0),
    questsCompleted: z.number().min(0),
    itemsCrafted: z.number().min(0),
    distanceTraveled: z.number().min(0)
  }),
  preferences: z.object({
    showOnlineStatus: z.boolean(),
    allowFriendRequests: z.boolean(),
    allowGuildInvites: z.boolean(),
    showAchievements: z.boolean()
  })
});

// Player creation schema
export const CreatePlayerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  startingRegion: z.string().optional().default('region_0_0'),
  characterClass: z.enum(['warrior', 'mage', 'archer', 'rogue', 'cleric']).optional().default('warrior')
});

// Player update schema
export const UpdatePlayerSchema = z.object({
  level: z.number().int().min(1).max(100).optional(),
  experience: z.number().min(0).optional(),
  health: z.number().min(0).max(1000).optional(),
  mana: z.number().min(0).max(1000).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  positionZ: z.number().optional(),
  regionId: z.string().optional(),
  inventory: z.record(z.any()).optional(),
  stats: z.record(z.number()).optional(),
  guild: z.string().nullable().optional(),
  isOnline: z.boolean().optional()
});

// Player search filters
export const PlayerSearchSchema = z.object({
  username: z.string().optional(),
  level: z.object({
    min: z.number().int().min(1).optional(),
    max: z.number().int().max(100).optional()
  }).optional(),
  regionId: z.string().optional(),
  guild: z.string().optional(),
  isOnline: z.boolean().optional(),
  lastActive: z.object({
    since: z.date().optional(),
    until: z.date().optional()
  }).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['username', 'level', 'experience', 'lastActive']).default('level'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

// Type definitions
export type PlayerModel = z.infer<typeof PlayerModelSchema>;
export type PlayerStats = z.infer<typeof PlayerStatsSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type PlayerInventory = z.infer<typeof PlayerInventorySchema>;
export type PlayerPosition = z.infer<typeof PlayerPositionSchema>;
export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;
export type CreatePlayer = z.infer<typeof CreatePlayerSchema>;
export type UpdatePlayer = z.infer<typeof UpdatePlayerSchema>;
export type PlayerSearch = z.infer<typeof PlayerSearchSchema>;

// Model utility functions
export class PlayerModelUtils {
  
  /**
   * Validate player data against schema
   */
  static validatePlayer(data: any): PlayerModel {
    return PlayerModelSchema.parse(data);
  }

  /**
   * Validate player stats
   */
  static validateStats(stats: any): PlayerStats {
    return PlayerStatsSchema.parse(stats);
  }

  /**
   * Validate inventory data
   */
  static validateInventory(inventory: any): PlayerInventory {
    return PlayerInventorySchema.parse(inventory);
  }

  /**
   * Calculate total stat points
   */
  static calculateTotalStats(stats: PlayerStats): number {
    return stats.strength + stats.dexterity + stats.intelligence + 
           stats.vitality + stats.energy + stats.luck;
  }

  /**
   * Calculate player combat power
   */
  static calculateCombatPower(player: PlayerModel): number {
    const stats = this.validateStats(player.stats);
    const levelBonus = player.level * 10;
    const statBonus = this.calculateTotalStats(stats) * 2;
    
    return levelBonus + statBonus;
  }

  /**
   * Calculate experience required for next level
   */
  static getExperienceForLevel(level: number): number {
    return Math.floor(100 * Math.pow(level, 1.5) + 50 * level);
  }

  /**
   * Calculate experience to next level
   */
  static getExperienceToNextLevel(player: PlayerModel): number {
    const currentLevelExp = this.getExperienceForLevel(player.level);
    const nextLevelExp = this.getExperienceForLevel(player.level + 1);
    return nextLevelExp - player.experience;
  }

  /**
   * Get player's maximum health based on level and stats
   */
  static getMaxHealth(player: PlayerModel): number {
    const stats = this.validateStats(player.stats);
    const baseHealth = 100;
    const levelBonus = player.level * 5;
    const vitalityBonus = stats.vitality * 2;
    
    return baseHealth + levelBonus + vitalityBonus;
  }

  /**
   * Get player's maximum mana based on level and stats
   */
  static getMaxMana(player: PlayerModel): number {
    const stats = this.validateStats(player.stats);
    const baseMana = 100;
    const levelBonus = player.level * 3;
    const energyBonus = stats.energy * 1.5;
    const intelligenceBonus = stats.intelligence * 1;
    
    return Math.floor(baseMana + levelBonus + energyBonus + intelligenceBonus);
  }

  /**
   * Sanitize player data for public view
   */
  static toPublicProfile(player: PlayerModel): PlayerProfile {
    return {
      id: player.id,
      username: player.username,
      level: player.level,
      guild: player.guild,
      achievements: [], // Would be loaded separately
      stats: {
        totalPlayTime: 0, // Would be calculated
        monstersKilled: 0,
        playersKilled: 0,
        deaths: 0,
        questsCompleted: 0,
        itemsCrafted: 0,
        distanceTraveled: 0
      },
      preferences: {
        showOnlineStatus: true,
        allowFriendRequests: true,
        allowGuildInvites: true,
        showAchievements: true
      }
    };
  }

  /**
   * Calculate inventory weight
   */
  static calculateInventoryWeight(inventory: PlayerInventory): number {
    let totalWeight = 0;
    
    Object.values(inventory.slots).forEach(item => {
      if (item) {
        // Base weight calculation (could be more sophisticated)
        const itemWeight = this.getItemWeight(item);
        totalWeight += itemWeight * item.quantity;
      }
    });
    
    return totalWeight;
  }

  /**
   * Get item weight based on type and rarity
   */
  private static getItemWeight(item: InventoryItem): number {
    const typeWeights = {
      weapon: 5,
      armor: 8,
      consumable: 0.5,
      material: 1,
      quest: 0,
      misc: 1
    };
    
    const rarityMultipliers = {
      common: 1,
      uncommon: 1.2,
      rare: 1.5,
      epic: 2,
      legendary: 3,
      artifact: 5
    };
    
    const baseWeight = typeWeights[item.type] || 1;
    const multiplier = rarityMultipliers[item.rarity] || 1;
    
    return baseWeight * multiplier;
  }

  /**
   * Validate player position is within valid bounds
   */
  static validatePosition(position: PlayerPosition): boolean {
    // Basic bounds checking
    const maxCoordinate = 10000;
    const minCoordinate = -10000;
    
    return position.x >= minCoordinate && position.x <= maxCoordinate &&
           position.y >= minCoordinate && position.y <= maxCoordinate &&
           position.z >= minCoordinate && position.z <= maxCoordinate;
  }

  /**
   * Calculate distance between two positions
   */
  static calculateDistance(pos1: PlayerPosition, pos2: PlayerPosition): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Check if player can level up
   */
  static canLevelUp(player: PlayerModel): boolean {
    const expRequired = this.getExperienceForLevel(player.level + 1);
    return player.experience >= expRequired && player.level < 100;
  }

  /**
   * Apply level up to player
   */
  static applyLevelUp(player: PlayerModel): PlayerModel {
    if (!this.canLevelUp(player)) {
      return player;
    }

    const expRequired = this.getExperienceForLevel(player.level + 1);
    const remainingExp = player.experience - expRequired;
    
    return {
      ...player,
      level: player.level + 1,
      experience: remainingExp,
      health: this.getMaxHealth({ ...player, level: player.level + 1 }),
      mana: this.getMaxMana({ ...player, level: player.level + 1 }),
      updatedAt: new Date()
    };
  }
}

export default PlayerModelUtils;
