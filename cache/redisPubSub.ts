import Redis from "ioredis";
import { logger } from "../logthis.logger";
import { v4 as uuidv4 } from "uuid";
import { IEventBus } from "./IEventBus";
import type { GameEventMessage } from "./IEventBus";

class RedisEventBus implements IEventBus {
  private publisher: Redis;
  private subscriber: Redis;
  private handlers: Map<string, (message: GameEventMessage) => void>;

  constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };

    this.publisher = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);
    this.handlers = new Map();

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.publisher.on("connect", () => {
      this.logger.info("Redis publisher connected", {
        service: "RedisEventBus",
      });
    });

    this.subscriber.on("connect", () => {
      this.logger.info("Redis subscriber connected", {
        service: "RedisEventBus",
      });
    });

    this.publisher.on("error", (error) => {
      this.logger.error("Redis publisher error", error, {
        service: "RedisEventBus",
      });
    });

    this.subscriber.on("error", (error) => {
      this.logger.error("Redis subscriber error", error, {
        service: "RedisEventBus",
      });
    });

    this.subscriber.on("message", (channel, message) => {
      try {
        const parsedMessage: GameEventMessage = JSON.parse(message);
        const handler = this.handlers.get(channel);
        if (handler) {
          handler(parsedMessage);
        }
      } catch (error) {
        this.logger.error("Error processing Redis message", error as Error, {
          service: "RedisEventBus",
          channel,
          message,
        });
      }
    });
  }

  async publish(channel: string, message: GameEventMessage): Promise<void> {
    try {
      const messageWithId = {
        ...message,
        id: message.id || uuidv4(),
        timestamp: message.timestamp || Date.now(),
      };

      await this.publisher.publish(channel, JSON.stringify(messageWithId));
      this.logger.debug("Message published to Redis", {
        service: "RedisEventBus",
        channel,
        messageId: messageWithId.id,
        type: messageWithId.type,
      });
    } catch (error) {
      this.logger.error("Error publishing to Redis", error as Error, {
        service: "RedisEventBus",
        channel,
        messageType: message.type,
      });
      throw error;
    }
  }

  async subscribe(
    channel: string,
    handler: (message: GameEventMessage) => void,
  ): Promise<void> {
    try {
      await this.subscriber.subscribe(channel);
      this.handlers.set(channel, handler);
      this.logger.info("Subscribed to Redis channel", {
        service: "RedisEventBus",
        channel,
      });
    } catch (error) {
      this.logger.error("Error subscribing to Redis channel", error as Error, {
        service: "RedisEventBus",
        channel,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.publisher.disconnect(),
      this.subscriber.disconnect(),
    ]);
    this.logger.info("Redis connections closed", { service: "RedisEventBus" });
  }
}

// Legacy interface - now using InfrastructureManager with fallback
export { GameEventMessage };

class LegacyEventBusWrapper {
  private eventBus: any = null;
  private initialized: boolean = false;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const { infrastructureManager } = await import(
        "../config/InfrastructureManager"
      );
      await infrastructureManager.initialize();
      this.eventBus = infrastructureManager.getComponent("eventBus");
      this.initialized = true;
    } catch (error) {
      console.error(
        "Failed to initialize event bus via infrastructure manager, using fallback:",
        error,
      );

      // Fallback to in-memory implementation
      const { MemoryEventBus } = await import("./interfaces/MemoryEventBus");
      this.eventBus = new MemoryEventBus();
      await this.eventBus.initialize({
        type: "memory",
        channels: [
          "unification.events",
          "persistence.player_updates",
          "world.player_events",
        ],
        metadata: {
          instanceId: "fallback-eventbus",
          region: "local",
          environment: "development",
        },
      });
      this.initialized = true;
    }
  }

  async publish(channel: string, message: GameEventMessage): Promise<void> {
    await this.initPromise;
    if (!this.eventBus) {
      console.warn("EventBus not available, skipping publish");
      return;
    }
    return this.eventBus.publish(channel, message);
  }

  async subscribe(
    channel: string,
    handler: (message: GameEventMessage) => void,
  ): Promise<void> {
    await this.initPromise;
    if (!this.eventBus) {
      console.warn("EventBus not available, skipping subscribe");
      return;
    }
    return this.eventBus.subscribe(channel, handler);
  }

  async disconnect(): Promise<void> {
    await this.initPromise;
    if (!this.eventBus) {
      return;
    }
    return this.eventBus.disconnect();
  }
}

export const eventBus = new LegacyEventBusWrapper();
