import logger from "../../logging/logger";
import { Player, UpdatePlayer } from "@shared/schema";

/**
 * Player data transformer for ETL pipeline
 * Handles transformation of player-related events and data
 */
export class PlayerTransformer {
  logger = logger({ serviceName: "PlayerTransformer" });

  async transform(eventType: string, data: any): Promise<any> {
    try {
      switch (eventType) {
        case "player.created":
          return this.transformPlayerCreation(data);

        case "player.updated":
          return this.transformPlayerUpdate(data);

        case "player.moved":
          return this.transformPlayerMovement(data);

        case "player.combat":
          return this.transformCombatEvent(data);

        case "player.inventory_changed":
          return this.transformInventoryChange(data);

        case "player.level_up":
          return this.transformLevelUp(data);

        case "player.guild_joined":
          return this.transformGuildEvent(data);

        case "player.quest_completed":
          return this.transformQuestCompletion(data);

        case "player.trade":
          return this.transformTradeEvent(data);

        case "player.logged_in":
        case "player.logged_out":
          return this.transformSessionEvent(data);

        default:
          logger.warn("Unknown player event type", { eventType });
          return data; // Return unchanged if no transformation needed
      }
    } catch (error) {
      logger.error("Player transformation failed", {
        eventType,
        error: error.message,
        data: JSON.stringify(data).substring(0, 500),
      });
      throw error;
    }
  }

  private transformPlayerCreation(data: any) {
    return {
      playerId: data.playerId,
      username: data.username,
      email: data.email,
      startingRegion: data.regionId || "region_0_0",
      initialStats: {
        level: 1,
        experience: 0,
        health: 100,
        mana: 100,
        position: {
          x: data.positionX || 0,
          y: data.positionY || 0,
          z: data.positionZ || 0,
        },
      },
      metadata: {
        createdAt: Date.now(),
        source: "player_creation",
      },
    };
  }

  private transformPlayerUpdate(data: any) {
    const transformed: any = {
      playerId: data.playerId,
      changes: {},
      timestamp: Date.now(),
    };

    // Transform individual field updates
    if (data.level !== undefined) {
      transformed.changes.level = {
        old: data.previousLevel,
        new: data.level,
      };
    }

    if (data.experience !== undefined) {
      transformed.changes.experience = {
        old: data.previousExperience,
        new: data.experience,
        gained: data.experience - (data.previousExperience || 0),
      };
    }

    if (data.health !== undefined) {
      transformed.changes.health = {
        old: data.previousHealth,
        new: data.health,
        delta: data.health - (data.previousHealth || 100),
      };
    }

    if (data.mana !== undefined) {
      transformed.changes.mana = {
        old: data.previousMana,
        new: data.mana,
        delta: data.mana - (data.previousMana || 100),
      };
    }

    return transformed;
  }

  private transformPlayerMovement(data: any) {
    return {
      playerId: data.playerId,
      movement: {
        from: {
          x: data.fromX || data.previousX,
          y: data.fromY || data.previousY,
          z: data.fromZ || data.previousZ || 0,
        },
        to: {
          x: data.toX || data.positionX,
          y: data.toY || data.positionY,
          z: data.toZ || data.positionZ || 0,
        },
        distance: this.calculateDistance(
          { x: data.fromX, y: data.fromY, z: data.fromZ || 0 },
          { x: data.toX, y: data.toY, z: data.toZ || 0 },
        ),
        speed: data.speed || 5,
        regionChange: data.previousRegion !== data.regionId,
      },
      regionId: data.regionId,
      previousRegion: data.previousRegion,
      timestamp: data.timestamp || Date.now(),
      metadata: {
        isValidMovement: this.validateMovement(data),
        movementType: this.determineMovementType(data),
      },
    };
  }

  private transformCombatEvent(data: any) {
    return {
      eventId: data.eventId || `combat_${Date.now()}`,
      combatType: data.combatType || "pvp", // pvp, pve, guild_war
      attacker: {
        id: data.attackerId,
        type: data.attackerType || "player",
        level: data.attackerLevel,
        position: data.attackerPosition,
      },
      target: {
        id: data.targetId,
        type: data.targetType || "player",
        level: data.targetLevel,
        position: data.targetPosition,
      },
      action: {
        type: data.actionType, // attack, skill, spell, item
        skillId: data.skillId,
        damage: data.damage,
        isCritical: data.isCritical || false,
        effects: data.effects || [],
      },
      result: {
        hit: data.hit !== false,
        damage: data.actualDamage || data.damage,
        remainingHealth: data.targetRemainingHealth,
        isDead: data.targetDead || false,
      },
      regionId: data.regionId,
      timestamp: data.timestamp || Date.now(),
    };
  }

  private transformInventoryChange(data: any) {
    return {
      playerId: data.playerId,
      changeType: data.changeType, // add, remove, move, use, trade
      item: {
        id: data.itemId,
        name: data.itemName,
        type: data.itemType,
        quantity: data.quantity || 1,
        rarity: data.rarity,
        level: data.itemLevel,
      },
      slot: {
        from: data.fromSlot,
        to: data.toSlot,
      },
      source: data.source, // loot, trade, purchase, craft, quest
      metadata: {
        totalValue: data.totalValue,
        stackSize: data.stackSize,
        durability: data.durability,
      },
      timestamp: Date.now(),
    };
  }

  private transformLevelUp(data: any) {
    return {
      playerId: data.playerId,
      levelChange: {
        from: data.previousLevel,
        to: data.newLevel,
        experienceGained: data.experienceGained,
      },
      statAllocations: data.statAllocations || {},
      rewards: {
        skillPoints: data.skillPointsGained || 0,
        attributePoints: data.attributePointsGained || 0,
        unlocks: data.newUnlocks || [],
      },
      milestone: this.checkLevelMilestone(data.newLevel),
      timestamp: Date.now(),
    };
  }

  private transformGuildEvent(data: any) {
    return {
      playerId: data.playerId,
      guildId: data.guildId,
      eventType: data.eventType, // joined, left, promoted, demoted, kicked
      role: data.role,
      previousRole: data.previousRole,
      guildInfo: {
        name: data.guildName,
        level: data.guildLevel,
        memberCount: data.memberCount,
      },
      timestamp: Date.now(),
    };
  }

  private transformQuestCompletion(data: any) {
    return {
      playerId: data.playerId,
      quest: {
        id: data.questId,
        name: data.questName,
        type: data.questType,
        difficulty: data.difficulty,
      },
      completion: {
        completedAt: Date.now(),
        timeSpent: data.timeSpent,
        attempts: data.attempts || 1,
      },
      rewards: {
        experience: data.experienceReward,
        items: data.itemRewards || [],
        currency: data.currencyReward,
        reputation: data.reputationReward,
      },
      chain: {
        isChainQuest: data.isChainQuest || false,
        nextQuestId: data.nextQuestId,
        chainProgress: data.chainProgress,
      },
    };
  }

  private transformTradeEvent(data: any) {
    return {
      tradeId: data.tradeId,
      participants: [
        {
          playerId: data.player1Id,
          items: data.player1Items || [],
          currency: data.player1Currency || 0,
        },
        {
          playerId: data.player2Id,
          items: data.player2Items || [],
          currency: data.player2Currency || 0,
        },
      ],
      status: data.status, // initiated, accepted, completed, cancelled
      tradeTax: data.tradeTax || 0,
      regionId: data.regionId,
      timestamp: Date.now(),
    };
  }

  private transformSessionEvent(data: any) {
    return {
      playerId: data.playerId,
      sessionId: data.sessionId,
      eventType: data.eventType, // logged_in, logged_out
      sessionData: {
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        region: data.region,
        serverNode: data.serverNode,
      },
      duration: data.duration, // For logout events
      timestamp: Date.now(),
    };
  }

  // Utility methods
  private calculateDistance(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private validateMovement(data: any): boolean {
    // Basic movement validation
    const distance = this.calculateDistance(
      { x: data.fromX, y: data.fromY, z: data.fromZ || 0 },
      { x: data.toX, y: data.toY, z: data.toZ || 0 },
    );

    const timeSpent =
      (data.timestamp || Date.now()) - (data.previousTimestamp || Date.now());
    const maxSpeed = 50; // Units per second
    const maxDistance = (timeSpent / 1000) * maxSpeed;

    return distance <= maxDistance;
  }

  private determineMovementType(data: any): string {
    const distance = this.calculateDistance(
      { x: data.fromX, y: data.fromY, z: data.fromZ || 0 },
      { x: data.toX, y: data.toY, z: data.toZ || 0 },
    );

    if (distance < 1) return "micro";
    if (distance < 10) return "walking";
    if (distance < 50) return "running";
    if (distance < 200) return "mount";
    return "teleport";
  }

  private checkLevelMilestone(level: number): string | null {
    const milestones = [5, 10, 25, 50, 75, 100];
    return milestones.includes(level) ? `milestone_${level}` : null;
  }
}

export const playerTransformer = new PlayerTransformer();
