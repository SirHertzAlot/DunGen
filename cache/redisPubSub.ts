import Redis from 'ioredis';
import { logger } from '../logging/logger';
import { v4 as uuidv4 } from 'uuid';

// Event types for type safety
export interface GameEventMessage {
  id: string;
  type: string;
  playerId?: string;
  regionId?: string;
  data: any;
  timestamp: number;
}

export interface IEventBus {
  publish(channel: string, message: GameEventMessage): Promise<void>;
  subscribe(channel: string, handler: (message: GameEventMessage) => void): Promise<void>;
  disconnect(): Promise<void>;
}

class RedisEventBus implements IEventBus {
  private publisher: Redis;
  private subscriber: Redis;
  private handlers: Map<string, (message: GameEventMessage) => void>;

  constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    };

    this.publisher = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);
    this.handlers = new Map();

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.publisher.on('connect', () => {
      logger.info('Redis publisher connected', { service: 'RedisEventBus' });
    });

    this.subscriber.on('connect', () => {
      logger.info('Redis subscriber connected', { service: 'RedisEventBus' });
    });

    this.publisher.on('error', (error) => {
      logger.error('Redis publisher error', error, { service: 'RedisEventBus' });
    });

    this.subscriber.on('error', (error) => {
      logger.error('Redis subscriber error', error, { service: 'RedisEventBus' });
    });

    this.subscriber.on('message', (channel, message) => {
      try {
        const parsedMessage: GameEventMessage = JSON.parse(message);
        const handler = this.handlers.get(channel);
        if (handler) {
          handler(parsedMessage);
        }
      } catch (error) {
        logger.error('Error processing Redis message', error as Error, {
          service: 'RedisEventBus',
          channel,
          message
        });
      }
    });
  }

  async publish(channel: string, message: GameEventMessage): Promise<void> {
    try {
      const messageWithId = {
        ...message,
        id: message.id || uuidv4(),
        timestamp: message.timestamp || Date.now()
      };

      await this.publisher.publish(channel, JSON.stringify(messageWithId));
      
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
      throw error;
    }
  }

  async subscribe(channel: string, handler: (message: GameEventMessage) => void): Promise<void> {
    try {
      await this.subscriber.subscribe(channel);
      this.handlers.set(channel, handler);
      
      logger.info('Subscribed to Redis channel', {
        service: 'RedisEventBus',
        channel
      });
    } catch (error) {
      logger.error('Error subscribing to Redis channel', error as Error, {
        service: 'RedisEventBus',
        channel
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.publisher.disconnect(),
      this.subscriber.disconnect()
    ]);
    
    logger.info('Redis connections closed', { service: 'RedisEventBus' });
  }
}

export const eventBus = new RedisEventBus();