import { Router, Request, Response, NextFunction } from 'express';
import { playerController } from '../controllers/playerController';
import { worldController } from '../controllers/worldController';
import { validate, validateUUID, validatePagination } from '../middleware/validation';
import {
  authRateLimit,
  playerActionRateLimit,
  adminRateLimit
} from '../middleware/rateLimiting';
import {
  verifyToken,
  requirePlayer,
  requireAdmin
} from '../middleware/auth';
import { z } from 'zod';

// Minimal Zod schemas for demonstration
const insertPlayerSchema = z.object({});
const insertGameEventSchema = z.object({});
const insertRegionSchema = z.object({});

const router = Router();

// Health check route
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Player routes
const playerRoutes = Router();

playerRoutes.post(
  '/',
  authRateLimit,
  validate({ body: insertPlayerSchema }),
  playerController.createPlayer
);

playerRoutes.get(
  '/:id',
  validateUUID('id'),
  playerController.getPlayer
);

playerRoutes.use(verifyToken as unknown as import('express').RequestHandler, requirePlayer as unknown as import('express').RequestHandler);

playerRoutes.put(
  '/:id',
  playerActionRateLimit,
  validateUUID('id'),
  playerController.updatePlayer
);

playerRoutes.post(
  '/:id/move',
  playerActionRateLimit,
  validateUUID('id'),
  playerController.movePlayer
);

playerRoutes.delete(
  '/:id',
  validateUUID('id'),
  playerController.deletePlayer
);

playerRoutes.get(
  '/',
  requireAdmin as unknown as import('express').RequestHandler,
  adminRateLimit,
  validatePagination,
  playerController.getOnlinePlayers
);

playerRoutes.get(
  '/region/:regionId',
  requireAdmin as unknown as import('express').RequestHandler,
  adminRateLimit,
  playerController.getPlayersByRegion
);

router.use('/players', playerRoutes);

// World routes
const worldRoutes = Router();

worldRoutes.use(verifyToken as unknown as import('express').RequestHandler);

worldRoutes.get(
  '/regions',
  worldController.getAllRegions
);

worldRoutes.get(
  '/regions/:id',
  validateUUID('id'),
  worldController.getRegion
);

worldRoutes.post(
  '/events',
  playerActionRateLimit,
  validate({ body: insertGameEventSchema }),
  worldController.logGameEvent
);

worldRoutes.get(
  '/events',
  validatePagination,
  worldController.getGameEvents
);

worldRoutes.post(
  '/regions',
  requireAdmin as unknown as import('express').RequestHandler,
  adminRateLimit,
  validate({ body: insertRegionSchema }),
  worldController.createRegion
);

worldRoutes.put(
  '/regions/:id/status',
  requireAdmin as unknown as import('express').RequestHandler,
  adminRateLimit,
  validateUUID('id'),
  worldController.updateRegionStatus
);

worldRoutes.get(
  '/regions/server/:serverNode',
  requireAdmin as unknown as import('express').RequestHandler,
  adminRateLimit,
  worldController.getRegionsByServerNode
);

router.use('/world', worldRoutes);

// Admin routes
const adminRoutes = Router();

adminRoutes.use(
  verifyToken as unknown as import('express').RequestHandler,
  requireAdmin as unknown as import('express').RequestHandler,
  adminRateLimit
);

adminRoutes.get('/stats/overview', async (_req, res) => {
  try {
    const stats = {
      totalPlayers: await getTotalPlayers(),
      onlinePlayers: await getOnlinePlayers(),
      activeRegions: await getActiveRegions(),
      totalEvents: await getTotalEvents()
    };
    res.json(stats);
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

adminRoutes.get('/players/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    const players = await searchPlayers(String(query));
    res.json({ players });
  } catch (error) {
    console.error('Failed to search players:', error);
    res.status(500).json({ error: 'Failed to search players' });
  }
});
router.use((error: any, req: Request, res: Response, _next: NextFunction) => {
  console.error('API Error:', error);
  const statusCode = error.status || 500;
  res.status(statusCode).json({
    error: error.message || 'Internal server error',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
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
    { id: '1', username: 'Player1' },
    { id: '2', username: 'Player2' }
  ];
}

export default router;
async function getTotalEvents() {
  // Placeholder: Replace with actual DB query in production
  return 5000;
}

