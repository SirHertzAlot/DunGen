import { z } from "zod";
import logger from "../../logging/logger";
import {
  playerMovementEventSchema,
  combatEventSchema,
  chatEventSchema,
} from "@shared/schema";

/**
 * Event Validator for ETL pipeline
 * Validates all incoming events against their schemas before processing
 */
export class EventValidator {
  private schemas: Map<string, z.ZodSchema> = new Map();
  private validationStats = {
    total: 0,
    passed: 0,
    failed: 0,
    byType: new Map<string, { passed: number; failed: number }>(),
  };

  constructor(logger: ILogger) {
    this.logger = logger;
    this.setupSchemas();
  }

  private setupSchemas() {
    // Player event schemas
    this.schemas.set(
      "player.created",
      z.object({
        playerId: z.string().uuid(),
        username: z.string().min(3).max(50),
        email: z.string().email(),
        regionId: z.string(),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "player.updated",
      z.object({
        playerId: z.string().uuid(),
        changes: z.record(z.any()),
        timestamp: z.number(),
      }),
    );

    this.schemas.set("player.moved", playerMovementEventSchema);

    this.schemas.set("player.combat", combatEventSchema);

    this.schemas.set(
      "player.level_up",
      z.object({
        playerId: z.string().uuid(),
        previousLevel: z.number().min(1),
        newLevel: z.number().min(1),
        experienceGained: z.number().min(0),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "player.inventory_changed",
      z.object({
        playerId: z.string().uuid(),
        changeType: z.enum(["add", "remove", "move", "use", "trade"]),
        itemId: z.string().uuid(),
        quantity: z.number().min(1),
        fromSlot: z.number().min(0).optional(),
        toSlot: z.number().min(0).optional(),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "player.logged_in",
      z.object({
        playerId: z.string().uuid(),
        sessionId: z.string().uuid(),
        ipAddress: z.string(),
        userAgent: z.string().optional(),
        regionId: z.string(),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "player.logged_out",
      z.object({
        playerId: z.string().uuid(),
        sessionId: z.string().uuid(),
        duration: z.number().min(0),
        timestamp: z.number(),
      }),
    );

    // World event schemas
    this.schemas.set(
      "world.region_created",
      z.object({
        regionId: z.string(),
        name: z.string(),
        serverNode: z.string(),
        bounds: z.object({
          minX: z.number(),
          maxX: z.number(),
          minY: z.number(),
          maxY: z.number(),
        }),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "world.region_status_changed",
      z.object({
        regionId: z.string(),
        previousStatus: z.enum(["active", "maintenance", "offline"]),
        status: z.enum(["active", "maintenance", "offline"]),
        reason: z.string().optional(),
        duration: z.number().optional(),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "world.weather_changed",
      z.object({
        regionId: z.string(),
        previousWeather: z.string(),
        weatherType: z.string(),
        intensity: z.number().min(0).max(1),
        duration: z.number().min(0),
        effects: z.array(
          z.object({
            type: z.string(),
            modifier: z.number(),
          }),
        ),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "world.event_started",
      z.object({
        eventId: z.string().uuid(),
        eventType: z.string(),
        regionId: z.string().optional(),
        name: z.string(),
        description: z.string(),
        duration: z.number().min(0),
        isGlobal: z.boolean().default(false),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "world.resource_spawned",
      z.object({
        resourceId: z.string().uuid(),
        regionId: z.string(),
        resourceType: z.string(),
        quality: z.enum(["common", "uncommon", "rare", "epic", "legendary"]),
        position: z.object({
          x: z.number(),
          y: z.number(),
          z: z.number().default(0),
        }),
        respawnTime: z.number().min(0),
        timestamp: z.number(),
      }),
    );

    // Combat event schemas
    this.schemas.set(
      "combat.attack",
      z.object({
        combatId: z.string().uuid(),
        attackerId: z.string().uuid(),
        targetId: z.string().uuid(),
        skillId: z.string().optional(),
        damage: z.number().min(0),
        isCritical: z.boolean().default(false),
        regionId: z.string(),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "combat.spell_cast",
      z.object({
        combatId: z.string().uuid(),
        casterId: z.string().uuid(),
        spellId: z.string(),
        targets: z.array(z.string().uuid()),
        manaCost: z.number().min(0),
        effects: z.array(
          z.object({
            type: z.string(),
            value: z.number(),
          }),
        ),
        regionId: z.string(),
        timestamp: z.number(),
      }),
    );

    // Chat event schemas
    this.schemas.set("chat.message", chatEventSchema);

    this.schemas.set(
      "chat.whisper",
      z.object({
        senderId: z.string().uuid(),
        recipientId: z.string().uuid(),
        message: z.string().min(1).max(500),
        timestamp: z.number(),
      }),
    );

    // System event schemas
    this.schemas.set(
      "system.maintenance_start",
      z.object({
        reason: z.string(),
        estimatedDuration: z.number().min(0),
        affectedRegions: z.array(z.string()),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "system.server_status",
      z.object({
        serverNode: z.string(),
        status: z.enum(["online", "offline", "degraded"]),
        load: z.number().min(0).max(100),
        connections: z.number().min(0),
        timestamp: z.number(),
      }),
    );

    // Trade and economy schemas
    this.schemas.set(
      "trade.initiated",
      z.object({
        tradeId: z.string().uuid(),
        initiatorId: z.string().uuid(),
        targetId: z.string().uuid(),
        regionId: z.string(),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "trade.completed",
      z.object({
        tradeId: z.string().uuid(),
        participants: z.array(
          z.object({
            playerId: z.string().uuid(),
            items: z.array(
              z.object({
                itemId: z.string().uuid(),
                quantity: z.number().min(1),
              }),
            ),
            currency: z.number().min(0),
          }),
        ),
        timestamp: z.number(),
      }),
    );

    // Guild event schemas
    this.schemas.set(
      "guild.created",
      z.object({
        guildId: z.string().uuid(),
        name: z.string().min(1).max(100),
        leaderId: z.string().uuid(),
        timestamp: z.number(),
      }),
    );

    this.schemas.set(
      "guild.member_joined",
      z.object({
        guildId: z.string().uuid(),
        playerId: z.string().uuid(),
        invitedBy: z.string().uuid(),
        role: z.string().default("member"),
        timestamp: z.number(),
      }),
    );

    this.logger.info(
      `Event validator initialized with ${this.schemas.size} schemas`,
    );
  }

  async validate(eventType: string, data: any): Promise<ValidationResult> {
    this.validationStats.total++;

    const typeStats = this.validationStats.byType.get(eventType) || {
      passed: 0,
      failed: 0,
    };

    try {
      const schema = this.schemas.get(eventType);

      if (!schema) {
        this.logger.warn("No schema found for event type", { eventType });
        // Allow unknown event types but log them
        this.validationStats.passed++;
        typeStats.passed++;
        this.validationStats.byType.set(eventType, typeStats);

        return {
          isValid: true,
          errors: [],
          warnings: [`No schema defined for event type: ${eventType}`],
        };
      }

      const result = schema.parse(data);

      this.validationStats.passed++;
      typeStats.passed++;
      this.validationStats.byType.set(eventType, typeStats);

      this.logger.debug("Event validation passed", { eventType });

      return {
        isValid: true,
        errors: [],
        validatedData: result,
      };
    } catch (error) {
      this.validationStats.failed++;
      typeStats.failed++;
      this.validationStats.byType.set(eventType, typeStats);

      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => ({
          path: err.path.join("."),
          message: err.message,
          received: err.received,
        }));

        logger.warn("Event validation failed", {
          eventType,
          errors,
          data: JSON.stringify(data).substring(0, 200),
        });

        return {
          isValid: false,
          errors: errors.map((e) => e.message),
          details: errors,
        };
      }

      this.logger.error("Event validation error", {
        eventType,
        error: error.message,
      });

      return {
        isValid: false,
        errors: [error.message],
      };
    }
  }

  async validateBatch(
    events: Array<{ eventType: string; data: any }>,
  ): Promise<BatchValidationResult> {
    const results = await Promise.all(
      events.map(async (event, index) => ({
        index,
        eventType: event.eventType,
        result: await this.validate(event.eventType, event.data),
      })),
    );

    const valid = results.filter((r) => r.result.isValid);
    const invalid = results.filter((r) => !r.result.isValid);

    return {
      total: events.length,
      valid: valid.length,
      invalid: invalid.length,
      results,
      errors: invalid.map((r) => ({
        index: r.index,
        eventType: r.eventType,
        errors: r.result.errors,
      })),
    };
  }

  getValidationStats(): ValidationStats {
    return {
      ...this.validationStats,
      successRate:
        this.validationStats.total > 0
          ? (this.validationStats.passed / this.validationStats.total) * 100
          : 0,
      byType: Object.fromEntries(this.validationStats.byType),
    };
  }

  addCustomSchema(eventType: string, schema: z.ZodSchema): void {
    this.schemas.set(eventType, schema);
    this.logger.info("Added custom schema", { eventType });
  }

  removeSchema(eventType: string): boolean {
    const removed = this.schemas.delete(eventType);
    if (removed) {
      this.logger.info("Removed schema", { eventType });
    }
    return removed;
  }

  hasSchema(eventType: string): boolean {
    return this.schemas.has(eventType);
  }

  getAllEventTypes(): string[] {
    return Array.from(this.schemas.keys());
  }

  resetStats(): void {
    this.validationStats = {
      total: 0,
      passed: 0,
      failed: 0,
      byType: new Map(),
    };
    this.logger.info("Validation stats reset");
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  details?: any[];
  validatedData?: any;
}

export interface BatchValidationResult {
  total: number;
  valid: number;
  invalid: number;
  results: Array<{
    index: number;
    eventType: string;
    result: ValidationResult;
  }>;
  errors: Array<{
    index: number;
    eventType: string;
    errors: string[];
  }>;
}

export interface ValidationStats {
  total: number;
  passed: number;
  failed: number;
  successRate: number;
  byType: { [eventType: string]: { passed: number; failed: number } };
}

const log = logger({ serviceName: "EventValidator" });
export const eventValidator = new EventValidator(log);
