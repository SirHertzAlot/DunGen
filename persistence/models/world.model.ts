import { z } from 'zod';

/**
 * World model with validation schemas for regions, events, and world state
 * Handles world data structure, validation, and transformations
 */

// Region model schema
export const RegionModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  minX: z.number(),
  maxX: z.number(),
  minY: z.number(),
  maxY: z.number(),
  serverNode: z.string().min(1),
  playerCount: z.number().int().min(0),
  maxPlayers: z.number().int().min(1),
  status: z.enum(['active', 'maintenance', 'offline']),
  createdAt: z.date()
});

// Game event model schema
export const GameEventModelSchema = z.object({
  id: z.string().uuid(),
  playerId: z.string().uuid().nullable(),
  eventType: z.string().min(1),
  eventData: z.record(z.any()),
  regionId: z.string().nullable(),
  timestamp: z.date()
});

// World event schema (server-wide events)
export const WorldEventSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  type: z.enum(['boss_spawn', 'treasure_hunt', 'pvp_tournament', 'double_exp', 'maintenance', 'celebration']),
  status: z.enum(['scheduled', 'active', 'completed', 'cancelled']),
  startTime: z.date(),
  endTime: z.date(),
  regionId: z.string().nullable(), // null for global events
  participants: z.array(z.string().uuid()),
  rewards: z.array(z.object({
    type: z.enum(['item', 'experience', 'currency', 'achievement']),
    value: z.any(),
    condition: z.string().optional()
  })),
  requirements: z.object({
    minLevel: z.number().int().min(1).optional(),
    maxLevel: z.number().int().max(100).optional(),
    maxParticipants: z.number().int().min(1).optional(),
    guildOnly: z.boolean().optional()
  }).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// Resource node schema
export const ResourceNodeSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['ore', 'wood', 'herb', 'crystal', 'relic']),
  subtype: z.string(), // iron_ore, oak_wood, healing_herb, etc.
  quality: z.enum(['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary']),
  quantity: z.number().int().min(0),
  maxQuantity: z.number().int().min(1),
  regionId: z.string(),
  positionX: z.number(),
  positionY: z.number(),
  positionZ: z.number(),
  respawnTime: z.number().min(0), // in seconds
  lastHarvested: z.date().nullable(),
  isAvailable: z.boolean(),
  harvestRequirements: z.object({
    tool: z.string().optional(),
    skill: z.string().optional(),
    minLevel: z.number().int().min(1).optional()
  }).optional(),
  createdAt: z.date()
});

// NPC model schema
export const NPCModelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.enum(['vendor', 'quest_giver', 'guard', 'monster', 'boss', 'trainer']),
  level: z.number().int().min(1).max(200),
  health: z.number().min(0),
  maxHealth: z.number().min(1),
  regionId: z.string(),
  positionX: z.number(),
  positionY: z.number(),
  positionZ: z.number(),
  behavior: z.enum(['passive', 'aggressive', 'defensive', 'patrol', 'stationary']),
  aggroRange: z.number().min(0),
  moveSpeed: z.number().min(0),
  lootTable: z.array(z.object({
    itemId: z.string(),
    dropChance: z.number().min(0).max(1),
    minQuantity: z.number().int().min(1),
    maxQuantity: z.number().int().min(1)
  })),
  respawnTime: z.number().min(0),
  isAlive: z.boolean(),
  lastDeath: z.date().nullable(),
  createdAt: z.date()
});

// Territory/Guild territory schema
export const TerritorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  ownerId: z.string().uuid(), // Guild or player ID
  ownerType: z.enum(['guild', 'player']),
  regionId: z.string(),
  boundaries: z.object({
    minX: z.number(),
    maxX: z.number(),
    minY: z.number(),
    maxY: z.number()
  }),
  controlPoints: z.array(z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    isActive: z.boolean()
  })),
  defenses: z.array(z.object({
    type: z.enum(['wall', 'tower', 'gate', 'trap']),
    x: z.number(),
    y: z.number(),
    z: z.number(),
    level: z.number().int().min(1).max(10),
    health: z.number().min(0),
    maxHealth: z.number().min(1)
  })),
  claimedAt: z.date(),
  lastConflict: z.date().nullable(),
  isContested: z.boolean(),
  taxSettings: z.object({
    entryFee: z.number().min(0),
    tradeTax: z.number().min(0).max(0.5),
    gatheringTax: z.number().min(0).max(0.5)
  })
});

// Weather system schema
export const WeatherSchema = z.object({
  regionId: z.string(),
  type: z.enum(['clear', 'rain', 'storm', 'snow', 'fog', 'sandstorm', 'blizzard']),
  intensity: z.number().min(0).max(1),
  duration: z.number().min(0), // in seconds
  startTime: z.date(),
  endTime: z.date(),
  effects: z.array(z.object({
    type: z.enum(['visibility', 'movement_speed', 'damage_modifier', 'mana_regen', 'health_regen']),
    value: z.number(),
    target: z.enum(['all', 'players', 'npcs'])
  })),
  isActive: z.boolean()
});

// Market listing schema
export const MarketListingSchema = z.object({
  id: z.string().uuid(),
  sellerId: z.string().uuid(),
  itemId: z.string().uuid(),
  itemName: z.string(),
  quantity: z.number().int().min(1),
  pricePerUnit: z.number().min(0),
  totalPrice: z.number().min(0),
  currency: z.enum(['gold', 'silver', 'gems', 'tokens']),
  regionId: z.string().nullable(), // null for global market
  listedAt: z.date(),
  expiresAt: z.date(),
  isActive: z.boolean(),
  buyoutPrice: z.number().min(0).optional(), // for auctions
  currentBid: z.number().min(0).optional(),
  highestBidderId: z.string().uuid().optional()
});

// Type definitions
export type RegionModel = z.infer<typeof RegionModelSchema>;
export type GameEventModel = z.infer<typeof GameEventModelSchema>;
export type WorldEvent = z.infer<typeof WorldEventSchema>;
export type ResourceNode = z.infer<typeof ResourceNodeSchema>;
export type NPCModel = z.infer<typeof NPCModelSchema>;
export type Territory = z.infer<typeof TerritorySchema>;
export type Weather = z.infer<typeof WeatherSchema>;
export type MarketListing = z.infer<typeof MarketListingSchema>;

// World model utility functions
export class WorldModelUtils {

  /**
   * Validate region data
   */
  static validateRegion(data: any): RegionModel {
    return RegionModelSchema.parse(data);
  }

  /**
   * Validate game event data
   */
  static validateGameEvent(data: any): GameEventModel {
    return GameEventModelSchema.parse(data);
  }

  /**
   * Check if a position is within region boundaries
   */
  static isPositionInRegion(position: { x: number; y: number }, region: RegionModel): boolean {
    return position.x >= region.minX && position.x <= region.maxX &&
           position.y >= region.minY && position.y <= region.maxY;
  }

  /**
   * Calculate region load percentage
   */
  static calculateRegionLoad(region: RegionModel): number {
    return (region.playerCount / region.maxPlayers) * 100;
  }

  /**
   * Check if region is overcrowded
   */
  static isRegionOvercrowded(region: RegionModel, threshold: number = 90): boolean {
    return this.calculateRegionLoad(region) > threshold;
  }

  /**
   * Get adjacent regions based on coordinate system
   */
  static getAdjacentRegionIds(regionId: string): string[] {
    // Assuming region ID format: "region_X_Y"
    const match = regionId.match(/region_(-?\d+)_(-?\d+)/);
    if (!match) return [];

    const x = parseInt(match[1]);
    const y = parseInt(match[2]);
    
    const adjacent: string[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue; // Skip self
        adjacent.push(`region_${x + dx}_${y + dy}`);
      }
    }
    
    return adjacent;
  }

  /**
   * Calculate distance between two regions
   */
  static calculateRegionDistance(region1: RegionModel, region2: RegionModel): number {
    const center1 = {
      x: (region1.minX + region1.maxX) / 2,
      y: (region1.minY + region1.maxY) / 2
    };
    const center2 = {
      x: (region2.minX + region2.maxX) / 2,
      y: (region2.minY + region2.maxY) / 2
    };

    const dx = center1.x - center2.x;
    const dy = center1.y - center2.y;
    
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check if resource node should respawn
   */
  static shouldResourceRespawn(resource: ResourceNode): boolean {
    if (resource.isAvailable || !resource.lastHarvested) return false;
    
    const now = new Date();
    const respawnTime = resource.lastHarvested.getTime() + (resource.respawnTime * 1000);
    
    return now.getTime() >= respawnTime;
  }

  /**
   * Calculate resource harvest yield
   */
  static calculateHarvestYield(resource: ResourceNode, playerLevel: number): number {
    const baseYield = Math.floor(resource.quantity / 2);
    const qualityMultiplier = this.getQualityMultiplier(resource.quality);
    const levelBonus = Math.floor(playerLevel / 10);
    
    return Math.min(resource.quantity, baseYield + levelBonus) * qualityMultiplier;
  }

  /**
   * Get quality multiplier for calculations
   */
  private static getQualityMultiplier(quality: string): number {
    const multipliers = {
      poor: 0.5,
      common: 1.0,
      uncommon: 1.2,
      rare: 1.5,
      epic: 2.0,
      legendary: 3.0
    };
    return multipliers[quality as keyof typeof multipliers] || 1.0;
  }

  /**
   * Check if NPC should respawn
   */
  static shouldNPCRespawn(npc: NPCModel): boolean {
    if (npc.isAlive || !npc.lastDeath) return false;
    
    const now = new Date();
    const respawnTime = npc.lastDeath.getTime() + (npc.respawnTime * 1000);
    
    return now.getTime() >= respawnTime;
  }

  /**
   * Calculate NPC combat power
   */
  static calculateNPCCombatPower(npc: NPCModel): number {
    const levelMultiplier = npc.level * 10;
    const healthMultiplier = npc.maxHealth * 0.1;
    const typeMultiplier = this.getNPCTypeMultiplier(npc.type);
    
    return Math.floor((levelMultiplier + healthMultiplier) * typeMultiplier);
  }

  /**
   * Get NPC type combat multiplier
   */
  private static getNPCTypeMultiplier(type: string): number {
    const multipliers = {
      vendor: 0.5,
      quest_giver: 0.5,
      guard: 1.2,
      monster: 1.0,
      boss: 3.0,
      trainer: 0.8
    };
    return multipliers[type as keyof typeof multipliers] || 1.0;
  }

  /**
   * Check if world event is active
   */
  static isWorldEventActive(event: WorldEvent): boolean {
    const now = new Date();
    return event.status === 'active' && 
           now >= event.startTime && 
           now <= event.endTime;
  }

  /**
   * Check if player can participate in world event
   */
  static canPlayerParticipate(event: WorldEvent, playerLevel: number, guildId?: string): boolean {
    if (!event.requirements) return true;
    
    if (event.requirements.minLevel && playerLevel < event.requirements.minLevel) {
      return false;
    }
    
    if (event.requirements.maxLevel && playerLevel > event.requirements.maxLevel) {
      return false;
    }
    
    if (event.requirements.guildOnly && !guildId) {
      return false;
    }
    
    if (event.requirements.maxParticipants && 
        event.participants.length >= event.requirements.maxParticipants) {
      return false;
    }
    
    return true;
  }

  /**
   * Calculate weather effects on gameplay
   */
  static calculateWeatherEffects(weather: Weather): Record<string, number> {
    const effects: Record<string, number> = {};
    
    weather.effects.forEach(effect => {
      effects[effect.type] = effect.value * weather.intensity;
    });
    
    return effects;
  }

  /**
   * Check if weather is active
   */
  static isWeatherActive(weather: Weather): boolean {
    const now = new Date();
    return weather.isActive && now >= weather.startTime && now <= weather.endTime;
  }

  /**
   * Calculate market listing fees
   */
  static calculateMarketFees(listing: MarketListing): number {
    const baseFee = listing.totalPrice * 0.05; // 5% base fee
    const durationHours = (listing.expiresAt.getTime() - listing.listedAt.getTime()) / (1000 * 60 * 60);
    const durationFee = Math.floor(durationHours) * 10; // 10 gold per hour
    
    return baseFee + durationFee;
  }

  /**
   * Check if market listing is expired
   */
  static isMarketListingExpired(listing: MarketListing): boolean {
    return new Date() > listing.expiresAt;
  }

  /**
   * Calculate territory control strength
   */
  static calculateTerritoryControlStrength(territory: Territory): number {
    const activeControlPoints = territory.controlPoints.filter(cp => cp.isActive).length;
    const totalControlPoints = territory.controlPoints.length;
    const defenseStrength = territory.defenses.reduce((sum, defense) => {
      return sum + (defense.level * (defense.health / defense.maxHealth));
    }, 0);
    
    const controlRatio = totalControlPoints > 0 ? activeControlPoints / totalControlPoints : 0;
    const normalizedDefenseStrength = Math.min(defenseStrength / 100, 1); // Normalize to 0-1
    
    return (controlRatio * 0.7) + (normalizedDefenseStrength * 0.3);
  }

  /**
   * Check if territory is under attack
   */
  static isTerritoryUnderAttack(territory: Territory, timeThresholdMinutes: number = 10): boolean {
    if (!territory.lastConflict) return false;
    
    const now = new Date();
    const threshold = new Date(now.getTime() - (timeThresholdMinutes * 60 * 1000));
    
    return territory.lastConflict > threshold && territory.isContested;
  }

  /**
   * Get region biome based on coordinates (simple implementation)
   */
  static getRegionBiome(region: RegionModel): string {
    const centerX = (region.minX + region.maxX) / 2;
    const centerY = (region.minY + region.maxY) / 2;
    
    // Simple biome determination based on coordinates
    if (Math.abs(centerX) < 500 && Math.abs(centerY) < 500) {
      return 'plains';
    } else if (centerY > 500) {
      return 'tundra';
    } else if (centerY < -500) {
      return 'desert';
    } else if (centerX > 500) {
      return 'forest';
    } else if (centerX < -500) {
      return 'mountains';
    } else {
      return 'wasteland';
    }
  }

  /**
   * Generate random event data for testing
   */
  static generateTestEvent(eventType: string, playerId?: string, regionId?: string): GameEventModel {
    return {
      id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      playerId: playerId || null,
      eventType,
      eventData: {
        testData: true,
        timestamp: Date.now(),
        random: Math.random()
      },
      regionId: regionId || null,
      timestamp: new Date()
    };
  }
}

export default WorldModelUtils;
