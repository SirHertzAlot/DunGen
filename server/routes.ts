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
      // Get region to find unification container
      const regions = await storage.getAllRegions();
      const region = regions.find(r => r.id === req.body.regionId) || regions[0];
      
      const sessionData = {
        playerId: req.params.playerId,
        sessionToken: uuidv4(),
        regionId: region?.id || uuidv4(),
        unificationContainerId: region?.unificationContainerId || 'default_container',
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

  // Infrastructure management endpoints (hot-swappable configs)
  app.get('/api/infrastructure/status', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { infrastructureManager } = await import('../config/InfrastructureManager');
      const status = await infrastructureManager.getSystemStatus();
      
      logger.debug('Infrastructure status retrieved via API', {
        service: 'API',
        requestId
      });

      res.json({ 
        success: true, 
        data: status 
      });
    } catch (error) {
      logger.error('Failed to get infrastructure status via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  app.post('/api/infrastructure/reconfigure', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { nodeType, environment, config } = req.body;
      
      if (!nodeType || !environment || !config) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: nodeType, environment, config'
        });
      }

      const { infrastructureManager } = await import('../config/InfrastructureManager');
      await infrastructureManager.reconfigureNode(nodeType, environment, config);

      logger.info('Infrastructure node reconfigured via API', {
        service: 'API',
        requestId,
        nodeType,
        environment
      });

      res.json({ 
        success: true, 
        message: 'Infrastructure node reconfigured successfully',
        data: { nodeType, environment }
      });
    } catch (error) {
      logger.error('Failed to reconfigure infrastructure node via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(400).json({ 
        success: false, 
        error: 'Failed to reconfigure infrastructure node',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/infrastructure/swap-component', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { componentName, componentType, config } = req.body;
      
      if (!componentName || !componentType || !config) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: componentName, componentType, config'
        });
      }

      const { infrastructureManager } = await import('../config/InfrastructureManager');
      await infrastructureManager.swapComponent(componentName, config, componentType);

      logger.info('Infrastructure component swapped via API', {
        service: 'API',
        requestId,
        componentName,
        componentType
      });

      res.json({ 
        success: true, 
        message: 'Infrastructure component swapped successfully',
        data: { componentName, componentType }
      });
    } catch (error) {
      logger.error('Failed to swap infrastructure component via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(400).json({ 
        success: false, 
        error: 'Failed to swap infrastructure component',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Game object search endpoints (findable by UUID)
  app.get('/api/game-objects/:id', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const gameObject = await storage.getGameObject(req.params.id);
      
      if (!gameObject) {
        return res.status(404).json({ 
          success: false, 
          error: 'Game object not found' 
        });
      }

      res.json({ 
        success: true, 
        data: gameObject
      });
    } catch (error) {
      logger.error('Failed to get game object via API', error as Error, {
        service: 'API',
        requestId,
        gameObjectId: req.params.id
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  app.get('/api/game-objects', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const searchParams = req.query;
      const gameObjects = await storage.findGameObjects(searchParams as any);
      
      logger.debug('Game objects searched via API', {
        service: 'API',
        requestId,
        resultsCount: gameObjects.length,
        searchParams: Object.keys(searchParams)
      });

      res.json({ 
        success: true, 
        data: gameObjects,
        count: gameObjects.length
      });
    } catch (error) {
      logger.error('Failed to search game objects via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  app.post('/api/game-objects', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      // Validate game object data here if needed
      const gameObject = await storage.createGameObject(req.body);

      logger.info('Game object created via API', {
        service: 'API',
        requestId,
        gameObjectId: gameObject.id,
        type: gameObject.type
      });

      res.status(201).json({ 
        success: true, 
        data: gameObject
      });
    } catch (error) {
      logger.error('Failed to create game object via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(400).json({ 
        success: false, 
        error: 'Invalid game object data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Debugging endpoints - trace events by UUID
  app.get('/api/events/trace/:traceId', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const events = await storage.getEventsByTrace(req.params.traceId);
      
      logger.debug('Events traced via API', {
        service: 'API',
        requestId,
        traceId: req.params.traceId,
        eventsCount: events.length
      });

      res.json({ 
        success: true, 
        data: events,
        count: events.length
      });
    } catch (error) {
      logger.error('Failed to trace events via API', error as Error, {
        service: 'API',
        requestId,
        traceId: req.params.traceId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // ECS and Unity integration endpoints
  app.get('/api/ecs/status', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { ecsManager } = await import('../game/ecs/ECSManager');
      const { unityBridge } = await import('../game/unity/UnityBridge');
      
      const ecsStats = ecsManager.getPerformanceStats();
      const unityStatus = unityBridge.getConnectionStatus();
      const activeCombats = ecsManager.getActiveCombats();
      
      res.json({ 
        success: true, 
        data: {
          ecs: ecsStats,
          unity: unityStatus,
          activeCombats: activeCombats.length,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      logger.error('Failed to get ECS status via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  app.post('/api/ecs/create-character', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { playerId, characterName, position, characterClass, race } = req.body;
      
      if (!playerId || !characterName || !position) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: playerId, characterName, position'
        });
      }

      const { ecsManager } = await import('../game/ecs/ECSManager');
      const entityId = await ecsManager.createPlayerCharacter({
        playerId,
        characterName,
        position,
        characterClass: characterClass || 'fighter',
        race: race || 'human'
      });

      logger.info('Player character created via API', {
        service: 'API',
        requestId,
        entityId,
        playerId,
        characterName
      });

      res.status(201).json({ 
        success: true, 
        data: { entityId, playerId, characterName }
      });
    } catch (error) {
      logger.error('Failed to create character via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(400).json({ 
        success: false, 
        error: 'Failed to create character',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/ecs/create-npc', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { npcType, challengeRating, position, faction } = req.body;
      
      if (!npcType || challengeRating === undefined || !position) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: npcType, challengeRating, position'
        });
      }

      const { ecsManager } = await import('../game/ecs/ECSManager');
      const entityId = await ecsManager.createNPC({
        npcType,
        challengeRating,
        position,
        faction
      });

      logger.info('NPC created via API', {
        service: 'API',
        requestId,
        entityId,
        npcType,
        challengeRating
      });

      res.status(201).json({ 
        success: true, 
        data: { entityId, npcType, challengeRating }
      });
    } catch (error) {
      logger.error('Failed to create NPC via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(400).json({ 
        success: false, 
        error: 'Failed to create NPC',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/ecs/attack', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { attackerId, targetId, weaponId } = req.body;
      
      if (!attackerId || !targetId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: attackerId, targetId'
        });
      }

      const { ecsManager } = await import('../game/ecs/ECSManager');
      const success = await ecsManager.initiateAttack({
        attackerId,
        targetId,
        weaponId
      });

      if (success) {
        logger.info('Attack initiated via API', {
          service: 'API',
          requestId,
          attackerId,
          targetId,
          weaponId
        });

        res.json({ 
          success: true, 
          message: 'Attack queued successfully'
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: 'Failed to initiate attack'
        });
      }
    } catch (error) {
      logger.error('Failed to initiate attack via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  app.post('/api/ecs/move', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { entityId, targetX, targetY, targetZ } = req.body;
      
      if (!entityId || targetX === undefined || targetY === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: entityId, targetX, targetY'
        });
      }

      const { ecsManager } = await import('../game/ecs/ECSManager');
      const success = await ecsManager.moveEntity({
        entityId,
        targetX,
        targetY,
        targetZ: targetZ || 0
      });

      if (success) {
        res.json({ 
          success: true, 
          message: 'Movement command sent'
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: 'Failed to move entity'
        });
      }
    } catch (error) {
      logger.error('Failed to move entity via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  app.post('/api/ecs/cast-spell', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { casterId, spellId, targetId, targetPosition } = req.body;
      
      if (!casterId || !spellId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: casterId, spellId'
        });
      }

      const { ecsManager } = await import('../game/ecs/ECSManager');
      const success = await ecsManager.castSpell({
        casterId,
        spellId,
        targetId,
        targetPosition
      });

      if (success) {
        res.json({ 
          success: true, 
          message: 'Spell cast queued successfully'
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: 'Failed to cast spell'
        });
      }
    } catch (error) {
      logger.error('Failed to cast spell via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  app.get('/api/ecs/combats', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { ecsManager } = await import('../game/ecs/ECSManager');
      const activeCombats = ecsManager.getActiveCombats();
      
      res.json({ 
        success: true, 
        data: activeCombats,
        count: activeCombats.length
      });
    } catch (error) {
      logger.error('Failed to get active combats via API', error as Error, {
        service: 'API',
        requestId
      });
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // World generation endpoints
  app.get('/api/worldgen/chunk/:x/:z', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { TerrainGenerator } = await import('../game/worldgen/TerrainGenerator');
      const terrainGenerator = TerrainGenerator.getInstance();
      
      const chunkX = parseInt(req.params.x);
      const chunkZ = parseInt(req.params.z);

      if (isNaN(chunkX) || isNaN(chunkZ)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid chunk coordinates'
        });
      }

      const chunk = await terrainGenerator.getChunk(chunkX, chunkZ);

      res.json({
        success: true,
        data: {
          id: chunk.id,
          position: [chunkX, chunkZ],
          size: chunk.size,
          heightmap: chunk.heightmap,
          biomes: chunk.biomes,
          features: chunk.features,
          generated: chunk.generated
        }
      });

    } catch (error) {
      logger.error('Failed to get terrain chunk via API', error as Error, {
        service: 'API',
        requestId,
        chunkX: req.params.x,
        chunkZ: req.params.z
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate terrain chunk'
      });
    }
  });

  app.get('/api/worldgen/region/:minX/:minZ/:maxX/:maxZ', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      const { TerrainGenerator } = await import('../game/worldgen/TerrainGenerator');
      const terrainGenerator = TerrainGenerator.getInstance();
      
      const minX = parseInt(req.params.minX);
      const minZ = parseInt(req.params.minZ);
      const maxX = parseInt(req.params.maxX);
      const maxZ = parseInt(req.params.maxZ);

      if (isNaN(minX) || isNaN(minZ) || isNaN(maxX) || isNaN(maxZ)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid region coordinates'
        });
      }

      // Limit region size to prevent excessive data transfer
      const maxRegionSize = 4;
      if (maxX - minX > maxRegionSize || maxZ - minZ > maxRegionSize) {
        return res.status(400).json({
          success: false,
          error: `Region too large. Maximum size is ${maxRegionSize}x${maxRegionSize} chunks`
        });
      }

      const chunks = [];
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          const chunk = await terrainGenerator.getChunk(x, z);
          chunks.push({
            id: chunk.id,
            position: [x, z],
            size: chunk.size,
            heightmap: chunk.heightmap,
            biomes: chunk.biomes,
            features: chunk.features
          });
        }
      }

      res.json({
        success: true,
        data: {
          region: { minX, minZ, maxX, maxZ },
          chunks: chunks,
          count: chunks.length
        }
      });

    } catch (error) {
      logger.error('Failed to get region chunks via API', error as Error, {
        service: 'API',
        requestId,
        region: [req.params.minX, req.params.minZ, req.params.maxX, req.params.maxZ]
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate region chunks'
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
