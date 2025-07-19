import { MongoClient, MongoClientOptions } from 'mongodb';
import { logger } from '../logging/logger';

/**
 * MongoDB configuration and connection management
 * Handles sharded cluster connections, read/write splitting, and connection pooling
 */

export interface MongoConfig {
  primary: {
    uri: string;
    database: string;
    options: MongoClientOptions;
  };
  replicas: Array<{
    uri: string;
    database: string;
    options: MongoClientOptions;
  }>;
  shards: Array<{
    id: string;
    uri: string;
    database: string;
    regions: string[];
    options: MongoClientOptions;
  }>;
  connectionPool: {
    minPoolSize: number;
    maxPoolSize: number;
    maxIdleTimeMS: number;
    waitQueueTimeoutMS: number;
  };
}

export class MongoManager {
  private config: MongoConfig;
  private primaryClient?: MongoClient;
  private replicaClients: Map<string, MongoClient> = new Map();
  private shardClients: Map<string, MongoClient> = new Map();
  private isInitialized = false;

  constructor(config?: Partial<MongoConfig>) {
    this.config = {
      primary: {
        uri: process.env.MONGODB_PRIMARY_URI || 'mongodb://localhost:27017',
        database: process.env.MONGODB_DATABASE || 'mmorpg',
        options: this.getDefaultOptions()
      },
      replicas: [],
      shards: [],
      connectionPool: {
        minPoolSize: 5,
        maxPoolSize: 50,
        maxIdleTimeMS: 30000,
        waitQueueTimeoutMS: 5000
      },
      ...config
    };

    this.loadConfigFromEnvironment();
  }

  private loadConfigFromEnvironment(): void {
    // Load shard configurations from environment
    const shardCount = parseInt(process.env.MONGODB_SHARD_COUNT || '0');
    
    for (let i = 0; i < shardCount; i++) {
      const shardUri = process.env[`MONGODB_SHARD_${i}_URI`];
      const shardRegions = process.env[`MONGODB_SHARD_${i}_REGIONS`]?.split(',') || [];
      
      if (shardUri) {
        this.config.shards.push({
          id: `shard_${i}`,
          uri: shardUri,
          database: this.config.primary.database,
          regions: shardRegions,
          options: this.getDefaultOptions()
        });
      }
    }

    // Load replica configurations
    const replicaCount = parseInt(process.env.MONGODB_REPLICA_COUNT || '0');
    
    for (let i = 0; i < replicaCount; i++) {
      const replicaUri = process.env[`MONGODB_REPLICA_${i}_URI`];
      
      if (replicaUri) {
        this.config.replicas.push({
          uri: replicaUri,
          database: this.config.primary.database,
          options: {
            ...this.getDefaultOptions(),
            readPreference: 'secondary'
          }
        });
      }
    }
  }

  private getDefaultOptions(): MongoClientOptions {
    return {
      minPoolSize: this.config?.connectionPool?.minPoolSize || 5,
      maxPoolSize: this.config?.connectionPool?.maxPoolSize || 50,
      maxIdleTimeMS: this.config?.connectionPool?.maxIdleTimeMS || 30000,
      waitQueueTimeoutMS: this.config?.connectionPool?.waitQueueTimeoutMS || 5000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      retryReads: true,
      compressors: ['snappy', 'zlib'],
      zlibCompressionLevel: 6,
      appName: 'MMORPG-Backend'
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize primary connection
      await this.initializePrimary();
      
      // Initialize replica connections
      await this.initializeReplicas();
      
      // Initialize shard connections
      await this.initializeShards();
      
      // Test all connections
      await this.testConnections();
      
      this.isInitialized = true;
      
      logger.info('MongoDB connections initialized', {
        primary: true,
        replicas: this.config.replicas.length,
        shards: this.config.shards.length
      });
    } catch (error) {
      logger.error('Failed to initialize MongoDB connections', { 
        error: error.message 
      });
      throw error;
    }
  }

  private async initializePrimary(): Promise<void> {
    this.primaryClient = new MongoClient(
      this.config.primary.uri,
      this.config.primary.options
    );
    
    await this.primaryClient.connect();
    logger.info('Primary MongoDB connection established');
  }

  private async initializeReplicas(): Promise<void> {
    for (let i = 0; i < this.config.replicas.length; i++) {
      const replica = this.config.replicas[i];
      const replicaId = `replica_${i}`;
      
      const client = new MongoClient(replica.uri, replica.options);
      await client.connect();
      
      this.replicaClients.set(replicaId, client);
      logger.info('Replica MongoDB connection established', { replicaId });
    }
  }

  private async initializeShards(): Promise<void> {
    for (const shard of this.config.shards) {
      const client = new MongoClient(shard.uri, shard.options);
      await client.connect();
      
      this.shardClients.set(shard.id, client);
      logger.info('Shard MongoDB connection established', { 
        shardId: shard.id,
        regions: shard.regions 
      });
    }
  }

  private async testConnections(): Promise<void> {
    // Test primary connection
    if (this.primaryClient) {
      await this.primaryClient.db(this.config.primary.database).admin().ping();
    }

    // Test replica connections
    for (const [replicaId, client] of this.replicaClients) {
      try {
        await client.db(this.config.primary.database).admin().ping();
      } catch (error) {
        logger.warn('Replica connection test failed', { 
          replicaId, 
          error: error.message 
        });
      }
    }

    // Test shard connections
    for (const [shardId, client] of this.shardClients) {
      try {
        await client.db(this.config.primary.database).admin().ping();
      } catch (error) {
        logger.warn('Shard connection test failed', { 
          shardId, 
          error: error.message 
        });
      }
    }
  }

  getPrimaryDatabase() {
    if (!this.primaryClient) {
      throw new Error('Primary MongoDB client not initialized');
    }
    return this.primaryClient.db(this.config.primary.database);
  }

  getShardDatabase(regionId: string) {
    // Find shard based on region
    const shard = this.config.shards.find(s => s.regions.includes(regionId));
    
    if (!shard) {
      // Fall back to primary if no specific shard found
      return this.getPrimaryDatabase();
    }

    const client = this.shardClients.get(shard.id);
    if (!client) {
      throw new Error(`Shard client not found: ${shard.id}`);
    }

    return client.db(shard.database);
  }

  getReadDatabase(regionId?: string) {
    // Use replica for read operations if available
    if (this.replicaClients.size > 0) {
      const replicaIds = Array.from(this.replicaClients.keys());
      const randomReplica = replicaIds[Math.floor(Math.random() * replicaIds.length)];
      const client = this.replicaClients.get(randomReplica);
      
      if (client) {
        return client.db(this.config.primary.database);
      }
    }

    // Fall back to shard or primary
    return regionId ? this.getShardDatabase(regionId) : this.getPrimaryDatabase();
  }

  getWriteDatabase(regionId?: string) {
    // Always use shard for writes if available
    return regionId ? this.getShardDatabase(regionId) : this.getPrimaryDatabase();
  }

  async getConnectionStats() {
    const stats: any = {
      primary: null,
      replicas: {},
      shards: {},
      total: {
        connections: 0,
        activeConnections: 0,
        availableConnections: 0
      }
    };

    try {
      // Primary stats
      if (this.primaryClient) {
        const primaryStats = await this.getClientStats(this.primaryClient);
        stats.primary = primaryStats;
        stats.total.connections += primaryStats.currentConnections;
        stats.total.activeConnections += primaryStats.currentConnections;
        stats.total.availableConnections += primaryStats.availableConnections;
      }

      // Replica stats
      for (const [replicaId, client] of this.replicaClients) {
        try {
          const replicaStats = await this.getClientStats(client);
          stats.replicas[replicaId] = replicaStats;
          stats.total.connections += replicaStats.currentConnections;
          stats.total.activeConnections += replicaStats.currentConnections;
          stats.total.availableConnections += replicaStats.availableConnections;
        } catch (error) {
          stats.replicas[replicaId] = { error: error.message };
        }
      }

      // Shard stats
      for (const [shardId, client] of this.shardClients) {
        try {
          const shardStats = await this.getClientStats(client);
          stats.shards[shardId] = shardStats;
          stats.total.connections += shardStats.currentConnections;
          stats.total.activeConnections += shardStats.currentConnections;
          stats.total.availableConnections += shardStats.availableConnections;
        } catch (error) {
          stats.shards[shardId] = { error: error.message };
        }
      }
    } catch (error) {
      logger.error('Failed to get connection stats', { error: error.message });
    }

    return stats;
  }

  private async getClientStats(client: MongoClient) {
    // MongoDB client doesn't expose connection pool stats directly
    // This is a simplified version
    return {
      currentConnections: 0, // Would get from client internals
      availableConnections: this.config.connectionPool.maxPoolSize,
      totalCreated: 0,
      totalDestroyed: 0
    };
  }

  async createIndexes(): Promise<void> {
    try {
      logger.info('Creating database indexes...');

      const databases = [
        this.getPrimaryDatabase(),
        ...Array.from(this.shardClients.values()).map(client => 
          client.db(this.config.primary.database)
        )
      ];

      for (const db of databases) {
        // Player indexes
        await db.collection('players').createIndexes([
          { key: { username: 1 }, unique: true },
          { key: { email: 1 }, unique: true },
          { key: { regionId: 1 } },
          { key: { guild: 1 } },
          { key: { level: -1 } },
          { key: { isOnline: 1 } },
          { key: { lastActive: -1 } },
          { key: { positionX: 1, positionY: 1 } }
        ]);

        // Session indexes
        await db.collection('sessions').createIndexes([
          { key: { sessionToken: 1 }, unique: true },
          { key: { playerId: 1 } },
          { key: { regionId: 1 } },
          { key: { isActive: 1 } },
          { key: { lastActivity: -1 } },
          { key: { ipAddress: 1 } }
        ]);

        // Game events indexes
        await db.collection('game_events').createIndexes([
          { key: { playerId: 1, timestamp: -1 } },
          { key: { eventType: 1, timestamp: -1 } },
          { key: { regionId: 1, timestamp: -1 } },
          { key: { timestamp: -1 } }
        ]);

        // Region indexes
        await db.collection('regions').createIndexes([
          { key: { serverNode: 1 } },
          { key: { status: 1 } },
          { key: { playerCount: -1 } }
        ]);

        // Guild indexes
        await db.collection('guilds').createIndexes([
          { key: { name: 1 }, unique: true },
          { key: { leaderId: 1 } },
          { key: { level: -1 } },
          { key: { memberCount: -1 } }
        ]);
      }

      logger.info('Database indexes created successfully');
    } catch (error) {
      logger.error('Failed to create indexes', { error: error.message });
      throw error;
    }
  }

  async setupSharding(): Promise<void> {
    if (this.config.shards.length === 0) {
      logger.info('No shards configured, skipping sharding setup');
      return;
    }

    try {
      logger.info('Setting up MongoDB sharding...');

      const adminDb = this.primaryClient?.db('admin');
      if (!adminDb) {
        throw new Error('Primary client not available for sharding setup');
      }

      // Enable sharding on database
      await adminDb.command({
        enableSharding: this.config.primary.database
      });

      // Shard collections
      const collectionsToShard = [
        { name: 'players', key: { regionId: 1 } },
        { name: 'sessions', key: { regionId: 1 } },
        { name: 'game_events', key: { regionId: 1, timestamp: 1 } }
      ];

      for (const collection of collectionsToShard) {
        await adminDb.command({
          shardCollection: `${this.config.primary.database}.${collection.name}`,
          key: collection.key
        });

        logger.info('Collection sharded', { 
          collection: collection.name, 
          shardKey: collection.key 
        });
      }

      logger.info('MongoDB sharding setup completed');
    } catch (error) {
      logger.error('Failed to setup sharding', { error: error.message });
      // Don't throw error as sharding might already be configured
    }
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    const health = {
      status: 'healthy',
      details: {
        primary: 'unknown',
        replicas: {} as any,
        shards: {} as any,
        timestamp: new Date().toISOString()
      }
    };

    try {
      // Check primary
      if (this.primaryClient) {
        const result = await this.primaryClient.db(this.config.primary.database).admin().ping();
        health.details.primary = result ? 'healthy' : 'unhealthy';
      }

      // Check replicas
      for (const [replicaId, client] of this.replicaClients) {
        try {
          const result = await client.db(this.config.primary.database).admin().ping();
          health.details.replicas[replicaId] = result ? 'healthy' : 'unhealthy';
        } catch (error) {
          health.details.replicas[replicaId] = 'unhealthy';
        }
      }

      // Check shards
      for (const [shardId, client] of this.shardClients) {
        try {
          const result = await client.db(this.config.primary.database).admin().ping();
          health.details.shards[shardId] = result ? 'healthy' : 'unhealthy';
        } catch (error) {
          health.details.shards[shardId] = 'unhealthy';
        }
      }

      // Determine overall health
      const allHealthy = [
        health.details.primary === 'healthy',
        Object.values(health.details.replicas).every(status => status === 'healthy'),
        Object.values(health.details.shards).every(status => status === 'healthy')
      ].every(Boolean);

      health.status = allHealthy ? 'healthy' : 'degraded';

    } catch (error) {
      health.status = 'unhealthy';
      health.details.error = error.message;
    }

    return health;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down MongoDB connections...');

    try {
      // Close primary connection
      if (this.primaryClient) {
        await this.primaryClient.close();
        logger.info('Primary MongoDB connection closed');
      }

      // Close replica connections
      for (const [replicaId, client] of this.replicaClients) {
        try {
          await client.close();
          logger.info('Replica MongoDB connection closed', { replicaId });
        } catch (error) {
          logger.error('Failed to close replica connection', { 
            replicaId, 
            error: error.message 
          });
        }
      }

      // Close shard connections
      for (const [shardId, client] of this.shardClients) {
        try {
          await client.close();
          logger.info('Shard MongoDB connection closed', { shardId });
        } catch (error) {
          logger.error('Failed to close shard connection', { 
            shardId, 
            error: error.message 
          });
        }
      }

      this.replicaClients.clear();
      this.shardClients.clear();
      this.isInitialized = false;

      logger.info('All MongoDB connections closed');
    } catch (error) {
      logger.error('Error during MongoDB shutdown', { error: error.message });
      throw error;
    }
  }
}

// Export singleton instance
export const mongoManager = new MongoManager();

// Export default configuration
export const defaultMongoConfig: MongoConfig = {
  primary: {
    uri: process.env.MONGODB_PRIMARY_URI || 'mongodb://localhost:27017',
    database: process.env.MONGODB_DATABASE || 'mmorpg',
    options: {
      minPoolSize: 5,
      maxPoolSize: 50,
      maxIdleTimeMS: 30000,
      waitQueueTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      retryReads: true,
      compressors: ['snappy', 'zlib'],
      zlibCompressionLevel: 6,
      appName: 'MMORPG-Backend'
    }
  },
  replicas: [],
  shards: [],
  connectionPool: {
    minPoolSize: 5,
    maxPoolSize: 50,
    maxIdleTimeMS: 30000,
    waitQueueTimeoutMS: 5000
  }
};
