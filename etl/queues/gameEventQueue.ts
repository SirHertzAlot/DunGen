import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import logger from "../../logging/logger";
import { eventBus, GameEventMessage } from "../../cache/redisPubSub";
import { v4 as uuidv4 } from "uuid";

const log = logger({ serviceName: "GameEventQueue" });

// Job data interfaces
export interface PlayerActionJob {
  id: string;
  playerId: string;
  actionType: "move" | "combat" | "chat" | "trade" | "craft";
  data: any;
  regionId?: string;
  timestamp: number;
}

export interface WorldUpdateJob {
  id: string;
  regionId: string;
  updateType: "player_join" | "player_leave" | "region_event";
  data: any;
  timestamp: number;
}

// Queue processor interface for DRY principle
interface IQueueProcessor {
  processPlayerAction(job: Job<PlayerActionJob>): Promise<void>;
  processWorldUpdate(job: Job<WorldUpdateJob>): Promise<void>;
}

class GameEventQueueProcessor implements IQueueProcessor {
  private connection: Redis;
  private playerActionQueue: Queue<PlayerActionJob>;
  private worldUpdateQueue: Queue<WorldUpdateJob>;
  private playerActionWorker: Worker<PlayerActionJob>;
  private worldUpdateWorker: Worker<WorldUpdateJob>;

  constructor() {
    this.connection = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      maxRetriesPerRequest: null, // Required for BullMQ
    });

    // Initialize queues
    this.playerActionQueue = new Queue("playerActions", {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    });

    this.worldUpdateQueue = new Queue("worldUpdates", {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    });

    // Initialize workers
    this.playerActionWorker = new Worker<PlayerActionJob>(
      "playerActions",
      this.processPlayerAction.bind(this),
      { connection: this.connection },
    );

    this.worldUpdateWorker = new Worker<WorldUpdateJob>(
      "worldUpdates",
      this.processWorldUpdate.bind(this),
      { connection: this.connection },
    );

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.playerActionWorker.on("completed", (job) => {
      log.info("Player action job completed", {
        service: "GameEventQueue",
        jobId: job.id,
        playerId: job.data.playerId,
        actionType: job.data.actionType,
      });
    });

    this.playerActionWorker.on("failed", (job, error) => {
      log.error("Player action job failed", error, {
        service: "GameEventQueue",
        jobId: job?.id,
        playerId: job?.data?.playerId,
        actionType: job?.data?.actionType,
      });
    });

    this.worldUpdateWorker.on("completed", (job) => {
      log.info("World update job completed", {
        service: "GameEventQueue",
        jobId: job.id,
        regionId: job.data.regionId,
        updateType: job.data.updateType,
      });
    });

    this.worldUpdateWorker.on("failed", (job, error) => {
      log.error("World update job failed", error, {
        service: "GameEventQueue",
        jobId: job?.id,
        regionId: job?.data?.regionId,
        updateType: job?.data?.updateType,
      });
    });
  }

  // Add job to player action queue
  async addPlayerAction(
    actionData: Omit<PlayerActionJob, "id" | "timestamp">,
  ): Promise<void> {
    const jobData: PlayerActionJob = {
      ...actionData,
      id: uuidv4(),
      timestamp: Date.now(),
    };

    await this.playerActionQueue.add("process", jobData, {
      priority: this.getActionPriority(actionData.actionType),
    });

    log.debug("Player action added to queue", {
      service: "GameEventQueue",
      jobId: jobData.id,
      playerId: jobData.playerId,
      actionType: jobData.actionType,
    });
  }

  // Add job to world update queue
  async addWorldUpdate(
    updateData: Omit<WorldUpdateJob, "id" | "timestamp">,
  ): Promise<void> {
    const jobData: WorldUpdateJob = {
      ...updateData,
      id: uuidv4(),
      timestamp: Date.now(),
    };

    await this.worldUpdateQueue.add("process", jobData, {
      priority: this.getUpdatePriority(updateData.updateType),
    });

    log.debug("World update added to queue", {
      service: "GameEventQueue",
      jobId: jobData.id,
      regionId: jobData.regionId,
      updateType: jobData.updateType,
    });
  }

  // Process player actions and forward to unification layer
  async processPlayerAction(job: Job<PlayerActionJob>): Promise<void> {
    const { data } = job;

    log.debug("Processing player action", {
      service: "GameEventQueue",
      jobId: data.id,
      playerId: data.playerId,
      actionType: data.actionType,
    });

    // Transform job data to game event message
    const gameEvent: GameEventMessage = {
      id: data.id,
      type: `player.${data.actionType}`,
      playerId: data.playerId,
      regionId: data.regionId,
      data: data.data,
      timestamp: data.timestamp,
    };

    // Forward to unification layer via pub/sub
    await eventBus.publish("unification.events", gameEvent);

    // Also forward to persistence layer for audit logging
    await eventBus.publish("persistence.audit", gameEvent);
  }

  // Process world updates and coordinate between layers
  async processWorldUpdate(job: Job<WorldUpdateJob>): Promise<void> {
    const { data } = job;

    log.debug("Processing world update", {
      service: "GameEventQueue",
      jobId: data.id,
      regionId: data.regionId,
      updateType: data.updateType,
    });

    // Transform job data to game event message
    const gameEvent: GameEventMessage = {
      id: data.id,
      type: `world.${data.updateType}`,
      regionId: data.regionId,
      data: data.data,
      timestamp: data.timestamp,
    };

    // Forward to appropriate channels based on update type
    switch (data.updateType) {
      case "player_join":
      case "player_leave":
        await eventBus.publish("unification.player_events", gameEvent);
        await eventBus.publish("persistence.player_updates", gameEvent);
        break;
      case "region_event":
        await eventBus.publish("unification.region_events", gameEvent);
        await eventBus.publish("cache.region_updates", gameEvent);
        break;
    }
  }

  private getActionPriority(actionType: string): number {
    const priorities = {
      combat: 1, // Highest priority
      move: 2,
      trade: 3,
      chat: 4,
      craft: 5, // Lowest priority
    };
    return priorities[actionType as keyof typeof priorities] || 5;
  }

  private getUpdatePriority(updateType: string): number {
    const priorities = {
      player_leave: 1, // Highest priority
      player_join: 2,
      region_event: 3,
    };
    return priorities[updateType as keyof typeof priorities] || 3;
  }

  // Graceful shutdown
  async close(): Promise<void> {
    await Promise.all([
      this.playerActionWorker.close(),
      this.worldUpdateWorker.close(),
      this.playerActionQueue.close(),
      this.worldUpdateQueue.close(),
      this.connection.disconnect(),
    ]);

    log.info("Game event queue system closed", {
      service: "GameEventQueue",
    });
  }
}

export const gameEventQueue = new GameEventQueueProcessor();
