import Redis from "ioredis";
import { EventEmitter } from "events";
import logger from "../../logging/logger";

/**
 * Event Bus for real-time pub/sub messaging across the MMORPG backend
 * Handles high-throughput event distribution with channel management
 */

export class EventBus extends EventEmitter {
  private logger: ILogger;
  private publisher: Redis;
  private subscriber: Redis;
  private isInitialized = false;
  private channels: Set<string> = new Set();
  private stats = {
    published: 0,
    received: 0,
    errors: 0,
    activeChannels: 0,
  };

  constructor(logger: ILogger) {
    super();
    this.logger = logger;
    this.setMaxListeners(1000); // Allow many listeners for high concurrency

    this.publisher = new Redis(
      process.env.REDIS_URL || "redis://localhost:6379",
      {
        lazyConnect: true,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
      },
    );

    this.subscriber = new Redis(
      process.env.REDIS_URL || "redis://localhost:6379",
      {
        lazyConnect: true,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
      },
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Publisher events
    this.publisher.on("connect", () => {
      this.logger.info("EventBus publisher connected to Redis");
    });

    this.publisher.on("error", (error) => {
      this.logger.error("EventBus publisher error", { error: error.message });
      this.stats.errors++;
    });

    // Subscriber events
    this.subscriber.on("connect", () => {
      this.logger.info("EventBus subscriber connected to Redis");
    });

    this.subscriber.on("error", (error) => {
      this.logger.error("EventBus subscriber error", { error: error.message });
      this.stats.errors++;
    });

    this.subscriber.on("message", (channel, message) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on("pmessage", (pattern, channel, message) => {
      this.handleMessage(channel, message, pattern);
    });
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.publisher.connect();
      await this.subscriber.connect();

      // Subscribe to core channels
      await this.subscribeToChannel("unity.*");
      await this.subscribeToChannel("player.*");
      await this.subscribeToChannel("world.*");
      await this.subscribeToChannel("combat.*");
      await this.subscribeToChannel("chat.*");
      await this.subscribeToChannel("system.*");

      this.isInitialized = true;
      this.logger.info("EventBus initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize EventBus", {
        error: error.message,
      });
      throw error;
    }
  }

  async publish(channel: string, data: any): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("EventBus not initialized");
    }

    try {
      const message = JSON.stringify({
        data,
        timestamp: Date.now(),
        source: "eventbus",
      });

      const result = await this.publisher.publish(channel, message);
      this.stats.published++;

      this.logger.debug("Event published", {
        channel,
        subscribers: result,
        dataType: typeof data,
      });

      // Also emit locally for any local listeners
      this.emit(channel, data);
    } catch (error) {
      this.logger.error("Failed to publish event", {
        channel,
        error: error.message,
      });
      this.stats.errors++;
      throw error;
    }
  }

  async subscribe(
    channel: string,
    handler: (data: any, channel: string) => void,
  ): Promise<void> {
    await this.subscribeToChannel(channel);
    this.on(channel, handler);

    this.logger.debug("Subscribed to channel", { channel });
  }

  async subscribePattern(
    pattern: string,
    handler: (data: any, channel: string, pattern: string) => void,
  ): Promise<void> {
    await this.subscriber.psubscribe(pattern);
    this.channels.add(pattern);
    this.stats.activeChannels = this.channels.size;

    this.on(`pattern:${pattern}`, handler);

    this.logger.debug("Subscribed to pattern", { pattern });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
    this.channels.delete(channel);
    this.stats.activeChannels = this.channels.size;
    this.removeAllListeners(channel);

    this.logger.debug("Unsubscribed from channel", { channel });
  }

  private async subscribeToChannel(channel: string): Promise<void> {
    if (channel.includes("*")) {
      await this.subscriber.psubscribe(channel);
    } else {
      await this.subscriber.subscribe(channel);
    }

    this.channels.add(channel);
    this.stats.activeChannels = this.channels.size;
  }

  private handleMessage(
    channel: string,
    message: string,
    pattern?: string,
  ): void {
    try {
      const parsed = JSON.parse(message);
      this.stats.received++;

      this.logger.debug("Event received", {
        channel,
        pattern,
        timestamp: parsed.timestamp,
        source: parsed.source,
      });

      if (pattern) {
        this.emit(`pattern:${pattern}`, parsed.data, channel, pattern);
      } else {
        this.emit(channel, parsed.data);
      }

      // Route specific events to Unity ECS
      if (channel.startsWith("unity.")) {
        this.routeToUnity(channel, parsed.data);
      }

      // Handle real-time player events
      if (channel.startsWith("player.")) {
        this.handlePlayerEvent(channel, parsed.data);
      }

      // Handle world events
      if (channel.startsWith("world.")) {
        this.handleWorldEvent(channel, parsed.data);
      }
    } catch (error) {
      this.logger.error("Failed to parse message", {
        channel,
        error: error.message,
        message: message.substring(0, 100),
      });
      this.stats.errors++;
    }
  }

  private async routeToUnity(channel: string, data: any): Promise<void> {
    // This would integrate with Unity ECS server
    this.logger.debug("Routing to Unity ECS", { channel, data });

    // Placeholder for Unity integration
    // In a real implementation, this would send data to Unity server
  }

  private async handlePlayerEvent(channel: string, data: any): Promise<void> {
    const [, action] = channel.split(".");

    switch (action) {
      case "moved":
        await this.handlePlayerMovement(data);
        break;
      case "combat":
        await this.handlePlayerCombat(data);
        break;
      case "logged_in":
      case "logged_out":
        await this.handlePlayerSession(data);
        break;
      default:
        this.logger.debug("Unhandled player event", { channel, action });
    }
  }

  private async handleWorldEvent(channel: string, data: any): Promise<void> {
    const [, action] = channel.split(".");

    switch (action) {
      case "region_status_changed":
        await this.broadcastRegionUpdate(data);
        break;
      case "weather_changed":
        await this.broadcastWeatherUpdate(data);
        break;
      case "event_started":
        await this.broadcastWorldEvent(data);
        break;
      default:
        this.logger.debug("Unhandled world event", { channel, action });
    }
  }

  private async handlePlayerMovement(data: any): Promise<void> {
    // Broadcast movement to players in the same region
    await this.publish(`region.${data.regionId}.movement`, {
      playerId: data.playerId,
      position: data.movement.to,
      timestamp: data.timestamp,
    });
  }

  private async handlePlayerCombat(data: any): Promise<void> {
    // Broadcast combat events to nearby players
    await this.publish(`region.${data.regionId}.combat`, {
      combatId: data.eventId,
      attacker: data.attacker,
      target: data.target,
      result: data.result,
      timestamp: data.timestamp,
    });
  }

  private async handlePlayerSession(data: any): Promise<void> {
    // Update online player counts
    await this.publish("stats.player_count", {
      playerId: data.playerId,
      action: data.eventType,
      timestamp: data.timestamp,
    });
  }

  private async broadcastRegionUpdate(data: any): Promise<void> {
    // Notify all players in the region about status changes
    await this.publish(`region.${data.regionId}.status`, {
      status: data.statusChange.to,
      reason: data.statusChange.reason,
      impact: data.impact,
      timestamp: data.timestamp,
    });
  }

  private async broadcastWeatherUpdate(data: any): Promise<void> {
    // Broadcast weather changes to region
    await this.publish(`region.${data.regionId}.weather`, {
      weather: data.weather.to,
      effects: data.effects,
      timestamp: data.timestamp,
    });
  }

  private async broadcastWorldEvent(data: any): Promise<void> {
    // Broadcast world events based on scope
    if (data.scope.global) {
      await this.publish("world.global_event", data);
    } else {
      for (const regionId of data.scope.regions) {
        await this.publish(`region.${regionId}.world_event`, data);
      }
    }
  }

  async getStats(): Promise<any> {
    return {
      ...this.stats,
      connections: {
        publisher: this.publisher.status,
        subscriber: this.subscriber.status,
      },
      channels: Array.from(this.channels),
      uptime: process.uptime(),
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info("Shutting down EventBus...");

    try {
      // Unsubscribe from all channels
      for (const channel of this.channels) {
        if (channel.includes("*")) {
          await this.subscriber.punsubscribe(channel);
        } else {
          await this.subscriber.unsubscribe(channel);
        }
      }

      // Disconnect Redis connections
      await this.publisher.disconnect();
      await this.subscriber.disconnect();

      this.isInitialized = false;
      this.logger.info("EventBus shutdown complete");
    } catch (error) {
      this.logger.error("Error during EventBus shutdown", {
        error: error.message,
      });
      throw error;
    }
  }
}

const log = logger({ serviceName: "EventBus" });
export const eventBus = new EventBus(log);
