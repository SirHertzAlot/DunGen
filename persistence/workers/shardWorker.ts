import { Worker } from 'worker_threads';
import { logger } from '../../logging/logger';
import { EventEmitter } from 'events';

/**
 * Shard Worker for MongoDB horizontal sharding operations
 * Handles shard management, rebalancing, and data distribution
 */

export interface ShardConfig {
  shardId: string;
  connectionString: string;
  regionIds: string[];
  maxConnections: number;
  priority: number;
  status: 'active' | 'draining' | 'offline';
}

export interface ShardingStrategy {
  type: 'range' | 'hash' | 'zone';
  shardKey: string;
  chunks: ShardChunk[];
}

export interface ShardChunk {
  id: string;
  shardId: string;
  minKey: any;
  maxKey: any;
  size: number;
  docCount: number;
}

export interface RebalanceOperation {
  id: string;
  fromShard: string;
  toShard: string;
  chunks: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  progress: number;
}

export class ShardWorker extends EventEmitter {
  private shards: Map<string, ShardConfig> = new Map();
  private workers: Map<string, Worker> = new Map();
  private strategy: ShardingStrategy;
  private rebalanceOperations: Map<string, RebalanceOperation> = new Map();
  private isRunning = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(strategy: ShardingStrategy) {
    super();
    this.strategy = strategy;
  }

  async initialize(shardConfigs: ShardConfig[]): Promise<void> {
    try {
      // Initialize shards
      for (const config of shardConfigs) {
        await this.addShard(config);
      }

      // Start monitoring
      this.startMonitoring();
      
      this.isRunning = true;
      logger.info('Shard worker initialized', { 
        shardCount: this.shards.size,
        strategy: this.strategy.type 
      });

      this.emit('initialized', { shardCount: this.shards.size });
    } catch (error) {
      logger.error('Failed to initialize shard worker', { error: error.message });
      throw error;
    }
  }

  async addShard(config: ShardConfig): Promise<void> {
    try {
      // Validate shard configuration
      this.validateShardConfig(config);

      // Create worker for shard operations
      const worker = new Worker(__filename, {
        workerData: {
          operation: 'shard_operations',
          config
        }
      });

      worker.on('message', (message) => {
        this.handleWorkerMessage(config.shardId, message);
      });

      worker.on('error', (error) => {
        logger.error('Shard worker error', { 
          shardId: config.shardId, 
          error: error.message 
        });
        this.emit('shard_error', { shardId: config.shardId, error });
      });

      this.shards.set(config.shardId, config);
      this.workers.set(config.shardId, worker);

      logger.info('Shard added', { 
        shardId: config.shardId, 
        regions: config.regionIds 
      });

      this.emit('shard_added', { shardId: config.shardId });
    } catch (error) {
      logger.error('Failed to add shard', { 
        shardId: config.shardId, 
        error: error.message 
      });
      throw error;
    }
  }

  async removeShard(shardId: string): Promise<void> {
    try {
      const shard = this.shards.get(shardId);
      if (!shard) {
        throw new Error(`Shard ${shardId} not found`);
      }

      // Start draining the shard
      shard.status = 'draining';
      await this.drainShard(shardId);

      // Remove worker
      const worker = this.workers.get(shardId);
      if (worker) {
        await worker.terminate();
        this.workers.delete(shardId);
      }

      this.shards.delete(shardId);

      logger.info('Shard removed', { shardId });
      this.emit('shard_removed', { shardId });
    } catch (error) {
      logger.error('Failed to remove shard', { 
        shardId, 
        error: error.message 
      });
      throw error;
    }
  }

  async rebalanceShards(targetDistribution?: Record<string, number>): Promise<string> {
    try {
      const operationId = `rebalance_${Date.now()}`;
      
      // Analyze current distribution
      const currentDistribution = await this.analyzeShardDistribution();
      const targetDist = targetDistribution || this.calculateOptimalDistribution();
      
      // Plan rebalancing operations
      const rebalancePlan = this.createRebalancePlan(currentDistribution, targetDist);
      
      const operation: RebalanceOperation = {
        id: operationId,
        fromShard: '',
        toShard: '',
        chunks: rebalancePlan.chunks,
        status: 'pending',
        startTime: new Date(),
        progress: 0
      };

      this.rebalanceOperations.set(operationId, operation);
      
      // Execute rebalancing in background
      this.executeRebalance(operationId, rebalancePlan);
      
      logger.info('Rebalance operation started', { 
        operationId, 
        chunksToMove: rebalancePlan.chunks.length 
      });

      return operationId;
    } catch (error) {
      logger.error('Failed to start rebalance', { error: error.message });
      throw error;
    }
  }

  async getShardStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};
    
    for (const [shardId, config] of this.shards) {
      const worker = this.workers.get(shardId);
      if (worker) {
        try {
          const shardStats = await this.requestWorkerStats(worker);
          stats[shardId] = {
            ...config,
            ...shardStats,
            isHealthy: await this.checkShardHealth(shardId)
          };
        } catch (error) {
          stats[shardId] = {
            ...config,
            error: error.message,
            isHealthy: false
          };
        }
      }
    }

    return stats;
  }

  async getRebalanceStatus(operationId: string): Promise<RebalanceOperation | null> {
    return this.rebalanceOperations.get(operationId) || null;
  }

  async optimizeShardKey(collection: string): Promise<string> {
    try {
      // Analyze query patterns and data distribution
      const analysis = await this.analyzeQueryPatterns(collection);
      
      // Determine optimal shard key
      const recommendations = this.generateShardKeyRecommendations(analysis);
      
      logger.info('Shard key optimization completed', { 
        collection, 
        recommendations: recommendations.slice(0, 3) 
      });

      return recommendations[0]?.key || this.strategy.shardKey;
    } catch (error) {
      logger.error('Failed to optimize shard key', { 
        collection, 
        error: error.message 
      });
      throw error;
    }
  }

  private validateShardConfig(config: ShardConfig): void {
    if (!config.shardId || typeof config.shardId !== 'string') {
      throw new Error('Invalid shard ID');
    }

    if (!config.connectionString || typeof config.connectionString !== 'string') {
      throw new Error('Invalid connection string');
    }

    if (!Array.isArray(config.regionIds)) {
      throw new Error('Invalid region IDs');
    }

    if (typeof config.maxConnections !== 'number' || config.maxConnections <= 0) {
      throw new Error('Invalid max connections');
    }
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.monitorShards();
      } catch (error) {
        logger.error('Shard monitoring error', { error: error.message });
      }
    }, 60000); // Monitor every minute
  }

  private async monitorShards(): Promise<void> {
    for (const [shardId] of this.shards) {
      const isHealthy = await this.checkShardHealth(shardId);
      if (!isHealthy) {
        logger.warn('Unhealthy shard detected', { shardId });
        this.emit('shard_unhealthy', { shardId });
      }
    }

    // Check if rebalancing is needed
    const distribution = await this.analyzeShardDistribution();
    if (this.needsRebalancing(distribution)) {
      logger.info('Shard rebalancing recommended');
      this.emit('rebalance_recommended', { distribution });
    }
  }

  private async checkShardHealth(shardId: string): Promise<boolean> {
    try {
      const worker = this.workers.get(shardId);
      if (!worker) return false;

      const response = await this.sendWorkerMessage(worker, {
        operation: 'health_check'
      });

      return response.healthy === true;
    } catch (error) {
      return false;
    }
  }

  private async drainShard(shardId: string): Promise<void> {
    logger.info('Starting shard drain', { shardId });
    
    const chunks = this.strategy.chunks.filter(chunk => chunk.shardId === shardId);
    const availableShards = Array.from(this.shards.keys()).filter(id => 
      id !== shardId && this.shards.get(id)?.status === 'active'
    );

    if (availableShards.length === 0) {
      throw new Error('No available shards for draining');
    }

    // Move chunks to other shards
    for (const chunk of chunks) {
      const targetShard = this.selectTargetShard(availableShards, chunk);
      await this.moveChunk(chunk.id, shardId, targetShard);
    }

    logger.info('Shard drain completed', { shardId, chunksMovd: chunks.length });
  }

  private async analyzeShardDistribution(): Promise<Record<string, any>> {
    const distribution: Record<string, any> = {};
    
    for (const [shardId] of this.shards) {
      const chunks = this.strategy.chunks.filter(chunk => chunk.shardId === shardId);
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
      const totalDocs = chunks.reduce((sum, chunk) => sum + chunk.docCount, 0);
      
      distribution[shardId] = {
        chunkCount: chunks.length,
        totalSize,
        totalDocs,
        averageChunkSize: chunks.length > 0 ? totalSize / chunks.length : 0
      };
    }

    return distribution;
  }

  private calculateOptimalDistribution(): Record<string, number> {
    const activeShards = Array.from(this.shards.values())
      .filter(shard => shard.status === 'active');
    
    const totalShards = activeShards.length;
    const distribution: Record<string, number> = {};
    
    // Equal distribution by default
    activeShards.forEach(shard => {
      distribution[shard.shardId] = 1 / totalShards;
    });

    return distribution;
  }

  private createRebalancePlan(
    current: Record<string, any>, 
    target: Record<string, number>
  ): { chunks: string[]; operations: Array<{ from: string; to: string; chunk: string }> } {
    const operations: Array<{ from: string; to: string; chunk: string }> = [];
    const chunks: string[] = [];

    // Simple rebalancing logic - move chunks from overloaded to underloaded shards
    const sortedShards = Object.entries(current).sort((a, b) => b[1].totalSize - a[1].totalSize);
    const overloaded = sortedShards.slice(0, Math.ceil(sortedShards.length / 2));
    const underloaded = sortedShards.slice(Math.ceil(sortedShards.length / 2));

    for (const [fromShardId] of overloaded) {
      for (const [toShardId] of underloaded) {
        const candidateChunks = this.strategy.chunks
          .filter(chunk => chunk.shardId === fromShardId)
          .sort((a, b) => a.size - b.size) // Move smaller chunks first
          .slice(0, 2); // Limit chunks per operation

        for (const chunk of candidateChunks) {
          operations.push({
            from: fromShardId,
            to: toShardId,
            chunk: chunk.id
          });
          chunks.push(chunk.id);
        }
        
        if (operations.length >= 10) break; // Limit operations per rebalance
      }
      
      if (operations.length >= 10) break;
    }

    return { chunks, operations };
  }

  private async executeRebalance(operationId: string, plan: any): Promise<void> {
    const operation = this.rebalanceOperations.get(operationId);
    if (!operation) return;

    try {
      operation.status = 'running';
      
      for (let i = 0; i < plan.operations.length; i++) {
        const op = plan.operations[i];
        await this.moveChunk(op.chunk, op.from, op.to);
        
        operation.progress = ((i + 1) / plan.operations.length) * 100;
        this.emit('rebalance_progress', { operationId, progress: operation.progress });
      }

      operation.status = 'completed';
      operation.endTime = new Date();
      operation.progress = 100;
      
      logger.info('Rebalance operation completed', { operationId });
      this.emit('rebalance_completed', { operationId });
    } catch (error) {
      operation.status = 'failed';
      operation.endTime = new Date();
      
      logger.error('Rebalance operation failed', { 
        operationId, 
        error: error.message 
      });
      this.emit('rebalance_failed', { operationId, error: error.message });
    }
  }

  private async moveChunk(chunkId: string, fromShard: string, toShard: string): Promise<void> {
    logger.debug('Moving chunk', { chunkId, fromShard, toShard });
    
    const fromWorker = this.workers.get(fromShard);
    const toWorker = this.workers.get(toShard);
    
    if (!fromWorker || !toWorker) {
      throw new Error('Worker not found for chunk move operation');
    }

    // Implementation would involve actual data movement
    // For now, just update chunk metadata
    const chunk = this.strategy.chunks.find(c => c.id === chunkId);
    if (chunk) {
      chunk.shardId = toShard;
    }

    // Simulate chunk move delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private selectTargetShard(availableShards: string[], chunk: ShardChunk): string {
    // Simple selection - choose shard with least data
    const shardSizes = availableShards.map(shardId => {
      const chunks = this.strategy.chunks.filter(c => c.shardId === shardId);
      return {
        shardId,
        totalSize: chunks.reduce((sum, c) => sum + c.size, 0)
      };
    });

    shardSizes.sort((a, b) => a.totalSize - b.totalSize);
    return shardSizes[0].shardId;
  }

  private needsRebalancing(distribution: Record<string, any>): boolean {
    const sizes = Object.values(distribution).map((d: any) => d.totalSize);
    const avgSize = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
    const maxDeviation = Math.max(...sizes.map(size => Math.abs(size - avgSize)));
    
    return maxDeviation > avgSize * 0.3; // 30% deviation threshold
  }

  private async analyzeQueryPatterns(collection: string): Promise<any> {
    // Placeholder for query pattern analysis
    return {
      topQueries: [],
      fieldUsage: {},
      indexUsage: {}
    };
  }

  private generateShardKeyRecommendations(analysis: any): Array<{ key: string; score: number }> {
    // Placeholder for shard key recommendation logic
    return [
      { key: 'regionId', score: 0.9 },
      { key: 'playerId', score: 0.7 },
      { key: 'timestamp', score: 0.5 }
    ];
  }

  private handleWorkerMessage(shardId: string, message: any): void {
    logger.debug('Worker message received', { shardId, type: message.type });
    
    switch (message.type) {
      case 'stats_update':
        this.emit('shard_stats', { shardId, stats: message.data });
        break;
      case 'error':
        this.emit('shard_error', { shardId, error: message.error });
        break;
      default:
        logger.warn('Unknown worker message type', { type: message.type });
    }
  }

  private async sendWorkerMessage(worker: Worker, message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker message timeout'));
      }, 5000);

      worker.once('message', (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      worker.postMessage(message);
    });
  }

  private async requestWorkerStats(worker: Worker): Promise<any> {
    return this.sendWorkerMessage(worker, { operation: 'get_stats' });
  }

  async shutdown(): Promise<void> {
    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Terminate all workers
    for (const [shardId, worker] of this.workers) {
      try {
        await worker.terminate();
        logger.info('Shard worker terminated', { shardId });
      } catch (error) {
        logger.error('Failed to terminate shard worker', { 
          shardId, 
          error: error.message 
        });
      }
    }

    this.workers.clear();
    this.shards.clear();
    
    logger.info('Shard worker shutdown completed');
  }
}

// Export singleton instance
export const shardWorker = new ShardWorker({
  type: 'hash',
  shardKey: 'regionId',
  chunks: []
});
