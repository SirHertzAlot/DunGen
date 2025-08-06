import { Entity, PlayerCharacterEntity, NPCEntity, EntityFactory } from './entities/Entity';
import { ISystem } from './systems/ISystem';
import { CombatSystem } from './systems/CombatSystem';
import { MovementSystem } from './systems/MovementSystem';
import { logger } from '../../logging/logger';
import { v4 as uuidv4 } from 'uuid';

// Unity message types for communication
export interface UnityMessage {
  messageType: 'entityUpdate' | 'systemCommand' | 'gameEvent';
  messageId: string;
  timestamp: number;
  data: any;
}

export interface EntityUpdateMessage extends UnityMessage {
  messageType: 'entityUpdate';
  data: {
    entities: any[];
    deletedEntities: string[];
  };
}

export interface SystemCommandMessage extends UnityMessage {
  messageType: 'systemCommand';
  data: {
    command: string;
    parameters: any;
  };
}

export interface GameEventMessage extends UnityMessage {
  messageType: 'gameEvent';
  data: {
    eventType: string;
    playerId?: string;
    entityId?: string;
    eventData: any;
  };
}

// High-performance ECS manager for Unity integration
export class ECSManager {
  private static instance: ECSManager;
  private entities: Map<string, Entity> = new Map();
  private systems: Map<string, ISystem> = new Map();
  private lastUpdate: number = 0;
  private readonly TARGET_FPS = 60;
  private readonly FRAME_TIME = 1000 / this.TARGET_FPS;
  private updateInterval: NodeJS.Timeout | null = null;
  private messageQueue: UnityMessage[] = [];

  // Performance tracking
  private performanceStats = {
    frameTime: 0,
    entityCount: 0,
    systemUpdateTimes: new Map<string, number>(),
    lastStatsUpdate: 0
  };

  private constructor() {
    this.initializeSystems();
  }

  public static getInstance(): ECSManager {
    if (!ECSManager.instance) {
      ECSManager.instance = new ECSManager();
    }
    return ECSManager.instance;
  }

  private initializeSystems(): void {
    // Initialize core systems for D&D MMORPG
    this.systems.set('Movement', new MovementSystem());
    this.systems.set('Combat', new CombatSystem());
    
    logger.info('ECS systems initialized', {
      service: 'ECSManager',
      systemCount: this.systems.size,
      systems: Array.from(this.systems.keys())
    });
  }

  // Start the ECS update loop
  public async start(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.lastUpdate = Date.now();
    
    this.updateInterval = setInterval(async () => {
      await this.update();
    }, this.FRAME_TIME);

    logger.info('ECS Manager started', {
      service: 'ECSManager',
      targetFPS: this.TARGET_FPS,
      frameTime: this.FRAME_TIME
    });
  }

  // Stop the ECS update loop
  public async stop(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Cleanup systems
    for (const [name, system] of this.systems) {
      if (system.cleanup) {
        await system.cleanup();
      }
    }

    logger.info('ECS Manager stopped', {
      service: 'ECSManager'
    });
  }

  // Main ECS update loop
  private async update(): Promise<void> {
    const updateStart = Date.now();
    const deltaTime = (updateStart - this.lastUpdate) / 1000; // Convert to seconds

    try {
      // Process Unity messages first
      await this.processMessageQueue();

      // Update all systems
      for (const [systemName, system] of this.systems) {
        if (system.enabled !== false) {
          const systemStart = Date.now();
          await system.update(this.entities, deltaTime);
          const systemTime = Date.now() - systemStart;
          this.performanceStats.systemUpdateTimes.set(systemName, systemTime);
        }
      }

      // Send updates to Unity
      await this.sendUpdatesToUnity();

      // Update performance stats
      this.updatePerformanceStats(updateStart);

    } catch (error) {
      logger.error('Error in ECS update loop', error as Error, {
        service: 'ECSManager',
        deltaTime,
        entityCount: this.entities.size
      });
    }

    this.lastUpdate = updateStart;
  }

  // Process messages from Unity
  private async processMessageQueue(): Promise<void> {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      await this.processUnityMessage(message);
    }
  }

  private async processUnityMessage(message: UnityMessage): Promise<void> {
    try {
      switch (message.messageType) {
        case 'entityUpdate':
          await this.handleEntityUpdate(message as EntityUpdateMessage);
          break;
        case 'systemCommand':
          await this.handleSystemCommand(message as SystemCommandMessage);
          break;
        case 'gameEvent':
          await this.handleGameEvent(message as GameEventMessage);
          break;
      }
    } catch (error) {
      logger.error('Error processing Unity message', error as Error, {
        service: 'ECSManager',
        messageType: message.messageType,
        messageId: message.messageId
      });
    }
  }

  private async handleEntityUpdate(message: EntityUpdateMessage): Promise<void> {
    const { entities: entityUpdates, deletedEntities } = message.data;

    // Remove deleted entities
    for (const entityId of deletedEntities) {
      this.entities.delete(entityId);
    }

    // Update existing entities
    for (const entityData of entityUpdates) {
      const entity = this.entities.get(entityData.id);
      if (entity) {
        entity.deserialize(entityData);
      }
    }
  }

  private async handleSystemCommand(message: SystemCommandMessage): Promise<void> {
    const { command, parameters } = message.data;

    switch (command) {
      case 'createPlayerCharacter':
        await this.createPlayerCharacter(parameters);
        break;
      case 'createNPC':
        await this.createNPC(parameters);
        break;
      case 'initiateAttack':
        await this.initiateAttack(parameters);
        break;
      case 'moveEntity':
        await this.moveEntity(parameters);
        break;
      case 'castSpell':
        await this.castSpell(parameters);
        break;
    }
  }

  private async handleGameEvent(message: GameEventMessage): Promise<void> {
    const { eventType, playerId, entityId, eventData } = message.data;
    
    logger.info('Game event received', {
      service: 'ECSManager',
      eventType,
      playerId,
      entityId
    });

    // Broadcast to relevant systems
    // TODO: Implement event system for system communication
  }

  // Send entity updates to Unity
  private async sendUpdatesToUnity(): Promise<void> {
    const dirtyEntities: any[] = [];
    const deletedEntities: string[] = [];

    for (const [id, entity] of this.entities) {
      if (!entity.active) {
        deletedEntities.push(id);
        this.entities.delete(id);
      } else if (entity.isDirty()) {
        dirtyEntities.push(entity.serialize());
        entity.markClean();
      }
    }

    if (dirtyEntities.length > 0 || deletedEntities.length > 0) {
      const updateMessage: EntityUpdateMessage = {
        messageType: 'entityUpdate',
        messageId: uuidv4(),
        timestamp: Date.now(),
        data: {
          entities: dirtyEntities,
          deletedEntities
        }
      };

      // TODO: Send to Unity via WebSocket or HTTP
      // For now, just log the update
      logger.debug('Sending entity updates to Unity', {
        service: 'ECSManager',
        entitiesUpdated: dirtyEntities.length,
        entitiesDeleted: deletedEntities.length
      });
    }
  }

  // Entity management methods
  public async createPlayerCharacter(params: {
    playerId: string;
    characterName: string;
    position: { x: number; y: number; z: number };
    characterClass: string;
    race: string;
  }): Promise<string> {
    const entity = EntityFactory.createPlayerCharacter(
      params.playerId,
      params.characterName,
      params.position
    );

    this.entities.set(entity.id, entity);

    logger.info('Player character created', {
      service: 'ECSManager',
      entityId: entity.id,
      playerId: params.playerId,
      characterName: params.characterName
    });

    return entity.id;
  }

  public async createNPC(params: {
    npcType: string;
    challengeRating: number;
    position: { x: number; y: number; z: number };
    faction?: string;
  }): Promise<string> {
    const entity = EntityFactory.createNPC(
      params.npcType,
      params.challengeRating,
      params.position
    );

    if (params.faction) {
      (entity as NPCEntity).faction = params.faction;
    }

    this.entities.set(entity.id, entity);

    logger.info('NPC created', {
      service: 'ECSManager',
      entityId: entity.id,
      npcType: params.npcType,
      challengeRating: params.challengeRating
    });

    return entity.id;
  }

  // Combat action methods
  public async initiateAttack(params: {
    attackerId: string;
    targetId: string;
    weaponId?: string;
  }): Promise<boolean> {
    const combatSystem = this.systems.get('Combat') as CombatSystem;
    if (!combatSystem) return false;

    const action = {
      id: uuidv4(),
      traceId: uuidv4(),
      actorId: params.attackerId,
      targetId: params.targetId,
      actionType: 'attack' as const,
      timestamp: Date.now(),
      data: { weaponId: params.weaponId }
    };

    combatSystem.queueAction(action);
    return true;
  }

  public async moveEntity(params: {
    entityId: string;
    targetX: number;
    targetY: number;
    targetZ: number;
  }): Promise<boolean> {
    const movementSystem = this.systems.get('Movement') as MovementSystem;
    const entity = this.entities.get(params.entityId);
    
    if (!movementSystem || !entity) return false;

    return movementSystem.setMovementTarget(
      entity,
      params.targetX,
      params.targetY,
      params.targetZ
    );
  }

  public async castSpell(params: {
    casterId: string;
    spellId: string;
    targetId?: string;
    targetPosition?: { x: number; y: number; z: number };
  }): Promise<boolean> {
    const combatSystem = this.systems.get('Combat') as CombatSystem;
    if (!combatSystem) return false;

    const action = {
      id: uuidv4(),
      traceId: uuidv4(),
      actorId: params.casterId,
      targetId: params.targetId,
      actionType: 'spell' as const,
      timestamp: Date.now(),
      data: {
        spellId: params.spellId,
        targetPosition: params.targetPosition
      }
    };

    combatSystem.queueAction(action);
    return true;
  }

  // Message handling for Unity communication
  public queueUnityMessage(message: UnityMessage): void {
    this.messageQueue.push(message);
  }

  // Query methods
  public getEntity(entityId: string): Entity | undefined {
    return this.entities.get(entityId);
  }

  public getEntitiesByType(entityType: string): Entity[] {
    return Array.from(this.entities.values()).filter(entity => entity.type === entityType);
  }

  public getEntitiesInRadius(
    center: { x: number; y: number; z: number },
    radius: number
  ): Entity[] {
    const result: Entity[] = [];

    for (const entity of this.entities.values()) {
      const transform = entity.getComponent('Transform');
      if (!transform) continue;

      const distance = this.calculateDistance(center, (transform as any).position);
      if (distance <= radius) {
        result.push(entity);
      }
    }

    return result;
  }

  // Performance monitoring
  private updatePerformanceStats(updateStart: number): void {
    this.performanceStats.frameTime = Date.now() - updateStart;
    this.performanceStats.entityCount = this.entities.size;

    // Log performance stats every 5 seconds
    const now = Date.now();
    if (now - this.performanceStats.lastStatsUpdate > 5000) {
      logger.debug('ECS Performance Stats', {
        service: 'ECSManager',
        frameTime: this.performanceStats.frameTime,
        entityCount: this.performanceStats.entityCount,
        systemTimes: Object.fromEntries(this.performanceStats.systemUpdateTimes)
      });
      this.performanceStats.lastStatsUpdate = now;
    }
  }

  public getPerformanceStats(): any {
    return { ...this.performanceStats };
  }

  // Get active combats for API
  public getActiveCombats(): any[] {
    const combatSystem = this.systems.get('Combat') as CombatSystem;
    return combatSystem ? combatSystem.getActiveCombats() : [];
  }

  // Utility methods
  private calculateDistance(pos1: {x: number, y: number, z: number}, pos2: {x: number, y: number, z: number}): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Cleanup
  public async destroy(): Promise<void> {
    await this.stop();
    this.entities.clear();
    this.systems.clear();
    this.messageQueue = [];
  }
}

// Singleton instance
export const ecsManager = ECSManager.getInstance();