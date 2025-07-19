import { Request, Response } from 'express';
import { z } from 'zod';
import { insertRegionSchema, insertGameEventSchema } from '@shared/schema';
import { worldRepository } from '../../persistence/repos/worldRepository';
import { eventBus } from '../../etl/pubsub/eventBus';
import { logger } from '../../logging/logger';

export class WorldController {
  async createRegion(req: Request, res: Response) {
    try {
      const validatedData = insertRegionSchema.parse(req.body);
      
      const region = await worldRepository.createRegion(validatedData);
      
      // Emit region creation event
      await eventBus.publish('region.created', {
        regionId: region.id,
        serverNode: region.serverNode,
        timestamp: Date.now()
      });

      logger.info('Region created', { regionId: region.id, serverNode: region.serverNode });
      
      res.status(201).json(region);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      logger.error('Failed to create region', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getRegion(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const region = await worldRepository.findRegionById(id);
      
      if (!region) {
        return res.status(404).json({ error: 'Region not found' });
      }

      res.json(region);
    } catch (error) {
      logger.error('Failed to get region', { error: error.message, regionId: req.params.id });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getAllRegions(req: Request, res: Response) {
    try {
      const regions = await worldRepository.findAllRegions();
      res.json(regions);
    } catch (error) {
      logger.error('Failed to get regions', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateRegionStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const statusSchema = z.object({
        status: z.enum(['active', 'maintenance', 'offline']),
        playerCount: z.number().min(0).optional()
      });
      
      const validatedData = statusSchema.parse(req.body);
      
      const region = await worldRepository.updateRegionStatus(id, validatedData);
      
      if (!region) {
        return res.status(404).json({ error: 'Region not found' });
      }

      // Emit region status change event
      await eventBus.publish('region.status_changed', {
        regionId: region.id,
        status: validatedData.status,
        playerCount: validatedData.playerCount || region.playerCount,
        timestamp: Date.now()
      });

      logger.info('Region status updated', { regionId: region.id, status: validatedData.status });
      
      res.json(region);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      logger.error('Failed to update region status', { error: error.message, regionId: req.params.id });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async logGameEvent(req: Request, res: Response) {
    try {
      const validatedData = insertGameEventSchema.parse(req.body);
      
      const event = await worldRepository.createGameEvent(validatedData);
      
      // Emit game event for real-time processing
      await eventBus.publish(`game.${validatedData.eventType}`, {
        eventId: event.id,
        ...validatedData,
        timestamp: Date.now()
      });

      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      logger.error('Failed to log game event', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getGameEvents(req: Request, res: Response) {
    try {
      const querySchema = z.object({
        playerId: z.string().uuid().optional(),
        eventType: z.string().optional(),
        regionId: z.string().optional(),
        limit: z.coerce.number().min(1).max(1000).default(100),
        offset: z.coerce.number().min(0).default(0)
      });
      
      const query = querySchema.parse(req.query);
      
      const events = await worldRepository.findGameEvents(query);
      
      res.json(events);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      logger.error('Failed to get game events', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getRegionsByServerNode(req: Request, res: Response) {
    try {
      const { serverNode } = req.params;
      const regions = await worldRepository.findRegionsByServerNode(serverNode);
      
      res.json(regions);
    } catch (error) {
      logger.error('Failed to get regions by server node', { error: error.message, serverNode: req.params.serverNode });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const worldController = new WorldController();
