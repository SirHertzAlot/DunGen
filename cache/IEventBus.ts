import { v4 as uuidv4 } from "uuid";
import { ILogger } from "../logging/logger";

// Base event message interface
export interface GameEventMessage {
  id: string;
  type: string;
  playerId?: string;
  regionId?: string;
  traceId: string;
  data: any;
  timestamp: number;
}

// Event bus interface - all implementations must follow this
export interface IEventBus {
  logger: ILogger;
  initialize(config: EventBusConfig): Promise<void>;
  publish(channel: string, message: GameEventMessage): Promise<void>;
  subscribe(
    channel: string,
    handler: (message: GameEventMessage) => void,
  ): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<EventBusStatus>;
  updateConfig(config: Partial<EventBusConfig>): Promise<void>;
}

// Configuration interface
export interface EventBusConfig {
  type: "redis" | "memory" | "nats" | "rabbitmq";
  connectionString?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  maxRetries?: number;
  retryDelay?: number;
  channels: string[];
  metadata: {
    instanceId: string;
    region: string;
    environment: string;
  };
}

// Status interface
export interface EventBusStatus {
  connected: boolean;
  activeChannels: string[];
  messagesPublished: number;
  messagesReceived: number;
  lastActivity: Date;
  errors: string[];
}

// Factory for creating event bus instances
export class EventBusFactory {
  static async create(
    config: EventBusConfig,
    logger: ILogger,
  ): Promise<IEventBus> {
    switch (config.type) {
      case "redis":
        const { RedisEventBus } = await import("./interfaces/RedisEventBus");
        return new RedisEventBus(logger);
      case "memory":
        const { MemoryEventBus } = await import("./interfaces/MemoryEventBus");
        return new MemoryEventBus(logger);
      case "nats":
        const { NatsEventBus } = await import("./interfaces/NatsEventBus");
        return new NatsEventBus(logger);
      default:
        throw new Error(`Unsupported event bus type: ${config.type}`);
    }
  }
}
