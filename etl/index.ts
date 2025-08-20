import express from "express";
import { eventBus } from "./pubsub/eventBus";
import { eventQueue } from "./queues/eventQueue";
import { playerTransformer } from "./transformers/playerTransformer";
import { worldTransformer } from "./transformers/worldTransformer";
import { eventValidator } from "./validation/eventValidator";
import { logger } from "../logging/logger";
import { healthCheckerMiddleware } from "../utils/healthChecker";

/**
 * ETL (Extract, Transform, Load) service for MMORPG backend
 *
 * This service acts as a data pipeline between the API layer and the game logic layer.
 * It validates, transforms, and routes events through the system.
 */

class ETLService {
  private app: express.Application;
  private isInitialized = false;
  private logger = logger({
    serviceName: "ETLService",
    consoleVerbose: "true",
  });

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info("ETL Request", {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      next();
    });

    // Health checker middleware
    this.app.use(healthCheckerMiddleware(eventBus, this.logger));
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get("/health", async (req, res) => {
      let redisStatus = "unknown";
      res.json({
        status: "healthy",
        service: "etl",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        queues: {
          eventQueue: eventQueue.getStats(),
        },
      });
    });

    // Event ingestion endpoint
    this.app.post("/events/ingest", async (req, res) => {
      try {
        const { eventType, data, metadata } = req.body;

        // Validate the event
        const validationResult = await eventValidator.validate(eventType, data);
        if (!validationResult.isValid) {
          return res.status(400).json({
            error: "Event validation failed",
            details: validationResult.errors,
          });
        }

        // Transform the event based on type
        let transformedData;
        switch (eventType.split(".")[0]) {
          case "player":
            transformedData = await playerTransformer.transform(
              eventType,
              data,
            );
            break;
          case "world":
            transformedData = await worldTransformer.transform(eventType, data);
            break;
          default:
            transformedData = data; // No transformation needed
        }

        // Queue the event for processing
        await eventQueue.add(eventType, {
          originalData: data,
          transformedData,
          metadata: {
            ...metadata,
            ingestedAt: Date.now(),
            source: "etl",
          },
        });

        res.json({
          success: true,
          eventId: generateEventId(),
          message: "Event queued for processing",
        });
      } catch (error) {
        logger.error("Event ingestion failed", {
          error: error.message,
          body: req.body,
        });
        res.status(500).json({ error: "Event processing failed" });
      }
    });

    // Bulk event ingestion
    this.app.post("/events/bulk", async (req, res) => {
      try {
        const { events } = req.body;

        if (!Array.isArray(events) || events.length === 0) {
          return res.status(400).json({ error: "Events array is required" });
        }

        if (events.length > 1000) {
          return res
            .status(400)
            .json({ error: "Maximum 1000 events per batch" });
        }

        const results = await Promise.allSettled(
          events.map(async (event) => {
            const { eventType, data, metadata } = event;

            const validationResult = await eventValidator.validate(
              eventType,
              data,
            );
            if (!validationResult.isValid) {
              throw new Error(
                `Validation failed: ${validationResult.errors.join(", ")}`,
              );
            }

            let transformedData;
            switch (eventType.split(".")[0]) {
              case "player":
                transformedData = await playerTransformer.transform(
                  eventType,
                  data,
                );
                break;
              case "world":
                transformedData = await worldTransformer.transform(
                  eventType,
                  data,
                );
                break;
              default:
                transformedData = data;
            }

            await eventQueue.add(eventType, {
              originalData: data,
              transformedData,
              metadata: {
                ...metadata,
                ingestedAt: Date.now(),
                source: "etl-bulk",
              },
            });

            return { success: true, eventId: generateEventId() };
          }),
        );

        const successful = results.filter(
          (r) => r.status === "fulfilled",
        ).length;
        const failed = results.filter((r) => r.status === "rejected").length;

        res.json({
          processed: events.length,
          successful,
          failed,
          results: results.map((r) =>
            r.status === "fulfilled" ? r.value : { error: r.reason.message },
          ),
        });
      } catch (error) {
        logger.error("Bulk event ingestion failed", { error: error.message });
        res.status(500).json({ error: "Bulk event processing failed" });
      }
    });

    // Event republishing (for failed events)
    this.app.post("/events/republish", async (req, res) => {
      try {
        const { eventType, data } = req.body;

        await eventBus.publish(eventType, data);

        res.json({
          success: true,
          message: "Event republished",
        });
      } catch (error) {
        logger.error("Event republishing failed", { error: error.message });
        res.status(500).json({ error: "Event republishing failed" });
      }
    });

    // ETL pipeline status
    this.app.get("/status", async (req, res) => {
      try {
        const queueStats = eventQueue.getStats();
        const eventBusStats = await eventBus.getStats();

        res.json({
          pipeline: {
            status: "running",
            queues: queueStats,
            eventBus: eventBusStats,
            lastProcessed: new Date().toISOString(),
          },
        });
      } catch (error) {
        logger.error("Failed to get ETL status", { error: error.message });
        res.status(500).json({ error: "Failed to get status" });
      }
    });
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize event bus
      await eventBus.initialize();

      // Initialize event queue
      await eventQueue.initialize();

      // Start queue processing
      eventQueue.process();

      this.isInitialized = true;
      logger.info("ETL service initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize ETL service", {
        error: error.message,
      });
      throw error;
    }
  }

  async start(port: number = 8001) {
    await this.initialize();

    return new Promise<void>((resolve, reject) => {
      this.app
        .listen(port, "0.0.0.0", () => {
          logger.info(`ETL service listening on port ${port}`);
          resolve();
        })
        .on("error", reject);
    });
  }

  async shutdown() {
    logger.info("Shutting down ETL service...");

    await eventQueue.shutdown();
    await eventBus.shutdown();

    this.isInitialized = false;
    logger.info("ETL service shut down successfully");
  }
}

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Export singleton instance
export const etlService = new ETLService();

// Auto-start if this file is run directly
if (require.main === module) {
  const port = parseInt(process.env.ETL_PORT || "8001");

  etlService.start(port).catch((error) => {
    logger.error("Failed to start ETL service", { error: error.message });
    process.exit(1);
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    await etlService.shutdown();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    await etlService.shutdown();
    process.exit(0);
  });
}
