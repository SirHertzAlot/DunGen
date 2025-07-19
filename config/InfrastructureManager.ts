import { ConfigManager, EventBusConfig, StorageConfig, QueueConfig } from './ConfigManager';
import { EventBusFactory, IEventBus } from '../cache/interfaces/IEventBus';
import { logger } from '../logging/logger';
import { v4 as uuidv4 } from 'uuid';

// Interface for all infrastructure components
export interface IInfrastructureComponent {
  initialize(config: any): Promise<void>;
  getStatus(): Promise<any>;
  updateConfig(config: any): Promise<void>;
  shutdown(): Promise<void>;
}

// Infrastructure manager for hot-swappable components
export class InfrastructureManager {
  private static instance: InfrastructureManager;
  private configManager: ConfigManager;
  private components: Map<string, IInfrastructureComponent> = new Map();
  private isInitialized: boolean = false;

  private constructor() {
    this.configManager = ConfigManager.getInstance();
  }

  public static getInstance(): InfrastructureManager {
    if (!InfrastructureManager.instance) {
      InfrastructureManager.instance = new InfrastructureManager();
    }
    return InfrastructureManager.instance;
  }

  // Initialize all infrastructure components
  public async initialize(): Promise<void> {
    try {
      await this.configManager.loadConfig();
      
      // Initialize event bus
      await this.initializeEventBus();
      
      // Initialize other components as needed
      // await this.initializeStorage();
      // await this.initializeQueue();
      
      // Setup configuration watchers for hot-swapping
      this.setupConfigurationWatchers();
      
      this.isInitialized = true;

      logger.info('Infrastructure manager initialized successfully', {
        service: 'InfrastructureManager',
        componentsCount: this.components.size
      });

    } catch (error) {
      logger.error('Failed to initialize infrastructure manager', error as Error, {
        service: 'InfrastructureManager'
      });
      throw error;
    }
  }

  // Get infrastructure component
  public getComponent<T extends IInfrastructureComponent>(name: string): T {
    const component = this.components.get(name);
    if (!component) {
      throw new Error(`Infrastructure component not found: ${name}`);
    }
    return component as T;
  }

  // Hot-swap infrastructure component
  public async swapComponent(
    name: string, 
    newConfig: any, 
    componentType: string
  ): Promise<void> {
    const requestId = uuidv4();

    try {
      logger.info('Starting component hot-swap', {
        service: 'InfrastructureManager',
        requestId,
        componentName: name,
        componentType
      });

      // Get existing component
      const existingComponent = this.components.get(name);
      
      // Create new component
      let newComponent: IInfrastructureComponent;
      
      switch (componentType) {
        case 'eventBus':
          newComponent = await EventBusFactory.create(newConfig);
          break;
        // Add other component types as needed
        default:
          throw new Error(`Unsupported component type: ${componentType}`);
      }

      // Initialize new component
      await newComponent.initialize(newConfig);

      // Gracefully shutdown old component if exists
      if (existingComponent) {
        await existingComponent.shutdown();
      }

      // Replace component
      this.components.set(name, newComponent);

      logger.info('Component hot-swap completed successfully', {
        service: 'InfrastructureManager',
        requestId,
        componentName: name,
        componentType
      });

    } catch (error) {
      logger.error('Failed to hot-swap component', error as Error, {
        service: 'InfrastructureManager',
        requestId,
        componentName: name,
        componentType
      });
      throw error;
    }
  }

  // Get system status
  public async getSystemStatus(): Promise<any> {
    const status = {
      initialized: this.isInitialized,
      components: {} as Record<string, any>,
      timestamp: new Date().toISOString()
    };

    for (const [name, component] of this.components) {
      try {
        status.components[name] = await component.getStatus();
      } catch (error) {
        status.components[name] = {
          error: (error as Error).message,
          healthy: false
        };
      }
    }

    return status;
  }

  // Reconfigure infrastructure node
  public async reconfigureNode(
    nodeType: string,
    environment: string,
    newConfig: any
  ): Promise<void> {
    const requestId = uuidv4();

    try {
      logger.info('Reconfiguring infrastructure node', {
        service: 'InfrastructureManager',
        requestId,
        nodeType,
        environment
      });

      // Update configuration
      await this.configManager.updateConfig({
        infrastructure: {
          [nodeType]: {
            [environment]: newConfig
          }
        }
      } as any);

      // Hot-swap the component if it's currently active
      const componentName = `${nodeType}_${environment}`;
      if (this.components.has(componentName)) {
        await this.swapComponent(componentName, newConfig, nodeType);
      }

      logger.info('Infrastructure node reconfigured successfully', {
        service: 'InfrastructureManager',
        requestId,
        nodeType,
        environment
      });

    } catch (error) {
      logger.error('Failed to reconfigure infrastructure node', error as Error, {
        service: 'InfrastructureManager',
        requestId,
        nodeType,
        environment
      });
      throw error;
    }
  }

  // Private methods
  private async initializeEventBus(): Promise<void> {
    try {
      const eventBusConfig = this.configManager.getInfrastructureConfig<EventBusConfig>('eventBus');
      const eventBus = await EventBusFactory.create(eventBusConfig);
      
      await eventBus.initialize(eventBusConfig);
      this.components.set('eventBus', eventBus as any);

      logger.info('Event bus initialized', {
        service: 'InfrastructureManager',
        eventBusType: eventBusConfig.type,
        instanceId: eventBusConfig.metadata.instanceId
      });

    } catch (error) {
      logger.error('Failed to initialize event bus', error as Error, {
        service: 'InfrastructureManager'
      });

      // Fallback to memory event bus for development
      logger.warn('Falling back to memory event bus', {
        service: 'InfrastructureManager'
      });

      const fallbackConfig: EventBusConfig = {
        type: 'memory',
        channels: [
          'unification.events',
          'unification.player_events',
          'unification.region_events',
          'persistence.player_updates',
          'world.player_events',
          'world.chat_events'
        ],
        metadata: {
          instanceId: 'fallback-eventbus-' + uuidv4(),
          region: 'local',
          environment: 'development'
        }
      };

      const fallbackEventBus = await EventBusFactory.create(fallbackConfig);
      await fallbackEventBus.initialize(fallbackConfig);
      this.components.set('eventBus', fallbackEventBus as any);
    }
  }

  private setupConfigurationWatchers(): void {
    // Watch for configuration updates
    this.configManager.onConfigChange('config.updated', async (updatedConfig) => {
      logger.info('Configuration updated, checking for component changes', {
        service: 'InfrastructureManager'
      });

      // TODO: Implement smart component reloading based on config changes
    });

    // Watch for node additions
    this.configManager.onConfigChange('node.added', async (data) => {
      logger.info('New infrastructure node added', {
        service: 'InfrastructureManager',
        nodeType: data.type,
        environment: data.environment
      });

      // TODO: Initialize new node if needed
    });

    // Watch for node removals
    this.configManager.onConfigChange('node.removed', async (data) => {
      logger.info('Infrastructure node removed', {
        service: 'InfrastructureManager',
        nodeType: data.type,
        environment: data.environment
      });

      // TODO: Cleanup removed node
    });
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    logger.info('Shutting down infrastructure manager', {
      service: 'InfrastructureManager'
    });

    for (const [name, component] of this.components) {
      try {
        await component.shutdown();
        logger.info(`Component ${name} shut down successfully`);
      } catch (error) {
        logger.error(`Error shutting down component ${name}`, error as Error, {
          service: 'InfrastructureManager',
          componentName: name
        });
      }
    }

    this.components.clear();
    this.isInitialized = false;
  }
}

// Singleton instance
export const infrastructureManager = InfrastructureManager.getInstance();