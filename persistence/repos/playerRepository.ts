import { IStorage } from "../../server/storage";
import { Player, InsertPlayer, UpdatePlayer } from "../../shared/schema";
import logger from "../../logging/logger";
import { eventBus, GameEventMessage } from "../../cache/redisPubSub";
import { v4 as uuidv4 } from "uuid";

const log = logger({ serviceName: "PlayerRepository" });

// Repository interface for DRY principle
export interface IPlayerRepository {
  create(playerData: InsertPlayer): Promise<Player>;
  findById(id: string): Promise<Player | undefined>;
  findByUsername(username: string): Promise<Player | undefined>;
  update(id: string, updates: UpdatePlayer): Promise<Player | undefined>;
  findInRegion(regionId: string): Promise<Player[]>;
  setOnlineStatus(playerId: string, isOnline: boolean): Promise<void>;
}

class PlayerRepository implements IPlayerRepository {
  constructor(private storage: IStorage) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for player update events from unification layer
    eventBus.subscribe(
      "persistence.player_updates",
      this.handleUnificationUpdate.bind(this),
    );
  }

  async create(playerData: InsertPlayer): Promise<Player> {
    const requestId = uuidv4();

    log.info("Creating new player", {
      service: "PlayerRepository",
      requestId,
      username: playerData.username,
    });

    try {
      const player = await this.storage.createPlayer(playerData);

      // Publish player created event
      const event: GameEventMessage = {
        id: uuidv4(),
        type: "player.created",
        playerId: player.id,
        regionId: player.regionId,
        data: { player },
        timestamp: Date.now(),
      };

      await eventBus.publish("world.player_events", event);

      log.info("Player created successfully", {
        service: "PlayerRepository",
        requestId,
        playerId: player.id,
        username: player.username,
      });

      return player;
    } catch (error) {
      log.error("Failed to create player", error as Error, {
        service: "PlayerRepository",
        requestId,
        username: playerData.username,
      });
      throw error;
    }
  }

  async findById(id: string): Promise<Player | undefined> {
    const requestId = uuidv4();

    log.debug("Finding player by ID", {
      service: "PlayerRepository",
      requestId,
      playerId: id,
    });

    try {
      return await this.storage.getPlayer(id);
    } catch (error) {
      log.error("Failed to find player by ID", error as Error, {
        service: "PlayerRepository",
        requestId,
        playerId: id,
      });
      throw error;
    }
  }

  async findByUsername(username: string): Promise<Player | undefined> {
    const requestId = uuidv4();

    log.debug("Finding player by username", {
      service: "PlayerRepository",
      requestId,
      username,
    });

    try {
      return await this.storage.getPlayerByUsername(username);
    } catch (error) {
      log.error("Failed to find player by username", error as Error, {
        service: "PlayerRepository",
        requestId,
        username,
      });
      throw error;
    }
  }

  async update(id: string, updates: UpdatePlayer): Promise<Player | undefined> {
    const requestId = uuidv4();

    log.info("Updating player", {
      service: "PlayerRepository",
      requestId,
      playerId: id,
      updates: Object.keys(updates),
    });

    try {
      const updatedPlayer = await this.storage.updatePlayer(id, updates);

      if (updatedPlayer) {
        // Publish player updated event
        const event: GameEventMessage = {
          id: uuidv4(),
          type: "player.updated",
          playerId: id,
          regionId: updatedPlayer.regionId,
          data: { updates, player: updatedPlayer },
          timestamp: Date.now(),
        };

        await eventBus.publish("world.player_events", event);

        log.info("Player updated successfully", {
          service: "PlayerRepository",
          requestId,
          playerId: id,
        });
      }

      return updatedPlayer;
    } catch (error) {
      log.error("Failed to update player", error as Error, {
        service: "PlayerRepository",
        requestId,
        playerId: id,
      });
      throw error;
    }
  }

  async findInRegion(regionId: string): Promise<Player[]> {
    const requestId = uuidv4();

    log.debug("Finding players in region", {
      service: "PlayerRepository",
      requestId,
      regionId,
    });

    try {
      return await this.storage.getPlayersInRegion(regionId);
    } catch (error) {
      log.error("Failed to find players in region", error as Error, {
        service: "PlayerRepository",
        requestId,
        regionId,
      });
      throw error;
    }
  }

  async setOnlineStatus(playerId: string, isOnline: boolean): Promise<void> {
    const requestId = uuidv4();

    log.info("Setting player online status", {
      service: "PlayerRepository",
      requestId,
      playerId,
      isOnline,
    });

    try {
      await this.storage.updatePlayer(playerId, {
        isOnline,
        lastActive: new Date(),
      });

      // Publish online status change event
      const event: GameEventMessage = {
        id: uuidv4(),
        type: isOnline ? "player.online" : "player.offline",
        playerId,
        data: { isOnline },
        timestamp: Date.now(),
      };

      await eventBus.publish("world.player_events", event);

      log.info("Player online status updated", {
        service: "PlayerRepository",
        requestId,
        playerId,
        isOnline,
      });
    } catch (error) {
      log.error("Failed to set player online status", error as Error, {
        service: "PlayerRepository",
        requestId,
        playerId,
      });
      throw error;
    }
  }

  // Handle updates from unification layer (authoritative state changes)
  private async handleUnificationUpdate(message: GameEventMessage): void {
    const requestId = uuidv4();

    log.debug("Handling unification update", {
      service: "PlayerRepository",
      requestId,
      messageId: message.id,
      type: message.type,
      playerId: message.playerId,
    });

    try {
      if (message.type === "unification.player_state" && message.playerId) {
        const { playerState } = message.data;

        await this.storage.updatePlayer(message.playerId, {
          positionX: playerState.position?.x,
          positionY: playerState.position?.y,
          positionZ: playerState.position?.z,
          regionId: playerState.regionId,
          health: playerState.health,
          mana: playerState.mana,
          level: playerState.level,
          experience: playerState.experience,
        });

        log.info("Player state synchronized from unification layer", {
          service: "PlayerRepository",
          requestId,
          playerId: message.playerId,
        });
      }
    } catch (error) {
      log.error("Failed to handle unification update", error as Error, {
        service: "PlayerRepository",
        requestId,
        messageId: message.id,
        playerId: message.playerId,
      });
    }
  }
}

export { PlayerRepository };
