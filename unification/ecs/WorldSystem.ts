import { logger } from '../../logging/logger';
import { eventBus, GameEventMessage } from '../../cache/redisPubSub';
import { v4 as uuidv4 } from 'uuid';

// Entity Component System interfaces
export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface PlayerState {
  id: string;
  position: Position;
  health: number;
  mana: number;
  level: number;
  experience: number;
  regionId: string;
  isOnline: boolean;
}

export interface RegionState {
  id: string;
  players: Map<string, PlayerState>;
  lastUpdate: number;
  eventQueue: GameEventMessage[];
}

// ECS System interface for DRY principle
export interface IWorldSystem {
  processPlayerAction(playerId: string, action: any): Promise<void>;
  updatePlayerState(playerId: string, state: Partial<PlayerState>): Promise<void>;
  processRegionTick(regionId: string): Promise<void>;
  getRegionState(regionId: string): RegionState | undefined;
}

class WorldSystem implements IWorldSystem {
  private regions: Map<string, RegionState>;
  private tickInterval: number = 50; // 20 TPS
  private regionTickTimers: Map<string, NodeJS.Timeout>;

  constructor() {
    this.regions = new Map();
    this.regionTickTimers = new Map();
    this.setupEventListeners();
    this.initializeDefaultRegions();
  }

  private setupEventListeners(): void {
    // Listen for player events from ETL layer
    eventBus.subscribe('unification.events', this.handlePlayerEvent.bind(this));
    eventBus.subscribe('unification.player_events', this.handlePlayerJoin.bind(this));
    eventBus.subscribe('unification.region_events', this.handleRegionEvent.bind(this));
  }

  private initializeDefaultRegions(): void {
    const defaultRegions = [
      'region_0_0',
      'region_0_1', 
      'region_1_0'
    ];

    for (const regionId of defaultRegions) {
      this.createRegion(regionId);
      this.startRegionTick(regionId);
    }

    logger.info('Default regions initialized', {
      service: 'WorldSystem',
      regions: defaultRegions
    });
  }

  private createRegion(regionId: string): void {
    const regionState: RegionState = {
      id: regionId,
      players: new Map(),
      lastUpdate: Date.now(),
      eventQueue: []
    };

    this.regions.set(regionId, regionState);

    logger.info('Region created', {
      service: 'WorldSystem',
      regionId
    });
  }

  private startRegionTick(regionId: string): void {
    const timer = setInterval(async () => {
      await this.processRegionTick(regionId);
    }, this.tickInterval);

    this.regionTickTimers.set(regionId, timer);

    logger.debug('Region tick started', {
      service: 'WorldSystem',
      regionId,
      tickRate: 1000 / this.tickInterval
    });
  }

  // Process individual player actions (authoritative)
  async processPlayerAction(playerId: string, action: any): Promise<void> {
    const requestId = uuidv4();

    logger.debug('Processing player action', {
      service: 'WorldSystem',
      requestId,
      playerId,
      actionType: action.type
    });

    try {
      const playerRegion = this.findPlayerRegion(playerId);
      if (!playerRegion) {
        logger.warn('Player not found in any region', {
          service: 'WorldSystem',
          requestId,
          playerId
        });
        return;
      }

      const region = this.regions.get(playerRegion);
      const playerState = region?.players.get(playerId);

      if (!region || !playerState) {
        logger.warn('Player state not found', {
          service: 'WorldSystem',
          requestId,
          playerId,
          regionId: playerRegion
        });
        return;
      }

      // Process action based on type
      switch (action.type) {
        case 'player.move':
          await this.processMovement(playerState, action.data);
          break;
        case 'player.combat':
          await this.processCombat(playerState, action.data);
          break;
        case 'player.chat':
          await this.processChat(playerState, action.data);
          break;
        default:
          logger.warn('Unknown action type', {
            service: 'WorldSystem',
            requestId,
            actionType: action.type
          });
      }

      // Update last update timestamp
      region.lastUpdate = Date.now();

    } catch (error) {
      logger.error('Failed to process player action', error as Error, {
        service: 'WorldSystem',
        requestId,
        playerId,
        actionType: action.type
      });
    }
  }

  // Update player state in ECS
  async updatePlayerState(playerId: string, updates: Partial<PlayerState>): Promise<void> {
    const requestId = uuidv4();

    logger.debug('Updating player state', {
      service: 'WorldSystem',
      requestId,
      playerId,
      updates: Object.keys(updates)
    });

    const regionId = this.findPlayerRegion(playerId);
    if (!regionId) {
      logger.warn('Player not found for state update', {
        service: 'WorldSystem',
        requestId,
        playerId
      });
      return;
    }

    const region = this.regions.get(regionId);
    const currentState = region?.players.get(playerId);

    if (!region || !currentState) {
      logger.warn('Player state not found for update', {
        service: 'WorldSystem',
        requestId,
        playerId,
        regionId
      });
      return;
    }

    // Update player state
    const newState = { ...currentState, ...updates };
    region.players.set(playerId, newState);

    logger.info('Player state updated', {
      service: 'WorldSystem',
      requestId,
      playerId,
      regionId
    });
  }

  // Process region tick (authoritative game simulation)
  async processRegionTick(regionId: string): Promise<void> {
    const region = this.regions.get(regionId);
    if (!region) return;

    try {
      // Process queued events
      while (region.eventQueue.length > 0) {
        const event = region.eventQueue.shift()!;
        await this.processQueuedEvent(region, event);
      }

      // Send state updates back to persistence layer
      await this.sendStateUpdates(region);

      region.lastUpdate = Date.now();

    } catch (error) {
      logger.error('Error during region tick', error as Error, {
        service: 'WorldSystem',
        regionId
      });
    }
  }

  // Get region state for monitoring/debugging
  getRegionState(regionId: string): RegionState | undefined {
    return this.regions.get(regionId);
  }

  // Helper methods for specific action processing
  private async processMovement(playerState: PlayerState, moveData: any): Promise<void> {
    const { toX, toY, toZ } = moveData;

    // Validate movement (basic bounds checking)
    if (this.isValidPosition(toX, toY, toZ, playerState.regionId)) {
      playerState.position = { x: toX, y: toY, z: toZ };

      logger.debug('Player moved', {
        service: 'WorldSystem',
        playerId: playerState.id,
        position: playerState.position
      });
    } else {
      logger.warn('Invalid movement attempt', {
        service: 'WorldSystem',
        playerId: playerState.id,
        attemptedPosition: { x: toX, y: toY, z: toZ }
      });
    }
  }

  private async processCombat(playerState: PlayerState, combatData: any): Promise<void> {
    const { targetId, damage } = combatData;

    // Find target player
    const targetRegion = this.findPlayerRegion(targetId);
    if (!targetRegion) {
      logger.warn('Combat target not found', {
        service: 'WorldSystem',
        attackerId: playerState.id,
        targetId
      });
      return;
    }

    const region = this.regions.get(targetRegion);
    const targetState = region?.players.get(targetId);

    if (!targetState) {
      logger.warn('Target player state not found', {
        service: 'WorldSystem',
        attackerId: playerState.id,
        targetId
      });
      return;
    }

    // Apply damage
    targetState.health = Math.max(0, targetState.health - damage);

    logger.info('Combat processed', {
      service: 'WorldSystem',
      attackerId: playerState.id,
      targetId,
      damage,
      targetHealth: targetState.health
    });
  }

  private async processChat(playerState: PlayerState, chatData: any): Promise<void> {
    const { channel, message } = chatData;

    // Broadcast chat message to appropriate channel
    const chatEvent: GameEventMessage = {
      id: uuidv4(),
      type: 'world.chat',
      playerId: playerState.id,
      regionId: playerState.regionId,
      data: { channel, message },
      timestamp: Date.now()
    };

    await eventBus.publish('world.chat_events', chatEvent);

    logger.debug('Chat processed', {
      service: 'WorldSystem',
      playerId: playerState.id,
      channel
    });
  }

  private async processQueuedEvent(region: RegionState, event: GameEventMessage): Promise<void> {
    logger.debug('Processing queued event', {
      service: 'WorldSystem',
      regionId: region.id,
      eventType: event.type,
      eventId: event.id
    });

    // Process different event types
    switch (event.type) {
      case 'player.move':
        if (event.playerId) {
          await this.processPlayerAction(event.playerId, event);
        }
        break;
      // Add more event types as needed
    }
  }

  private async sendStateUpdates(region: RegionState): Promise<void> {
    // Send state updates for all players in region back to persistence layer
    for (const [playerId, playerState] of region.players) {
      const stateUpdate: GameEventMessage = {
        id: uuidv4(),
        type: 'unification.player_state',
        playerId,
        regionId: region.id,
        data: { playerState },
        timestamp: Date.now()
      };

      await eventBus.publish('persistence.player_updates', stateUpdate);
    }
  }

  private findPlayerRegion(playerId: string): string | undefined {
    for (const [regionId, region] of this.regions) {
      if (region.players.has(playerId)) {
        return regionId;
      }
    }
    return undefined;
  }

  private isValidPosition(x: number, y: number, z: number, regionId: string): boolean {
    // Basic bounds checking - in real implementation, check against region boundaries
    return x >= -1000 && x <= 1000 && y >= -1000 && y <= 1000 && z >= -100 && z <= 100;
  }

  // Event handlers
  private async handlePlayerEvent(event: GameEventMessage): Promise<void> {
    const region = this.regions.get(event.regionId || 'region_0_0');
    if (region) {
      region.eventQueue.push(event);
    }
  }

  private async handlePlayerJoin(event: GameEventMessage): Promise<void> {
    if (event.type === 'player.online' && event.playerId) {
      const { player } = event.data;
      const regionId = player.regionId || 'region_0_0';

      // Add player to region
      const region = this.regions.get(regionId);
      if (region) {
        const playerState: PlayerState = {
          id: event.playerId,
          position: { x: player.positionX, y: player.positionY, z: player.positionZ },
          health: player.health,
          mana: player.mana,
          level: player.level,
          experience: player.experience,
          regionId,
          isOnline: true
        };

        region.players.set(event.playerId, playerState);

        logger.info('Player joined region', {
          service: 'WorldSystem',
          playerId: event.playerId,
          regionId
        });
      }
    }
  }

  private async handleRegionEvent(event: GameEventMessage): Promise<void> {
    logger.debug('Handling region event', {
      service: 'WorldSystem',
      eventType: event.type,
      regionId: event.regionId
    });
    // Handle region-specific events
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    // Clear all region tick timers
    for (const timer of this.regionTickTimers.values()) {
      clearInterval(timer);
    }

    logger.info('World system shutdown complete', { service: 'WorldSystem' });
  }
}

export const worldSystem = new WorldSystem();