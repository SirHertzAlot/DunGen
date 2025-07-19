import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { PlayerRepository } from "../persistence/repos/playerRepository";
import { gameEventQueue } from "../etl/queues/gameEventQueue";
import { logger } from "../logging/logger";
import { 
  insertPlayerSchema, 
  updatePlayerSchema,
  playerMovementEventSchema,
  combatEventSchema,
  chatEventSchema
} from "../shared/schema";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from 'uuid';

export async function registerRoutes(app: Express): Promise<Server> {
  const playerRepo = new PlayerRepository(storage);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      service: 'MMORPG-Backend'
    });
  });

  // Player endpoints
  app.post('/api/players', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const validatedData = insertPlayerSchema.parse(req.body);
      
      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.passwordHash, 10);
      const playerData = { ...validatedData, passwordHash: hashedPassword };

      const player = await playerRepo.create(playerData);

      logger.info('Player created via API', {
        service: 'API',
        requestId,
        playerId: player.id,
        username: player.username
      });

      res.status(201).json({ 
        success: true, 
        data: { ...player, passwordHash: undefined }
      });
    } catch (error) {
      logger.error('Failed to create player via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(400).json({ 
        success: false, 
        error: 'Invalid player data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/players/:id', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const player = await playerRepo.findById(req.params.id);
      
      if (!player) {
        return res.status(404).json({ 
          success: false, 
          error: 'Player not found' 
        });
      }

      res.json({ 
        success: true, 
        data: { ...player, passwordHash: undefined }
      });
    } catch (error) {
      logger.error('Failed to get player via API', error as Error, {
        service: 'API',
        requestId,
        playerId: req.params.id
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  app.patch('/api/players/:id', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const validatedUpdates = updatePlayerSchema.parse(req.body);
      const updatedPlayer = await playerRepo.update(req.params.id, validatedUpdates);
      
      if (!updatedPlayer) {
        return res.status(404).json({ 
          success: false, 
          error: 'Player not found' 
        });
      }

      logger.info('Player updated via API', {
        service: 'API',
        requestId,
        playerId: req.params.id
      });

      res.json({ 
        success: true, 
        data: { ...updatedPlayer, passwordHash: undefined }
      });
    } catch (error) {
      logger.error('Failed to update player via API', error as Error, {
        service: 'API',
        requestId,
        playerId: req.params.id
      });
      
      res.status(400).json({ 
        success: false, 
        error: 'Invalid update data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Region endpoints
  app.get('/api/regions', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const regions = await storage.getAllRegions();
      
      logger.debug('Regions fetched via API', {
        service: 'API',
        requestId,
        regionCount: regions.length
      });

      res.json({ 
        success: true, 
        data: regions 
      });
    } catch (error) {
      logger.error('Failed to get regions via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  app.get('/api/regions/:regionId/players', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const players = await playerRepo.findInRegion(req.params.regionId);
      
      logger.debug('Players in region fetched via API', {
        service: 'API',
        requestId,
        regionId: req.params.regionId,
        playerCount: players.length
      });

      res.json({ 
        success: true, 
        data: players.map(p => ({ ...p, passwordHash: undefined }))
      });
    } catch (error) {
      logger.error('Failed to get players in region via API', error as Error, {
        service: 'API',
        requestId,
        regionId: req.params.regionId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // Game action endpoints (ETL layer integration)
  app.post('/api/players/:playerId/move', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const validatedMovement = playerMovementEventSchema.parse(req.body);
      
      await gameEventQueue.addPlayerAction({
        playerId: req.params.playerId,
        actionType: 'move',
        data: validatedMovement,
        regionId: req.body.regionId
      });

      logger.info('Player movement queued via API', {
        service: 'API',
        requestId,
        playerId: req.params.playerId
      });

      res.json({ 
        success: true, 
        message: 'Movement queued for processing' 
      });
    } catch (error) {
      logger.error('Failed to process player movement via API', error as Error, {
        service: 'API',
        requestId,
        playerId: req.params.playerId
      });
      
      res.status(400).json({ 
        success: false, 
        error: 'Invalid movement data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/players/:playerId/combat', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const validatedCombat = combatEventSchema.parse(req.body);
      
      await gameEventQueue.addPlayerAction({
        playerId: req.params.playerId,
        actionType: 'combat',
        data: validatedCombat,
        regionId: req.body.regionId
      });

      logger.info('Player combat queued via API', {
        service: 'API',
        requestId,
        playerId: req.params.playerId
      });

      res.json({ 
        success: true, 
        message: 'Combat action queued for processing' 
      });
    } catch (error) {
      logger.error('Failed to process player combat via API', error as Error, {
        service: 'API',
        requestId,
        playerId: req.params.playerId
      });
      
      res.status(400).json({ 
        success: false, 
        error: 'Invalid combat data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/players/:playerId/chat', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const validatedChat = chatEventSchema.parse(req.body);
      
      await gameEventQueue.addPlayerAction({
        playerId: req.params.playerId,
        actionType: 'chat',
        data: validatedChat,
        regionId: req.body.regionId
      });

      logger.info('Player chat queued via API', {
        service: 'API',
        requestId,
        playerId: req.params.playerId
      });

      res.json({ 
        success: true, 
        message: 'Chat message queued for processing' 
      });
    } catch (error) {
      logger.error('Failed to process player chat via API', error as Error, {
        service: 'API',
        requestId,
        playerId: req.params.playerId
      });
      
      res.status(400).json({ 
        success: false, 
        error: 'Invalid chat data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Session management endpoints
  app.post('/api/players/:playerId/session', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const sessionData = {
        playerId: req.params.playerId,
        sessionToken: uuidv4(),
        regionId: req.body.regionId || 'region_0_0',
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.get('User-Agent')
      };

      const session = await storage.createSession(sessionData);
      await playerRepo.setOnlineStatus(req.params.playerId, true);

      logger.info('Player session created via API', {
        service: 'API',
        requestId,
        playerId: req.params.playerId,
        sessionId: session.id
      });

      res.status(201).json({ 
        success: true, 
        data: session 
      });
    } catch (error) {
      logger.error('Failed to create session via API', error as Error, {
        service: 'API',
        requestId,
        playerId: req.params.playerId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  app.delete('/api/sessions/:sessionId', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      await storage.endSession(req.params.sessionId);

      logger.info('Session ended via API', {
        service: 'API',
        requestId,
        sessionId: req.params.sessionId
      });

      res.json({ 
        success: true, 
        message: 'Session ended successfully' 
      });
    } catch (error) {
      logger.error('Failed to end session via API', error as Error, {
        service: 'API',
        requestId,
        sessionId: req.params.sessionId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
