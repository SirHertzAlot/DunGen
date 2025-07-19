import { IEventBus, GameEventMessage, EventBusConfig, EventBusStatus } from './IEventBus';
import { logger } from '../../logging/logger';
import { v4 as uuidv4 } from 'uuid';

// In-memory event bus implementation - for development/testing
export class MemoryEventBus implements IEventBus {
  private handlers: Map<string, Set<(message: GameEventMessage) => void>>;
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
    
    // Initialize channels
    for (const channel of config.channels) {
      if (!this.handlers.has(channel)) {
        this.handlers.set(channel, new Set());
      }
    }

    this.status.connected = true;
    this.status.activeChannels = [...config.channels];

    logger.info('Memory event bus initialized', {
      service: 'MemoryEventBus',
      instanceId: config.metadata.instanceId,
      channels: config.channels.length
    });
  }

  async publish(channel: string, message: GameEventMessage): Promise<void> {
    if (!this.config) {
      throw new Error('EventBus not initialized');
    }

    try {
      const messageWithId = {
        ...message,
        id: message.id || uuidv4(),
        traceId: message.traceId || uuidv4(),
        timestamp: message.timestamp || Date.now()
      };

      // Get handlers for this channel
      const channelHandlers = this.handlers.get(channel);
      if (channelHandlers && channelHandlers.size > 0) {
        // Process handlers asynchronously to avoid blocking
        setImmediate(() => {
          channelHandlers.forEach(handler => {
            try {
              handler(messageWithId);
            } catch (error) {
              logger.error('Error in event handler', error as Error, {
                service: 'MemoryEventBus',
                channel,
                messageId: messageWithId.id
              });
              this.status.errors.push(`Handler error: ${(error as Error).message}`);
            }
          });
        });
      }

      this.status.messagesPublished++;
      this.status.lastActivity = new Date();

      logger.debug('Message published to memory bus', {
        service: 'MemoryEventBus',
        channel,
        messageId: messageWithId.id,
        type: messageWithId.type,
        handlers: channelHandlers?.size || 0
      });

    } catch (error) {
      logger.error('Error publishing to memory bus', error as Error, {
        service: 'MemoryEventBus',
        channel,
        messageType: message.type
      });
      this.status.errors.push(`Publish error: ${(error as Error).message}`);
      throw error;
    }
  }

  async subscribe(channel: string, handler: (message: GameEventMessage) => void): Promise<void> {
    if (!this.config) {
      throw new Error('EventBus not initialized');
    }

    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
      this.status.activeChannels.push(channel);
    }

    this.handlers.get(channel)!.add(handler);

    logger.info('Subscribed to memory bus channel', {
      service: 'MemoryEventBus',
      channel,
      handlerCount: this.handlers.get(channel)!.size
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    if (this.handlers.has(channel)) {
      this.handlers.delete(channel);
      this.status.activeChannels = this.status.activeChannels.filter(c => c !== channel);
      
      logger.info('Unsubscribed from memory bus channel', {
        service: 'MemoryEventBus',
        channel
      });
    }
  }

  async disconnect(): Promise<void> {
    this.handlers.clear();
    this.status.connected = false;
    this.status.activeChannels = [];
    
    logger.info('Memory event bus disconnected', {
      service: 'MemoryEventBus'
    });
  }

  async getStatus(): Promise<EventBusStatus> {
    return { ...this.status };
  }

  async updateConfig(newConfig: Partial<EventBusConfig>): Promise<void> {
    if (!this.config) {
      throw new Error('EventBus not initialized');
    }

    const updatedConfig = { ...this.config, ...newConfig };
    
    // Re-initialize with new config
    await this.disconnect();
    await this.initialize(updatedConfig);

    logger.info('Memory event bus config updated', {
      service: 'MemoryEventBus',
      instanceId: updatedConfig.metadata.instanceId
    });
  }
}