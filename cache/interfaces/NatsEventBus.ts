import {
  IEventBus,
  GameEventMessage,
  EventBusConfig,
  EventBusStatus,
} from "../IEventBus";
import logger, { ILogger } from "../../logging/logger";
import { v4 as uuidv4 } from "uuid";

// NATS event bus implementation - placeholder for future implementation
export class NatsEventBus implements IEventBus {
  private status: EventBusStatus;
  private config: EventBusConfig | null = null;
  logger: ILogger;

  constructor(logger: ILogger) {
    this.status = {
      connected: false,
      activeChannels: [],
      messagesPublished: 0,
      messagesReceived: 0,
      lastActivity: new Date(),
      errors: [],
    };
    this.logger = logger;
  }

  async initialize(config: EventBusConfig): Promise<void> {
    this.config = config;

    this.logger.info("NATS event bus initialized (placeholder)", {
      service: "NatsEventBus",
      instanceId: config.metadata.instanceId,
    });

    // TODO: Implement NATS connection
    throw new Error("NATS EventBus not yet implemented");
  }

  async publish(channel: string, message: GameEventMessage): Promise<void> {
    throw new Error("NATS EventBus not yet implemented");
  }

  async subscribe(
    channel: string,
    handler: (message: GameEventMessage) => void,
  ): Promise<void> {
    throw new Error("NATS EventBus not yet implemented");
  }

  async unsubscribe(channel: string): Promise<void> {
    throw new Error("NATS EventBus not yet implemented");
  }

  async disconnect(): Promise<void> {
    throw new Error("NATS EventBus not yet implemented");
  }

  async getStatus(): Promise<EventBusStatus> {
    return { ...this.status };
  }

  async updateConfig(newConfig: Partial<EventBusConfig>): Promise<void> {
    throw new Error("NATS EventBus not yet implemented");
  }
}
