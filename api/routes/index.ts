import { Router } from "express";
import { playerController } from "../controllers/playerController";
import { worldController } from "../controllers/worldController";
import { healthCheckerMiddleware } from "../../utils/healthChecker";
import { makeRedisHealthCheck } from "../../utils/healthchecks/redisHealthCheck";
import logger from "../../logging/logger";
import { Redis } from "ioredis";
import {
  validate,
  validateUUID,
  validatePagination,
} from "../middleware/validation";
import {
  authRateLimit,
  playerActionRateLimit,
  adminRateLimit,
  generalRateLimit,
} from "../middleware/rateLimiting";
import {
  verifyToken,
  requirePlayer,
  requireAdmin,
  optionalAuth,
} from "../middleware/auth";
import {
  insertPlayerSchema,
  updatePlayerSchema,
  insertRegionSchema,
  insertGameEventSchema,
} from "@shared/schema";

const redisClient = new Redis();
const healthChecks = [makeRedisHealthCheck(redisClient)];
const router = Router();
const myLogger = logger();

// Apply general rate limiting to all API routes
router.use(generalRateLimit);

// Health check endpoint
router.get("/api/health", healthCheckerMiddleware(healthChecks, myLogger, redisClient));

// Player routes
const playerRoutes = Router();

playerRoutes.post(
  "/",
  authRateLimit,
  validate({ body: insertPlayerSchema }),
  playerController.createPlayer,
);

playerRoutes.get(
  "/:id",
  validateUUID("id"),
  optionalAuth,
  playerController.getPlayer,
);

playerRoutes.use(
  verifyToken as unknown as import("express").RequestHandler,
  requirePlayer as unknown as import("express").RequestHandler,
);

playerRoutes.put(
  "/:id",
  playerActionRateLimit,
  validateUUID("id"),
  validate({ body: updatePlayerSchema }),
  playerController.updatePlayer,
);

playerRoutes.post(
  "/:id/move",
  playerActionRateLimit,
  validateUUID("id"),
  playerController.movePlayer,
);

playerRoutes.delete("/:id", validateUUID("id"), playerController.deletePlayer);

playerRoutes.get(
  "/",
  requireAdmin,
  adminRateLimit,
  validatePagination,
  playerController.getOnlinePlayers,
);

playerRoutes.get(
  "/region/:regionId",
  requireAdmin,
  adminRateLimit,
  playerController.getPlayersByRegion,
);

router.use("/players", playerRoutes);

// World routes
const worldRoutes = Router();

// Public world routes
worldRoutes.get("/regions", optionalAuth, worldController.getAllRegions);

worldRoutes.get(
  "/regions/:id",
  validateUUID("id"),
  optionalAuth,
  worldController.getRegion,
);

worldRoutes.post(
  "/events",
  playerActionRateLimit,
  validate({ body: insertGameEventSchema }),
  worldController.logGameEvent,
);

worldRoutes.get("/events", validatePagination, worldController.getGameEvents);

worldRoutes.post(
  "/regions",
  requireAdmin,
  adminRateLimit,
  validate({ body: insertRegionSchema }),
  worldController.createRegion,
);

worldRoutes.put(
  "/regions/:id/status",
  requireAdmin,
  adminRateLimit,
  validateUUID("id"),
  worldController.updateRegionStatus,
);

worldRoutes.get(
  "/regions/server/:serverNode",
  requireAdmin,
  adminRateLimit,
  worldController.getRegionsByServerNode,
);

router.use("/world", worldRoutes);

// Real-time game action routes
const gameRoutes = Router();
gameRoutes.use(verifyToken, requirePlayer, playerActionRateLimit);

// Combat endpoints
gameRoutes.post("/combat/attack", (req, res) => {
  // Combat logic would be handled by Unity ECS
  // This endpoint validates and forwards to event bus
  res.json({ message: "Attack registered" });
});

// Chat endpoints
gameRoutes.post("/chat/message", (req, res) => {
  // Chat message validation and broadcast
  res.json({ message: "Message sent" });
});

// Trading endpoints
gameRoutes.post("/trade/initiate", (req, res) => {
  // Trade initiation logic
  res.json({ message: "Trade initiated" });
});

router.use("/game", gameRoutes);

// Admin routes
const adminRoutes = Router();

adminRoutes.use(
  verifyToken as unknown as import("express").RequestHandler,
  requireAdmin as unknown as import("express").RequestHandler,
  adminRateLimit,
);

adminRoutes.get("/stats/overview", (req, res) => {
  // Return overall game statistics
  res.json({
    totalPlayers: 0,
    onlinePlayers: 0,
    activeRegions: 0,
    totalEvents: 0,
  });
});

adminRoutes.get("/players/search", (req, res) => {
  // Advanced player search functionality
  res.json({ players: [] });
});

adminRoutes.post("/maintenance/mode", (req, res) => {
  // Enable/disable maintenance mode
  res.json({ message: "Maintenance mode updated" });
});

router.use("/admin", adminRoutes);

// Error handling middleware
router.use((error: any, req: any, res: any, next: any) => {
  console.error("API Error:", error);
  res.status(error.status || 500).json({
    error: error.message || "Internal server error",
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// Placeholder functions
async function getTotalPlayers() {
  return 1000;
}

async function getOnlinePlayers() {
  return 200;
}

async function getActiveRegions() {
  return 50;
}

async function searchPlayers(query: string) {
  // 'query' is used for demonstration, but not read in this mock
  return [
    { id: "1", username: "Player1" },
    { id: "2", username: "Player2" },
  ];
}

export default router;
async function getTotalEvents() {
  // Placeholder: Replace with actual DB query in production
  return 5000;
}
