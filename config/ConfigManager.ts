import fs from "fs/promises";
import path from "path";
import logger from "../logging/logger";
import { v4 as uuidv4 } from "uuid";

const log = logger({ serviceName: "ConfigManager" });

// Base configuration interface
export interface BaseInfrastructureConfig {
  metadata: {
    instanceId: string;
    region: string;
    environment: string;
  };
}

// Infrastructure component interfaces
export interface EventBusConfig extends BaseInfrastructureConfig {
  type: "redis" | "memory" | "nats" | "rabbitmq";
  connectionString?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  maxRetries?: number;
  retryDelay?: number;
  channels: string[];
}

export interface StorageConfig extends BaseInfrastructureConfig {
  type: "memory" | "postgresql" | "mongodb" | "redis";
  connectionString?: string;
  poolSize?: number;
  maxConnections?: number;
}

export interface QueueConfig extends BaseInfrastructureConfig {
  type: "memory" | "bullmq" | "rabbitmq" | "sqs";
  redisUrl?: string;
  concurrency?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface LoggingConfig extends BaseInfrastructureConfig {
  type: "console" | "winston" | "pino" | "bunyan";
  level: "error" | "warn" | "info" | "debug";
  transports?: string[];
  logDirectory?: string;
}

export interface UnificationContainerConfig {
  containerId: string;
  serverNode: string;
  region: string;
  worldId: string;
  regionId: string;
  tickRate: number;
  maxPlayers: number;
  systemSpecs: {
    cpu: string;
    memory: string;
    storage: string;
  };
  metadata: {
    instanceId: string;
    region: string;
    environment: string;
  };
}

export interface ApiConfig {
  rest: {
    enabled: boolean;
    port: number;
    rateLimit: {
      windowMs: number;
      max: number;
    };
    cors: {
      enabled: boolean;
      origins: string[];
    };
  };
  graphql: {
    enabled: boolean;
    endpoint: string;
    playground: boolean;
    introspection: boolean;
    subscriptions: {
      enabled: boolean;
      path: string;
    };
  };
  grpc: {
    enabled: boolean;
    port: number;
    services: string[];
    reflection: boolean;
  };
}

export interface MonitoringConfig {
  prometheus: {
    enabled: boolean;
    port: number;
    path: string;
  };
  healthChecks: {
    enabled: boolean;
    interval: number;
    timeout: number;
    endpoints: string[];
  };
}

// Main infrastructure configuration
export interface InfrastructureConfiguration {
  infrastructure: {
    eventBus: Record<string, EventBusConfig>;
    storage: Record<string, StorageConfig>;
    queue: Record<string, QueueConfig>;
    logging: Record<string, LoggingConfig>;
    unificationContainers: Record<string, UnificationContainerConfig>;
  };
  api: ApiConfig;
  monitoring: MonitoringConfig;
}

// Hot-swappable configuration manager
export class ConfigManager {
  private static instance: ConfigManager;
  private config: InfrastructureConfiguration | null = null;
  private configPath: string;
  private environment: string;
  private watchers: Map<string, ((config: any) => void)[]> = new Map();

  private constructor(configPath: string = "./config/infrastructure.json") {
    this.configPath = configPath;
    this.environment = process.env.NODE_ENV || "development";
  }

  public static getInstance(configPath?: string): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(configPath);
    }
    return ConfigManager.instance;
  }

  // Load configuration from JSON file
  public async loadConfig(): Promise<InfrastructureConfiguration> {
    try {
      const configFile = await fs.readFile(this.configPath, "utf-8");
      const rawConfig = JSON.parse(configFile);

      // Resolve environment variables
      this.config = this.resolveEnvironmentVariables(rawConfig);

      log.info("Configuration loaded successfully", {
        service: "ConfigManager",
        environment: this.environment,
        configPath: this.configPath,
      });

      return this.config;
    } catch (error) {
      log.error("Failed to load configuration", error as Error, {
        service: "ConfigManager",
        configPath: this.configPath,
      });
      throw error;
    }
  }

  // Hot-swap configuration via API
  public async updateConfig(
    updates: Partial<InfrastructureConfiguration>,
  ): Promise<void> {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }

    const updatedConfig = this.mergeConfig(this.config, updates);

    // Validate the updated configuration
    this.validateConfiguration(updatedConfig);

    // Save to file
    await this.saveConfig(updatedConfig);

    // Update in-memory config
    this.config = updatedConfig;

    // Notify watchers
    this.notifyWatchers("config.updated", updatedConfig);

    log.info("Configuration updated successfully", {
      service: "ConfigManager",
      updateId: uuidv4(),
    });
  }

  // Get configuration for specific infrastructure type
  public getInfrastructureConfig<T>(type: string, environment?: string): T {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }

    const env = environment || this.environment;
    const infraConfig = (this.config.infrastructure as any)[type];

    if (!infraConfig || !infraConfig[env]) {
      throw new Error(
        `Configuration not found for ${type} in ${env} environment`,
      );
    }

    return infraConfig[env] as T;
  }

  // Get unification container configuration
  public getUnificationContainerConfig(
    regionId: string,
  ): UnificationContainerConfig {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }

    const containerConfig =
      this.config.infrastructure.unificationContainers[regionId];
    if (!containerConfig) {
      throw new Error(
        `Unification container configuration not found for region: ${regionId}`,
      );
    }

    return containerConfig;
  }

  // Get API configuration
  public getApiConfig(): ApiConfig {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }
    return this.config.api;
  }

  // Get monitoring configuration
  public getMonitoringConfig(): MonitoringConfig {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }
    return this.config.monitoring;
  }

  // Watch for configuration changes
  public onConfigChange(event: string, callback: (config: any) => void): void {
    if (!this.watchers.has(event)) {
      this.watchers.set(event, []);
    }
    this.watchers.get(event)!.push(callback);
  }

  // Add new infrastructure node
  public async addInfrastructureNode(
    type: string,
    environment: string,
    config: any,
  ): Promise<void> {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }

    if (!(this.config.infrastructure as any)[type]) {
      (this.config.infrastructure as any)[type] = {};
    }

    (this.config.infrastructure as any)[type][environment] = {
      ...config,
      metadata: {
        ...config.metadata,
        instanceId: config.metadata?.instanceId || uuidv4(),
        addedAt: new Date().toISOString(),
      },
    };

    await this.saveConfig(this.config);
    this.notifyWatchers("node.added", { type, environment, config });

    log.info("Infrastructure node added", {
      service: "ConfigManager",
      type,
      environment,
      instanceId: config.metadata?.instanceId,
    });
  }

  // Remove infrastructure node
  public async removeInfrastructureNode(
    type: string,
    environment: string,
  ): Promise<void> {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }

    if ((this.config.infrastructure as any)[type]?.[environment]) {
      delete (this.config.infrastructure as any)[type][environment];

      await this.saveConfig(this.config);
      this.notifyWatchers("node.removed", { type, environment });

      log.info("Infrastructure node removed", {
        service: "ConfigManager",
        type,
        environment,
      });
    }
  }

  // Private methods
  private resolveEnvironmentVariables(config: any): any {
    const resolved = JSON.parse(JSON.stringify(config));

    const resolve = (obj: any): any => {
      for (const key in obj) {
        if (
          typeof obj[key] === "string" &&
          obj[key].startsWith("${") &&
          obj[key].endsWith("}")
        ) {
          const envVar = obj[key].slice(2, -1);
          obj[key] = process.env[envVar] || obj[key];
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          obj[key] = resolve(obj[key]);
        }
      }
      return obj;
    };

    return resolve(resolved);
  }

  private mergeConfig(
    base: InfrastructureConfiguration,
    updates: Partial<InfrastructureConfiguration>,
  ): InfrastructureConfiguration {
    return {
      infrastructure: {
        ...base.infrastructure,
        ...updates.infrastructure,
      },
      api: {
        ...base.api,
        ...updates.api,
      },
      monitoring: {
        ...base.monitoring,
        ...updates.monitoring,
      },
    };
  }

  private validateConfiguration(config: InfrastructureConfiguration): void {
    // Basic validation - can be extended
    if (!config.infrastructure) {
      throw new Error("Infrastructure configuration is required");
    }

    if (!config.api) {
      throw new Error("API configuration is required");
    }

    if (!config.monitoring) {
      throw new Error("Monitoring configuration is required");
    }

    log.debug("Configuration validation passed", {
      service: "ConfigManager",
    });
  }

  private async saveConfig(config: InfrastructureConfiguration): Promise<void> {
    try {
      await fs.writeFile(
        this.configPath,
        JSON.stringify(config, null, 2),
        "utf-8",
      );

      log.debug("Configuration saved to file", {
        service: "ConfigManager",
        configPath: this.configPath,
      });
    } catch (error) {
      log.error("Failed to save configuration", error as Error, {
        service: "ConfigManager",
        configPath: this.configPath,
      });
      throw error;
    }
  }

  private notifyWatchers(event: string, data: any): void {
    const watchers = this.watchers.get(event);
    if (watchers) {
      watchers.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          log.error("Error in configuration watcher", error as Error, {
            service: "ConfigManager",
            event,
          });
        }
      });
    }
  }
}

// Singleton instance
export const configManager = ConfigManager.getInstance();
