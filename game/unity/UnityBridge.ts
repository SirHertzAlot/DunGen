import WebSocket from 'ws';
import { ecsManager, UnityMessage } from '../ecs/ECSManager';
import { logger } from '../../logging/logger';
import { v4 as uuidv4 } from 'uuid';

// Unity communication bridge for real-time ECS synchronization
export class UnityBridge {
  private static instance: UnityBridge;
  private wsServer: WebSocket.Server | null = null;
  private unityClient: WebSocket | null = null;
  private messageBuffer: UnityMessage[] = [];
  private isConnected: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  private constructor() {}

  public static getInstance(): UnityBridge {
    if (!UnityBridge.instance) {
      UnityBridge.instance = new UnityBridge();
    }
    return UnityBridge.instance;
  }

  // Initialize WebSocket server for Unity connection
  public async initialize(port: number = 8080): Promise<void> {
    try {
      this.wsServer = new WebSocket.Server({ 
        port,
        perMessageDeflate: false // Disable compression for low latency
      });

      this.wsServer.on('connection', (ws: WebSocket) => {
        this.handleUnityConnection(ws);
      });

      this.wsServer.on('error', (error) => {
        logger.error('Unity Bridge WebSocket server error', error, {
          service: 'UnityBridge'
        });
      });

      logger.info('Unity Bridge initialized', {
        service: 'UnityBridge',
        port,
        maxReconnects: this.MAX_RECONNECT_ATTEMPTS
      });

    } catch (error) {
      logger.error('Failed to initialize Unity Bridge', error as Error, {
        service: 'UnityBridge',
        port
      });
      throw error;
    }
  }

  private handleUnityConnection(ws: WebSocket): void {
    logger.info('Unity client connected', {
      service: 'UnityBridge',
      clientIP: ws.url || 'unknown'
    });

    this.unityClient = ws;
    this.isConnected = true;
    this.reconnectAttempts = 0;

    // Setup message handling
    ws.on('message', (data: Buffer) => {
      this.handleUnityMessage(data);
    });

    ws.on('close', () => {
      this.handleUnityDisconnection();
    });

    ws.on('error', (error) => {
      logger.error('Unity client connection error', error, {
        service: 'UnityBridge'
      });
    });

    // Send authentication handshake
    this.sendHandshake();

    // Start heartbeat
    this.startHeartbeat();

    // Send buffered messages
    this.flushMessageBuffer();
  }

  private handleUnityMessage(data: Buffer): void {
    try {
      const message: UnityMessage = JSON.parse(data.toString());
      
      // Validate message structure
      if (!this.isValidUnityMessage(message)) {
        logger.warn('Invalid Unity message received', {
          service: 'UnityBridge',
          messageType: message.messageType
        });
        return;
      }

      // Handle special Unity messages
      if (message.messageType === 'heartbeat') {
        this.sendHeartbeatResponse();
        return;
      }

      // Forward to ECS Manager
      ecsManager.queueUnityMessage(message);

      logger.debug('Unity message processed', {
        service: 'UnityBridge',
        messageType: message.messageType,
        messageId: message.messageId
      });

    } catch (error) {
      logger.error('Error processing Unity message', error as Error, {
        service: 'UnityBridge',
        dataLength: data.length
      });
    }
  }

  private handleUnityDisconnection(): void {
    logger.warn('Unity client disconnected', {
      service: 'UnityBridge',
      reconnectAttempts: this.reconnectAttempts
    });

    this.isConnected = false;
    this.unityClient = null;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Attempt reconnection (if Unity supports it)
    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      setTimeout(() => {
        // Unity would need to reconnect to us, not the other way around
        logger.info('Waiting for Unity reconnection', {
          service: 'UnityBridge',
          attempt: this.reconnectAttempts
        });
      }, 5000);
    }
  }

  // Send message to Unity
  public sendToUnity(message: UnityMessage): boolean {
    if (!this.isConnected || !this.unityClient) {
      // Buffer message for when connection is restored
      this.messageBuffer.push(message);
      
      if (this.messageBuffer.length > 1000) { // Prevent memory overflow
        this.messageBuffer.shift(); // Remove oldest message
      }
      
      return false;
    }

    try {
      const messageString = JSON.stringify(message);
      this.unityClient.send(messageString);
      
      logger.debug('Message sent to Unity', {
        service: 'UnityBridge',
        messageType: message.messageType,
        messageId: message.messageId,
        dataSize: messageString.length
      });

      return true;

    } catch (error) {
      logger.error('Error sending message to Unity', error as Error, {
        service: 'UnityBridge',
        messageType: message.messageType
      });
      return false;
    }
  }

  // Send handshake to Unity
  private sendHandshake(): void {
    const handshakeMessage: UnityMessage = {
      messageType: 'systemCommand',
      messageId: uuidv4(),
      timestamp: Date.now(),
      data: {
        command: 'handshake',
        parameters: {
          serverVersion: '1.0.0',
          protocolVersion: '1.0',
          supportedFeatures: [
            'realtime_combat',
            'entity_sync',
            'spell_effects',
            'movement_prediction'
          ]
        }
      }
    };

    this.sendToUnity(handshakeMessage);
  }

  // Heartbeat system
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.unityClient) {
        const heartbeatMessage: UnityMessage = {
          messageType: 'systemCommand',
          messageId: uuidv4(),
          timestamp: Date.now(),
          data: {
            command: 'heartbeat',
            parameters: {
              serverTime: Date.now(),
              entityCount: ecsManager.getPerformanceStats().entityCount
            }
          }
        };

        this.sendToUnity(heartbeatMessage);
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private sendHeartbeatResponse(): void {
    const response: UnityMessage = {
      messageType: 'systemCommand',
      messageId: uuidv4(),
      timestamp: Date.now(),
      data: {
        command: 'heartbeat_ack',
        parameters: {
          serverTime: Date.now()
        }
      }
    };

    this.sendToUnity(response);
  }

  // Send buffered messages when connection is restored
  private flushMessageBuffer(): void {
    if (this.messageBuffer.length === 0) return;

    logger.info('Flushing message buffer to Unity', {
      service: 'UnityBridge',
      messageCount: this.messageBuffer.length
    });

    const messages = [...this.messageBuffer];
    this.messageBuffer = [];

    for (const message of messages) {
      this.sendToUnity(message);
    }
  }

  // Message validation
  private isValidUnityMessage(message: any): message is UnityMessage {
    return (
      message &&
      typeof message.messageType === 'string' &&
      typeof message.messageId === 'string' &&
      typeof message.timestamp === 'number' &&
      message.data !== undefined
    );
  }

  // High-level API methods for game systems
  public sendEntityUpdate(entities: any[], deletedEntities: string[]): boolean {
    const message: UnityMessage = {
      messageType: 'entityUpdate',
      messageId: uuidv4(),
      timestamp: Date.now(),
      data: {
        entities,
        deletedEntities
      }
    };

    return this.sendToUnity(message);
  }

  public sendCombatEvent(eventType: string, combatData: any): boolean {
    const message: UnityMessage = {
      messageType: 'gameEvent',
      messageId: uuidv4(),
      timestamp: Date.now(),
      data: {
        eventType: `combat_${eventType}`,
        eventData: combatData
      }
    };

    return this.sendToUnity(message);
  }

  public sendSpellEffect(spellId: string, casterId: string, targetData: any): boolean {
    const message: UnityMessage = {
      messageType: 'gameEvent',
      messageId: uuidv4(),
      timestamp: Date.now(),
      data: {
        eventType: 'spell_cast',
        entityId: casterId,
        eventData: {
          spellId,
          targetData
        }
      }
    };

    return this.sendToUnity(message);
  }

  // System control
  public sendSystemCommand(command: string, parameters: any): boolean {
    const message: UnityMessage = {
      messageType: 'systemCommand',
      messageId: uuidv4(),
      timestamp: Date.now(),
      data: {
        command,
        parameters
      }
    };

    return this.sendToUnity(message);
  }

  // Status and diagnostics
  public getConnectionStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    bufferedMessages: number;
    lastHeartbeat?: number;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      bufferedMessages: this.messageBuffer.length,
      lastHeartbeat: this.heartbeatInterval ? Date.now() : undefined
    };
  }

  // Cleanup
  public async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.unityClient) {
      this.unityClient.close();
      this.unityClient = null;
    }

    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }

    this.isConnected = false;
    this.messageBuffer = [];

    logger.info('Unity Bridge shutdown complete', {
      service: 'UnityBridge'
    });
  }
}

// Singleton instance
export const unityBridge = UnityBridge.getInstance();