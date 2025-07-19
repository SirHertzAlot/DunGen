import { Request, Response } from 'express';
import { z } from 'zod';
import { insertPlayerSchema, updatePlayerSchema, Player } from '@shared/schema';
import { playerRepository } from '../../persistence/repos/playerRepository';
import { eventBus } from '../../etl/pubsub/eventBus';
import { logger } from '../../logging/logger';

export class PlayerController {
  async createPlayer(req: Request, res: Response) {
    try {
      const validatedData = insertPlayerSchema.parse(req.body);
      
      // Check if player already exists
      const existingPlayer = await playerRepository.findByUsername(validatedData.username);
      if (existingPlayer) {
        return res.status(409).json({ error: 'Player with this username already exists' });
      }

      const player = await playerRepository.create(validatedData);
      
      // Emit player creation event
      await eventBus.publish('player.created', {
        playerId: player.id,
        username: player.username,
        regionId: player.regionId,
        timestamp: Date.now()
      });

      logger.info('Player created', { playerId: player.id, username: player.username });
      
      res.status(201).json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      logger.error('Failed to create player', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getPlayer(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const player = await playerRepository.findById(id);
      
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }

      res.json(player);
    } catch (error) {
      logger.error('Failed to get player', { error: error.message, playerId: req.params.id });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updatePlayer(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const validatedData = updatePlayerSchema.parse(req.body);
      
      const player = await playerRepository.update(id, validatedData);
      
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }

      // Emit player update event
      await eventBus.publish('player.updated', {
        playerId: player.id,
        changes: validatedData,
        timestamp: Date.now()
      });

      logger.info('Player updated', { playerId: player.id, changes: validatedData });
      
      res.json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      logger.error('Failed to update player', { error: error.message, playerId: req.params.id });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getPlayersByRegion(req: Request, res: Response) {
    try {
      const { regionId } = req.params;
      const players = await playerRepository.findByRegion(regionId);
      
      res.json(players);
    } catch (error) {
      logger.error('Failed to get players by region', { error: error.message, regionId: req.params.regionId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getOnlinePlayers(req: Request, res: Response) {
    try {
      const players = await playerRepository.findOnline();
      res.json(players);
    } catch (error) {
      logger.error('Failed to get online players', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async movePlayer(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const moveSchema = z.object({
        positionX: z.number(),
        positionY: z.number(),
        positionZ: z.number(),
        regionId: z.string()
      });
      
      const validatedData = moveSchema.parse(req.body);
      
      const player = await playerRepository.updatePosition(id, validatedData);
      
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }

      // Emit movement event
      await eventBus.publish('player.moved', {
        playerId: player.id,
        toX: validatedData.positionX,
        toY: validatedData.positionY,
        toZ: validatedData.positionZ,
        regionId: validatedData.regionId,
        timestamp: Date.now()
      });

      res.json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      logger.error('Failed to move player', { error: error.message, playerId: req.params.id });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deletePlayer(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleted = await playerRepository.delete(id);
      
      if (!deleted) {
        return res.status(404).json({ error: 'Player not found' });
      }

      // Emit player deletion event
      await eventBus.publish('player.deleted', {
        playerId: id,
        timestamp: Date.now()
      });

      logger.info('Player deleted', { playerId: id });
      
      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete player', { error: error.message, playerId: req.params.id });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const playerController = new PlayerController();
