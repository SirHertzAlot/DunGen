import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import logger from "../../logging/logger";
import { eventBus } from "../pubsub/eventBus";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

/**
 * Event Queue for processing game events asynchronously
 * Handles high-throughput event processing with retry logic and dead letter queues
 */

export class EventQueue {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private isInitialized = false;
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
    this.setupQueues();
  }

  private setupQueues() {
    const queueConfigs = [
      {
        name: "player-events",
        priority: "high",
        concurrency: 10,
        retries: 3,
      },
      {
        name: "world-events",
        priority: "medium",
        concurrency: 5,
        retries: 2,
      },
      {
        name: "combat-events",
        priority: "high",
        concurrency: 15,
        retries: 3,
      },
      {
        name: "chat-events",
        priority: "medium",
        concurrency: 20,
        retries: 1,
      },
      {
        name: "system-events",
        priority: "low",
        concurrency: 3,
        retries: 5,
      },
      {
        name: "analytics-events",
        priority: "low",
        concurrency: 5,
        retries: 1,
      },
    ];

    queueConfigs.forEach((config) => {
      const queue = new Queue(config.name, {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: config.retries,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        },
      });

      this.queues.set(config.name, queue);
      this.logger.info(`Created queue: ${config.name}`);
    });
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Test Redis connection
      await redis.ping();
      this.logger.info("Redis connection established for event queue");

      this.isInitialized = true;
    } catch (error) {
      this.logger.error("Failed to initialize event queue", {
        error: error.message,
      });
      throw error;
    }
  }

  async add(eventType: string, data: any, options?: any) {
    const queueName = this.getQueueName(eventType);
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue not found for event type: ${eventType}`);
    }

    const jobOptions = {
      priority: this.getPriority(eventType),
      delay: options?.delay || 0,
      ...options,
    };

    try {
      const job = await queue.add(
        eventType,
        {
          eventType,
          data,
          timestamp: Date.now(),
          metadata: options?.metadata || {},
        },
        jobOptions,
      );

      this.logger.debug("Event queued", {
        jobId: job.id,
        eventType,
        queue: queueName,
      });

      return job.id;
    } catch (error) {
      this.logger.error("Failed to queue event", {
        eventType,
        error: error.message,
      });
      throw error;
    }
  }

  process() {
    this.queues.forEach((queue, queueName) => {
      const worker = new Worker(
        queueName,
        async (job: Job) => {
          return this.processJob(job);
        },
        {
          connection: redis,
          concurrency: this.getConcurrency(queueName),
        },
      );

      // Worker event handlers
      worker.on("completed", (job) => {
        this.logger.debug("Job completed", {
          jobId: job.id,
          queue: queueName,
          duration: Date.now() - job.timestamp,
        });
      });

      worker.on("failed", (job, err) => {
        this.logger.error("Job failed", {
          jobId: job?.id,
          queue: queueName,
          error: err.message,
          attempts: job?.attemptsMade,
        });
      });

      worker.on("stalled", (jobId) => {
        this.logger.warn("Job stalled", {
          jobId,
          queue: queueName,
        });
      });

      this.workers.set(queueName, worker);
      this.logger.info(`Started worker for queue: ${queueName}`);
    });
  }

  private async processJob(job: Job): Promise<any> {
    const { eventType, data, metadata } = job.data;

    try {
      this.logger.debug("Processing job", {
        jobId: job.id,
        eventType,
        attempts: job.attemptsMade + 1,
      });

      // Route event to appropriate handler based on type
      const result = await this.routeEvent(eventType, data, metadata);

      // Publish processed event to event bus for real-time subscribers
      await eventBus.publish(`processed.${eventType}`, {
        ...result,
        jobId: job.id,
        processedAt: Date.now(),
      });

      return result;
    } catch (error) {
      this.logger.error("Job processing failed", {
        jobId: job.id,
        eventType,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  private async routeEvent(
    eventType: string,
    data: any,
    metadata: any,
  ): Promise<any> {
    const [domain, action] = eventType.split(".");

    switch (domain) {
      case "player":
        return this.processPlayerEvent(action, data, metadata);

      case "world":
        return this.processWorldEvent(action, data, metadata);

      case "combat":
        return this.processCombatEvent(action, data, metadata);

      case "chat":
        return this.processChatEvent(action, data, metadata);

      case "system":
        return this.processSystemEvent(action, data, metadata);

      case "analytics":
        return this.processAnalyticsEvent(action, data, metadata);

      default:
        logger.warn("Unknown event domain", { eventType, domain });
        return { processed: false, reason: "Unknown domain" };
    }
  }

  private async processPlayerEvent(
    action: string,
    data: any,
    metadata: any,
  ): Promise<any> {
    // Forward to Unity ECS for authoritative processing
    await eventBus.publish("unity.player", {
      action,
      data,
      metadata,
      timestamp: Date.now(),
    });

    return { processed: true, action, playerId: data.playerId };
  }

  private async processWorldEvent(
    action: string,
    data: any,
    metadata: any,
  ): Promise<any> {
    // Forward to Unity ECS world system
    await eventBus.publish("unity.world", {
      action,
      data,
      metadata,
      timestamp: Date.now(),
    });

    return { processed: true, action, regionId: data.regionId };
  }

  private async processCombatEvent(
    action: string,
    data: any,
    metadata: any,
  ): Promise<any> {
    // Forward to Unity ECS combat system
    await eventBus.publish("unity.combat", {
      action,
      data,
      metadata,
      timestamp: Date.now(),
    });

    return { processed: true, action, combatId: data.combatId };
  }

  private async processChatEvent(
    action: string,
    data: any,
    metadata: any,
  ): Promise<any> {
    // Broadcast chat messages immediately
    await eventBus.publish("chat.broadcast", {
      action,
      data,
      metadata,
      timestamp: Date.now(),
    });

    return { processed: true, action, messageId: data.messageId };
  }

  private async processSystemEvent(
    action: string,
    data: any,
    metadata: any,
  ): Promise<any> {
    // Handle system-level events (maintenance, updates, etc.)
    this.logger.info("Processing system event", { action, data });

    return { processed: true, action, systemEvent: true };
  }

  private async processAnalyticsEvent(
    action: string,
    data: any,
    metadata: any,
  ): Promise<any> {
    // Store analytics data for reporting
    this.logger.debug("Processing analytics event", { action, data });

    return { processed: true, action, analyticsEvent: true };
  }

  private getQueueName(eventType: string): string {
    const [domain] = eventType.split(".");

    const queueMap: { [key: string]: string } = {
      player: "player-events",
      world: "world-events",
      combat: "combat-events",
      chat: "chat-events",
      system: "system-events",
      analytics: "analytics-events",
    };

    return queueMap[domain] || "system-events";
  }

  private getPriority(eventType: string): number {
    const priorities: { [key: string]: number } = {
      combat: 10,
      "player.moved": 9,
      "player.health_changed": 8,
      chat: 5,
      world: 4,
      analytics: 1,
      system: 3,
    };

    const [domain, action] = eventType.split(".");
    return priorities[eventType] || priorities[domain] || 5;
  }

  private getConcurrency(queueName: string): number {
    const concurrency: { [key: string]: number } = {
      "player-events": 10,
      "world-events": 5,
      "combat-events": 15,
      "chat-events": 20,
      "system-events": 3,
      "analytics-events": 5,
    };

    return concurrency[queueName] || 5;
  }

  getStats() {
    const stats: { [key: string]: any } = {};

    this.queues.forEach(async (queue, name) => {
      try {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();

        stats[name] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
        };
      } catch (error) {
        stats[name] = { error: error.message };
      }
    });

    return stats;
  }

  async shutdown() {
    this.logger.info("Shutting down event queue...");

    // Close all workers
    for (const [name, worker] of this.workers) {
      try {
        await worker.close();
        this.logger.info(`Closed worker: ${name}`);
      } catch (error) {
        this.logger.error(`Failed to close worker ${name}`, {
          error: error.message,
        });
      }
    }

    // Close all queues
    for (const [name, queue] of this.queues) {
      try {
        await queue.close();
        this.logger.info(`Closed queue: ${name}`);
      } catch (error) {
        this.logger.error(`Failed to close queue ${name}`, {
          error: error.message,
        });
      }
    }

    // Close Redis connection
    await redis.quit();

    this.isInitialized = false;
    this.logger.info("Event queue shutdown complete");
  }
}

const log = logger({ serviceName: "EventQueue" });
export const eventQueue = new EventQueue(log);
