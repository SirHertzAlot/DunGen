import { Router } from 'express';
import { playerController } from '../controllers/playerController';
import { worldController } from '../controllers/worldController';
import { validate, validateUUID, validatePagination } from '../middleware/validation';
import {
  generalRateLimit,
  authRateLimit,
  playerActionRateLimit,
  adminRateLimit
} from '../middleware/rateLimiting';
import {
  verifyToken,
  requirePlayer,
  requireAdmin,
  optionalAuth
} from '../middleware/auth';
import {
  insertPlayerSchema,
  updatePlayerSchema,
  insertRegionSchema,
  insertGameEventSchema
} from '@shared/schema';

const router = Router();

// Apply general rate limiting to all API routes
router.use(generalRateLimit);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Player routes
const playerRoutes = Router();

// Public player routes
playerRoutes.post(
  '/',
  authRateLimit,
  validate({ body: insertPlayerSchema }),
  playerController.createPlayer
);

playerRoutes.get(
  '/:id',
  validateUUID('id'),
  optionalAuth,
  playerController.getPlayer
);

// Protected player routes
playerRoutes.use(verifyToken, requirePlayer);

playerRoutes.put(
  '/:id',
  playerActionRateLimit,
  validateUUID('id'),
  validate({ body: updatePlayerSchema }),
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

// Admin-only player routes
playerRoutes.get(
  '/',
  requireAdmin,
  adminRateLimit,
  validatePagination,
  playerController.getOnlinePlayers
);

playerRoutes.get(
  '/region/:regionId',
  requireAdmin,
  adminRateLimit,
  playerController.getPlayersByRegion
);

router.use('/players', playerRoutes);

// World/Region routes
const worldRoutes = Router();

// Public world routes
worldRoutes.get(
  '/regions',
  optionalAuth,
  worldController.getAllRegions
);

worldRoutes.get(
  '/regions/:id',
  validateUUID('id'),
  optionalAuth,
  worldController.getRegion
);

// Protected world routes
worldRoutes.use(verifyToken);

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

// Admin-only world routes
worldRoutes.post(
  '/regions',
  requireAdmin,
  adminRateLimit,
  validate({ body: insertRegionSchema }),
  worldController.createRegion
);

worldRoutes.put(
  '/regions/:id/status',
  requireAdmin,
  adminRateLimit,
  validateUUID('id'),
  worldController.updateRegionStatus
);

worldRoutes.get(
  '/regions/server/:serverNode',
  requireAdmin,
  adminRateLimit,
  worldController.getRegionsByServerNode
);

router.use('/world', worldRoutes);

// Real-time game action routes
const gameRoutes = Router();
gameRoutes.use(verifyToken, requirePlayer, playerActionRateLimit);

// Combat endpoints
gameRoutes.post('/combat/attack', (req, res) => {
  // Combat logic would be handled by Unity ECS
  // This endpoint validates and forwards to event bus
  res.json({ message: 'Attack registered' });
});

// Chat endpoints
gameRoutes.post('/chat/message', (req, res) => {
  // Chat message validation and broadcast
  res.json({ message: 'Message sent' });
});

// Trading endpoints
gameRoutes.post('/trade/initiate', (req, res) => {
  // Trade initiation logic
  res.json({ message: 'Trade initiated' });
});

router.use('/game', gameRoutes);

// Admin routes
const adminRoutes = Router();
adminRoutes.use(verifyToken, requireAdmin, adminRateLimit);

adminRoutes.get('/stats/overview', (req, res) => {
  // Return overall game statistics
  res.json({
    totalPlayers: 0,
    onlinePlayers: 0,
    activeRegions: 0,
    totalEvents: 0
  });
});

adminRoutes.get('/players/search', (req, res) => {
  // Advanced player search functionality
  res.json({ players: [] });
});

adminRoutes.post('/maintenance/mode', (req, res) => {
  // Enable/disable maintenance mode
  res.json({ message: 'Maintenance mode updated' });
});

router.use('/admin', adminRoutes);

// Error handling middleware
router.use((error: any, req: any, res: any, next: any) => {
  console.error('API Error:', error);
  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

export { router as apiRoutes };
