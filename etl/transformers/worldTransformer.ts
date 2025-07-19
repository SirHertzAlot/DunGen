import { logger } from '../../logging/logger';

/**
 * World data transformer for ETL pipeline
 * Handles transformation of world-related events and data
 */
export class WorldTransformer {
  async transform(eventType: string, data: any): Promise<any> {
    try {
      switch (eventType) {
        case 'world.region_created':
          return this.transformRegionCreation(data);
        
        case 'world.region_status_changed':
          return this.transformRegionStatusChange(data);
        
        case 'world.weather_changed':
          return this.transformWeatherChange(data);
        
        case 'world.event_started':
        case 'world.event_ended':
          return this.transformWorldEvent(data);
        
        case 'world.resource_spawned':
        case 'world.resource_depleted':
          return this.transformResourceEvent(data);
        
        case 'world.territory_claimed':
        case 'world.territory_lost':
          return this.transformTerritoryEvent(data);
        
        case 'world.dungeon_created':
        case 'world.dungeon_completed':
          return this.transformDungeonEvent(data);
        
        case 'world.market_transaction':
          return this.transformMarketTransaction(data);
        
        case 'world.population_changed':
          return this.transformPopulationChange(data);
        
        default:
          logger.warn('Unknown world event type', { eventType });
          return data;
      }
    } catch (error) {
      logger.error('World transformation failed', { 
        eventType, 
        error: error.message,
        data: JSON.stringify(data).substring(0, 500) 
      });
      throw error;
    }
  }

  private transformRegionCreation(data: any) {
    return {
      regionId: data.regionId,
      regionData: {
        name: data.name,
        bounds: {
          minX: data.minX,
          maxX: data.maxX,
          minY: data.minY,
          maxY: data.maxY
        },
        biome: data.biome,
        difficulty: data.difficulty,
        serverNode: data.serverNode,
        capacity: {
          maxPlayers: data.maxPlayers,
          currentPlayers: 0
        }
      },
      initialization: {
        spawnPoints: this.generateSpawnPoints(data),
        resources: this.generateResources(data),
        npcs: this.generateNPCs(data)
      },
      timestamp: Date.now(),
      metadata: {
        isGenerated: data.isGenerated || false,
        seed: data.seed,
        version: data.version || '1.0'
      }
    };
  }

  private transformRegionStatusChange(data: any) {
    return {
      regionId: data.regionId,
      statusChange: {
        from: data.previousStatus,
        to: data.status,
        reason: data.reason,
        scheduledDuration: data.duration
      },
      impact: {
        affectedPlayers: data.playerCount || 0,
        downtime: data.expectedDowntime || 0,
        alternatives: data.alternativeRegions || []
      },
      timestamp: Date.now(),
      metadata: {
        maintenanceType: data.maintenanceType,
        priority: data.priority || 'normal',
        autoRevert: data.autoRevert || false
      }
    };
  }

  private transformWeatherChange(data: any) {
    return {
      regionId: data.regionId,
      weather: {
        from: {
          type: data.previousWeather,
          intensity: data.previousIntensity
        },
        to: {
          type: data.weatherType,
          intensity: data.intensity,
          duration: data.duration,
          visibility: data.visibility
        }
      },
      effects: {
        gameplay: data.gameplayEffects || [],
        environmental: data.environmentalEffects || [],
        visual: data.visualEffects || []
      },
      forecast: data.forecast || [],
      timestamp: Date.now()
    };
  }

  private transformWorldEvent(data: any) {
    return {
      eventId: data.eventId,
      eventType: data.eventType,
      scope: {
        global: data.isGlobal || false,
        regions: data.affectedRegions || [],
        players: data.affectedPlayers || []
      },
      eventData: {
        name: data.name,
        description: data.description,
        phase: data.phase, // preparation, active, ending, completed
        progress: data.progress || 0,
        objectives: data.objectives || []
      },
      rewards: {
        individual: data.individualRewards || [],
        regional: data.regionalRewards || [],
        global: data.globalRewards || []
      },
      scheduling: {
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        isRecurring: data.isRecurring || false
      },
      timestamp: Date.now()
    };
  }

  private transformResourceEvent(data: any) {
    return {
      resourceId: data.resourceId,
      regionId: data.regionId,
      eventType: data.eventType, // spawned, depleted, respawned
      resource: {
        type: data.resourceType,
        subtype: data.resourceSubtype,
        quality: data.quality,
        quantity: data.quantity,
        rarity: data.rarity
      },
      location: {
        x: data.positionX,
        y: data.positionY,
        z: data.positionZ || 0,
        zone: data.zone
      },
      gathering: {
        difficulty: data.gatheringDifficulty,
        toolRequired: data.toolRequired,
        skillRequired: data.skillRequired,
        timeToGather: data.gatheringTime
      },
      respawn: {
        respawnTime: data.respawnTime,
        nextRespawn: data.nextRespawn,
        conditions: data.respawnConditions || []
      },
      timestamp: Date.now()
    };
  }

  private transformTerritoryEvent(data: any) {
    return {
      territoryId: data.territoryId,
      regionId: data.regionId,
      eventType: data.eventType, // claimed, lost, contested, defended
      ownership: {
        previous: {
          ownerId: data.previousOwnerId,
          ownerType: data.previousOwnerType,
          controlDuration: data.previousControlDuration
        },
        current: {
          ownerId: data.currentOwnerId,
          ownerType: data.currentOwnerType,
          claimedAt: Date.now()
        }
      },
      territory: {
        name: data.territoryName,
        size: data.territorySize,
        value: data.territoryValue,
        strategicImportance: data.strategicImportance,
        defenses: data.defenses || []
      },
      conflict: {
        contestedBy: data.contestedBy || [],
        battleDuration: data.battleDuration,
        casualties: data.casualties || {},
        isWar: data.isWar || false
      },
      timestamp: Date.now()
    };
  }

  private transformDungeonEvent(data: any) {
    return {
      dungeonId: data.dungeonId,
      instanceId: data.instanceId,
      eventType: data.eventType, // created, entered, completed, failed, expired
      dungeon: {
        templateId: data.templateId,
        name: data.dungeonName,
        difficulty: data.difficulty,
        size: data.dungeonSize,
        estimatedDuration: data.estimatedDuration
      },
      party: {
        leaderId: data.partyLeaderId,
        members: data.partyMembers || [],
        averageLevel: data.averageLevel,
        composition: data.partyComposition
      },
      progress: {
        roomsCleared: data.roomsCleared || 0,
        totalRooms: data.totalRooms,
        bossesDefeated: data.bossesDefeated || 0,
        treasuresFound: data.treasuresFound || 0,
        completionPercentage: data.completionPercentage || 0
      },
      rewards: {
        experience: data.experienceReward,
        items: data.itemRewards || [],
        currency: data.currencyReward,
        firstClear: data.isFirstClear || false
      },
      generation: {
        seed: data.generationSeed,
        layout: data.layoutData,
        modifiers: data.modifiers || []
      },
      timestamp: Date.now()
    };
  }

  private transformMarketTransaction(data: any) {
    return {
      transactionId: data.transactionId,
      regionId: data.regionId,
      transactionType: data.transactionType, // sale, purchase, auction_win, trade
      participants: {
        seller: {
          id: data.sellerId,
          type: data.sellerType, // player, npc, system
          reputation: data.sellerReputation
        },
        buyer: {
          id: data.buyerId,
          type: data.buyerType,
          reputation: data.buyerReputation
        }
      },
      item: {
        id: data.itemId,
        name: data.itemName,
        type: data.itemType,
        rarity: data.itemRarity,
        level: data.itemLevel,
        quantity: data.quantity,
        condition: data.itemCondition
      },
      pricing: {
        listPrice: data.listPrice,
        salePrice: data.salePrice,
        taxes: data.taxes || 0,
        fees: data.fees || 0,
        currency: data.currency
      },
      market: {
        marketType: data.marketType, // regional, global, guild, private
        category: data.category,
        subcategory: data.subcategory
      },
      economics: {
        priceHistory: data.priceHistory || [],
        marketTrend: data.marketTrend,
        supplyDemand: data.supplyDemand
      },
      timestamp: Date.now()
    };
  }

  private transformPopulationChange(data: any) {
    return {
      regionId: data.regionId,
      populationChange: {
        previous: data.previousPopulation,
        current: data.currentPopulation,
        delta: data.currentPopulation - data.previousPopulation,
        percentage: data.percentageChange
      },
      breakdown: {
        players: data.playerCount || 0,
        npcs: data.npcCount || 0,
        temporary: data.temporaryCount || 0
      },
      capacity: {
        maximum: data.maxCapacity,
        soft: data.softCapacity,
        utilization: (data.currentPopulation / data.maxCapacity) * 100
      },
      trends: {
        hourly: data.hourlyTrend || [],
        daily: data.dailyTrend || [],
        peak: data.peakPopulation,
        valley: data.valleyPopulation
      },
      factors: {
        events: data.activeEvents || [],
        weather: data.weatherInfluence,
        conflicts: data.activeConflicts || []
      },
      timestamp: Date.now()
    };
  }

  // Utility methods for region creation
  private generateSpawnPoints(data: any): any[] {
    const spawnPoints = [];
    const bounds = {
      minX: data.minX,
      maxX: data.maxX,
      minY: data.minY,
      maxY: data.maxY
    };

    // Generate player spawn points
    for (let i = 0; i < 5; i++) {
      spawnPoints.push({
        type: 'player',
        position: this.getRandomPosition(bounds),
        isActive: true,
        conditions: ['not_in_combat', 'safe_zone']
      });
    }

    // Generate resource spawn points based on biome
    const resourceTypes = this.getResourceTypesByBiome(data.biome);
    resourceTypes.forEach(resourceType => {
      for (let i = 0; i < 3; i++) {
        spawnPoints.push({
          type: 'resource',
          resourceType,
          position: this.getRandomPosition(bounds),
          respawnTime: 300, // 5 minutes
          isActive: true
        });
      }
    });

    return spawnPoints;
  }

  private generateResources(data: any): any[] {
    const resources = [];
    const resourceTypes = this.getResourceTypesByBiome(data.biome);
    
    resourceTypes.forEach(type => {
      resources.push({
        type,
        density: this.getResourceDensity(type, data.biome),
        respawnTime: this.getResourceRespawnTime(type),
        quality: this.getResourceQuality(data.difficulty)
      });
    });

    return resources;
  }

  private generateNPCs(data: any): any[] {
    const npcs = [];
    const npcTypes = this.getNPCTypesByBiome(data.biome, data.difficulty);
    
    npcTypes.forEach(type => {
      npcs.push({
        type,
        level: this.getNPCLevel(data.difficulty),
        count: this.getNPCCount(type, data.difficulty),
        behavior: this.getNPCBehavior(type)
      });
    });

    return npcs;
  }

  // Helper methods
  private getRandomPosition(bounds: any): any {
    return {
      x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
      y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
      z: 0
    };
  }

  private getResourceTypesByBiome(biome: string): string[] {
    const biomeResources: { [key: string]: string[] } = {
      forest: ['wood', 'herbs', 'berries', 'wildlife'],
      desert: ['sand', 'crystals', 'rare_gems', 'cacti'],
      mountain: ['ore', 'stone', 'gems', 'snow'],
      ocean: ['fish', 'pearls', 'coral', 'seaweed'],
      plains: ['grass', 'flowers', 'small_game', 'clay'],
      swamp: ['mud', 'mushrooms', 'rare_plants', 'amphibians'],
      tundra: ['ice', 'fur', 'rare_metals', 'hardy_plants'],
      volcano: ['lava_rock', 'sulfur', 'rare_crystals', 'ash']
    };
    
    return biomeResources[biome] || ['generic'];
  }

  private getResourceDensity(type: string, biome: string): number {
    // Returns density between 0 and 1
    const baseDensity = 0.3;
    const biomeModifiers: { [key: string]: number } = {
      forest: 0.8,
      desert: 0.2,
      mountain: 0.6,
      ocean: 0.7,
      plains: 0.9,
      swamp: 0.5,
      tundra: 0.3,
      volcano: 0.4
    };
    
    return Math.min(1, baseDensity * (biomeModifiers[biome] || 1));
  }

  private getResourceRespawnTime(type: string): number {
    const baseTimes: { [key: string]: number } = {
      wood: 600,
      herbs: 300,
      ore: 1200,
      gems: 3600,
      fish: 180,
      wildlife: 900
    };
    
    return baseTimes[type] || 600; // Default 10 minutes
  }

  private getResourceQuality(difficulty: string): string {
    const qualityMaps: { [key: string]: string } = {
      peaceful: 'common',
      easy: 'common',
      normal: 'uncommon',
      hard: 'rare',
      extreme: 'epic'
    };
    
    return qualityMaps[difficulty] || 'common';
  }

  private getNPCTypesByBiome(biome: string, difficulty: string): string[] {
    const biomeNPCs: { [key: string]: string[] } = {
      forest: ['woodland_creature', 'bandit', 'druid', 'bear'],
      desert: ['scorpion', 'nomad', 'sand_elemental', 'vulture'],
      mountain: ['golem', 'dwarf_miner', 'griffin', 'mountain_lion'],
      ocean: ['sea_serpent', 'pirate', 'mermaid', 'shark'],
      plains: ['horse', 'merchant', 'wolf', 'farmer'],
      swamp: ['swamp_creature', 'witch', 'alligator', 'will_o_wisp'],
      tundra: ['ice_elemental', 'polar_bear', 'viking', 'wolf'],
      volcano: ['fire_elemental', 'dragon', 'salamander', 'phoenix']
    };
    
    return biomeNPCs[biome] || ['generic_creature'];
  }

  private getNPCLevel(difficulty: string): number {
    const levelRanges: { [key: string]: [number, number] } = {
      peaceful: [1, 5],
      easy: [5, 15],
      normal: [15, 35],
      hard: [35, 65],
      extreme: [65, 100]
    };
    
    const [min, max] = levelRanges[difficulty] || [1, 10];
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  private getNPCCount(type: string, difficulty: string): number {
    const baseCounts: { [key: string]: number } = {
      creature: 10,
      humanoid: 5,
      elemental: 3,
      boss: 1
    };
    
    const difficultyMultiplier: { [key: string]: number } = {
      peaceful: 0.5,
      easy: 0.8,
      normal: 1.0,
      hard: 1.5,
      extreme: 2.0
    };
    
    const baseCount = baseCounts[this.getNPCCategory(type)] || 5;
    const multiplier = difficultyMultiplier[difficulty] || 1;
    
    return Math.ceil(baseCount * multiplier);
  }

  private getNPCCategory(type: string): string {
    const categories: { [key: string]: string } = {
      dragon: 'boss',
      phoenix: 'boss',
      elemental: 'elemental',
      golem: 'elemental',
      bandit: 'humanoid',
      merchant: 'humanoid',
      druid: 'humanoid'
    };
    
    return categories[type] || 'creature';
  }

  private getNPCBehavior(type: string): string {
    const behaviors: { [key: string]: string } = {
      dragon: 'territorial_aggressive',
      merchant: 'friendly_trader',
      bandit: 'hostile_opportunist',
      elemental: 'neutral_defensive',
      creature: 'animal_instinct'
    };
    
    return behaviors[type] || 'neutral';
  }
}

export const worldTransformer = new WorldTransformer();
