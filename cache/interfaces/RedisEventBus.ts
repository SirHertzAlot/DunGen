import Redis from 'ioredis';
import { IEventBus, GameEventMessage, EventBusConfig, EventBusStatus } from './IEventBus';
import  logger from '../../logging/logger';
import { v4 as uuidv4 } from 'uuid';

// Redis-based event bus implementation
export class RedisEventBus implements IEventBus {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private handlers: Map<string, (message: GameEventMessage) => void>;
  private status: EventBusStatus;
  private config: EventBusConfig | null = null;

  constructor() {
    this.handlers = new Map();
    this.status = {
      connected: false,
      activeChannels: [],
      messagesPublished: 0,
      messagesReceived: 0,
      lastActivity: new Date(),
      errors: []
    };
  }

  async initialize(config: EventBusConfig): Promise<void> {
    this.config = config;

    try {
      const redisConfig = {
        host: config.host || 'localhost',
        port: config.port || 6379,
        retryDelayOnFailover: config.retryDelay || 100,
        maxRetriesPerRequest: null, // Required for BullMQ compatibility
        lazyConnect: true,
        username: config.username,
        password: config.password
      };

      this.publisher = new Redis(redisConfig);
      this.subscriber = new Redis(redisConfig);

      await this.setupEventListeners();
      
      // Test connection
      await this.publisher.connect();
      await this.subscriber.connect();

      this.status.connected = true;
      this.status.activeChannels = [];

      logger.info('Redis event bus initialized', {
        service: 'RedisEventBus',
        instanceId: config.metadata.instanceId,
        host: config.host,
        port: config.port
      });

    } catch (error) {
      logger.error('Failed to initialize Redis event bus', error as Error, {
        service: 'RedisEventBus',
        instanceId: config.metadata?.instanceId
      });
      this.status.errors.push(`Init error: ${(error as Error).message}`);
      throw error;
    }
  }

  private async setupEventListeners(): Promise<void> {
    if (!this.publisher || !this.subscriber) {
      throw new Error('Redis clients not initialized');
    }

    this.publisher.on('connect', () => {
      logger.info('Redis publisher connected', { service: 'RedisEventBus' });
    });

    this.subscriber.on('connect', () => {
      logger.info('Redis subscriber connected', { service: 'RedisEventBus' });
    });

    this.publisher.on('error', (error) => {
      logger.error('Redis publisher error', error, { service: 'RedisEventBus' });
      this.status.errors.push(`Publisher error: ${error.message}`);
      this.status.connected = false;
    });

    this.subscriber.on('error', (error) => {
      logger.error('Redis subscriber error', error, { service: 'RedisEventBus' });
      this.status.errors.push(`Subscriber error: ${error.message}`);
      this.status.connected = false;
    });

    this.subscriber.on('message', (channel, message) => {
      try {
        const parsedMessage: GameEventMessage = JSON.parse(message);
        const handler = this.handlers.get(channel);
        if (handler) {
          handler(parsedMessage);
          this.status.messagesReceived++;
          this.status.lastActivity = new Date();
        }
      } catch (error) {
        logger.error('Error processing Redis message', error as Error, {
          service: 'RedisEventBus',
          channel,
          message: message.substring(0, 100) + '...'
        });
        this.status.errors.push(`Message processing error: ${(error as Error).message}`);
      }
    });
  }

  async publish(channel: string, message: GameEventMessage): Promise<void> {
    if (!this.publisher || !this.config) {
      throw new Error('EventBus not initialized');
    }

    try {
      const messageWithId = {
        ...message,
        id: message.id || uuidv4(),
        traceId: message.traceId || uuidv4(),
        timestamp: message.timestamp || Date.now()
      };

      await this.publisher.publish(channel, JSON.stringify(messageWithId));
      
      this.status.messagesPublished++;
      this.status.lastActivity = new Date();

      logger.debug('Message published to Redis', {
        service: 'RedisEventBus',
        channel,
        messageId: messageWithId.id,
        type: messageWithId.type
      });

    } catch (error) {
      logger.error('Error publishing to Redis', error as Error, {
        service: 'RedisEventBus',
        channel,
        messageType: message.type
      });
      this.status.errors.push(`Publish error: ${(error as Error).message}`);
      throw error;
    }
  }

  async subscribe(channel: string, handler: (message: GameEventMessage) => void): Promise<void> {
    if (!this.subscriber || !this.config) {
      throw new Error('EventBus not initialized');
    }

    try {
      await this.subscriber.subscribe(channel);
      this.handlers.set(channel, handler);
      
      if (!this.status.activeChannels.includes(channel)) {
        this.status.activeChannels.push(channel);
      }
      
      logger.info('Subscribed to Redis channel', {
        service: 'RedisEventBus',
        channel
      });

    } catch (error) {
      logger.error('Error subscribing to Redis channel', error as Error, {
        service: 'RedisEventBus',
        channel
      });
      this.status.errors.push(`Subscribe error: ${(error as Error).message}`);
      throw error;
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.subscriber) {
      throw new Error('EventBus not initialized');
    }

    try {
      await this.subscriber.unsubscribe(channel);
      this.handlers.delete(channel);
      this.status.activeChannels = this.status.activeChannels.filter(c => c !== channel);
      
      logger.info('Unsubscribed from Redis channel', {
        service: 'RedisEventBus',
        channel
      });

    } catch (error) {
      logger.error('Error unsubscribing from Redis channel', error as Error, {
        service: 'RedisEventBus',
        channel
      });
      this.status.errors.push(`Unsubscribe error: ${(error as Error).message}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.publisher) await this.publisher.disconnect();
      if (this.subscriber) await this.subscriber.disconnect();
      
      this.status.connected = false;
      this.status.activeChannels = [];
      
      logger.info('Redis connections closed', { service: 'RedisEventBus' });

    } catch (error) {
      logger.error('Error disconnecting Redis', error as Error, {
        service: 'RedisEventBus'
      });
    }
  }

  async getStatus(): Promise<EventBusStatus> {
    return { ...this.status };
  }

  async updateConfig(newConfig: Partial<EventBusConfig>): Promise<void> {
    if (!this.config) {
      throw new Error('EventBus not initialized');
    }

    const updatedConfig = { ...this.config, ...newConfig };
    
    // Gracefully reconnect with new config
    await this.disconnect();
    await this.initialize(updatedConfig);

    logger.info('Redis event bus config updated', {
      service: 'RedisEventBus',
      instanceId: updatedConfig.metadata.instanceId
    });
  }
}
