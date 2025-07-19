import { Region, InsertRegion, GameEvent, InsertGameEvent } from '@shared/schema';
import { logger } from '../../logging/logger';

/**
 * World repository for managing regions, events, and world state
 * Handles region data, game events, and world-related queries
 */
export interface IWorldRepository {
  // Region management
  createRegion(region: InsertRegion): Promise<Region>;
  findRegionById(id: string): Promise<Region | null>;
  findAllRegions(): Promise<Region[]>;
  findRegionsByServerNode(serverNode: string): Promise<Region[]>;
  updateRegionStatus(id: string, updates: { status?: string; playerCount?: number }): Promise<Region | null>;
  deleteRegion(id: string): Promise<boolean>;

  // Game events
  createGameEvent(event: InsertGameEvent): Promise<GameEvent>;
  findGameEvents(query: GameEventQuery): Promise<GameEvent[]>;
  findEventsByPlayer(playerId: string, limit?: number): Promise<GameEvent[]>;
  findEventsByRegion(regionId: string, eventType?: string, limit?: number): Promise<GameEvent[]>;
  findEventsByType(eventType: string, limit?: number): Promise<GameEvent[]>;
  deleteOldEvents(olderThan: Date): Promise<number>;

  // World statistics
  getRegionStats(): Promise<RegionStatistics>;
  getEventStats(): Promise<EventStatistics>;
  getWorldLoad(): Promise<WorldLoadInfo>;
}

export interface GameEventQuery {
  playerId?: string;
  eventType?: string;
  regionId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

export interface RegionStatistics {
  totalRegions: number;
  activeRegions: number;
  totalPlayers: number;
  averagePlayersPerRegion: number;
  regionsByStatus: Record<string, number>;
  regionsByServerNode: Record<string, number>;
}

export interface EventStatistics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsLast24Hours: number;
  eventsLastHour: number;
  topEventTypes: Array<{ type: string; count: number }>;
}

export interface WorldLoadInfo {
  totalPlayers: number;
  totalRegions: number;
  averageLoad: number;
  regionLoads: Array<{
    regionId: string;
    playerCount: number;
    maxPlayers: number;
    loadPercentage: number;
    status: string;
  }>;
  serverLoads: Array<{
    serverNode: string;
    totalPlayers: number;
    totalRegions: number;
    averageLoad: number;
  }>;
}

export class MemWorldRepository implements IWorldRepository {
  private regions: Map<string, Region> = new Map();
  private gameEvents: GameEvent[] = [];
  private serverNodeIndex: Map<string, Set<string>> = new Map();
  private eventTypeIndex: Map<string, GameEvent[]> = new Map();
  private regionEventIndex: Map<string, GameEvent[]> = new Map();
  private playerEventIndex: Map<string, GameEvent[]> = new Map();

  // Region management
  async createRegion(regionData: InsertRegion): Promise<Region> {
    try {
      // Check if region already exists
      if (this.regions.has(regionData.id)) {
        throw new Error('Region with this ID already exists');
      }

      const now = new Date();
      const region: Region = {
        ...regionData,
        playerCount: 0,
        status: 'active',
        createdAt: now,
        ...regionData // Allow overrides
      };

      this.regions.set(region.id, region);
      this.addToServerNodeIndex(region.serverNode, region.id);

      logger.info('Region created', { 
        regionId: region.id, 
        name: region.name, 
        serverNode: region.serverNode 
      });

      return region;
    } catch (error) {
      logger.error('Failed to create region', { error: error.message, regionData });
      throw error;
    }
  }

  async findRegionById(id: string): Promise<Region | null> {
    return this.regions.get(id) || null;
  }

  async findAllRegions(): Promise<Region[]> {
    return Array.from(this.regions.values());
  }

  async findRegionsByServerNode(serverNode: string): Promise<Region[]> {
    const regionIds = this.serverNodeIndex.get(serverNode) || new Set();
    const regions: Region[] = [];

    for (const id of regionIds) {
      const region = this.regions.get(id);
      if (region) {
        regions.push(region);
      }
    }

    return regions;
  }

  async updateRegionStatus(id: string, updates: { status?: string; playerCount?: number }): Promise<Region | null> {
    try {
      const region = this.regions.get(id);
      if (!region) {
        return null;
      }

      const updatedRegion: Region = {
        ...region,
        ...updates
      };

      this.regions.set(id, updatedRegion);

      logger.debug('Region updated', { regionId: id, updates });
      return updatedRegion;
    } catch (error) {
      logger.error('Failed to update region', { error: error.message, regionId: id, updates });
      throw error;
    }
  }

  async deleteRegion(id: string): Promise<boolean> {
    try {
      const region = this.regions.get(id);
      if (!region) {
        return false;
      }

      // Remove from indexes
      this.removeFromServerNodeIndex(region.serverNode, id);
      this.regions.delete(id);

      // Remove associated events
      this.regionEventIndex.delete(id);

      logger.info('Region deleted', { regionId: id, name: region.name });
      return true;
    } catch (error) {
      logger.error('Failed to delete region', { error: error.message, regionId: id });
      throw error;
    }
  }

  // Game events
  async createGameEvent(eventData: InsertGameEvent): Promise<GameEvent> {
    try {
      const event: GameEvent = {
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...eventData,
        timestamp: new Date()
      };

      this.gameEvents.push(event);

      // Update indexes
      this.addToEventTypeIndex(event.eventType, event);
      if (event.regionId) {
        this.addToRegionEventIndex(event.regionId, event);
      }
      if (event.playerId) {
        this.addToPlayerEventIndex(event.playerId, event);
      }

      logger.debug('Game event created', { 
        eventId: event.id, 
        eventType: event.eventType, 
        playerId: event.playerId,
        regionId: event.regionId 
      });

      return event;
    } catch (error) {
      logger.error('Failed to create game event', { error: error.message, eventData });
      throw error;
    }
  }

  async findGameEvents(query: GameEventQuery): Promise<GameEvent[]> {
    let events = [...this.gameEvents];

    // Apply filters
    if (query.playerId) {
      events = events.filter(e => e.playerId === query.playerId);
    }

    if (query.eventType) {
      events = events.filter(e => e.eventType === query.eventType);
    }

    if (query.regionId) {
      events = events.filter(e => e.regionId === query.regionId);
    }

    if (query.startTime) {
      events = events.filter(e => e.timestamp >= query.startTime!);
    }

    if (query.endTime) {
      events = events.filter(e => e.timestamp <= query.endTime!);
    }

    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    
    return events.slice(offset, offset + limit);
  }

  async findEventsByPlayer(playerId: string, limit: number = 100): Promise<GameEvent[]> {
    const playerEvents = this.playerEventIndex.get(playerId) || [];
    return playerEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async findEventsByRegion(regionId: string, eventType?: string, limit: number = 100): Promise<GameEvent[]> {
    let regionEvents = this.regionEventIndex.get(regionId) || [];
    
    if (eventType) {
      regionEvents = regionEvents.filter(e => e.eventType === eventType);
    }

    return regionEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async findEventsByType(eventType: string, limit: number = 100): Promise<GameEvent[]> {
    const typeEvents = this.eventTypeIndex.get(eventType) || [];
    return typeEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async deleteOldEvents(olderThan: Date): Promise<number> {
    const initialCount = this.gameEvents.length;
    
    // Filter out old events
    this.gameEvents = this.gameEvents.filter(event => event.timestamp > olderThan);
    
    // Rebuild indexes
    this.rebuildEventIndexes();
    
    const deletedCount = initialCount - this.gameEvents.length;
    
    logger.info('Old events deleted', { 
      deletedCount, 
      remainingCount: this.gameEvents.length,
      cutoffDate: olderThan 
    });
    
    return deletedCount;
  }

  // Statistics and monitoring
  async getRegionStats(): Promise<RegionStatistics> {
    const regions = Array.from(this.regions.values());
    const totalRegions = regions.length;
    const activeRegions = regions.filter(r => r.status === 'active').length;
    const totalPlayers = regions.reduce((sum, r) => sum + r.playerCount, 0);
    const averagePlayersPerRegion = totalRegions > 0 ? totalPlayers / totalRegions : 0;

    const regionsByStatus: Record<string, number> = {};
    const regionsByServerNode: Record<string, number> = {};

    for (const region of regions) {
      regionsByStatus[region.status] = (regionsByStatus[region.status] || 0) + 1;
      regionsByServerNode[region.serverNode] = (regionsByServerNode[region.serverNode] || 0) + 1;
    }

    return {
      totalRegions,
      activeRegions,
      totalPlayers,
      averagePlayersPerRegion,
      regionsByStatus,
      regionsByServerNode
    };
  }

  async getEventStats(): Promise<EventStatistics> {
    const totalEvents = this.gameEvents.length;
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

    const eventsLast24Hours = this.gameEvents.filter(e => e.timestamp >= last24Hours).length;
    const eventsLastHour = this.gameEvents.filter(e => e.timestamp >= lastHour).length;

    const eventsByType: Record<string, number> = {};
    for (const event of this.gameEvents) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
    }

    const topEventTypes = Object.entries(eventsByType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEvents,
      eventsByType,
      eventsLast24Hours,
      eventsLastHour,
      topEventTypes
    };
  }

  async getWorldLoad(): Promise<WorldLoadInfo> {
    const regions = Array.from(this.regions.values());
    const totalPlayers = regions.reduce((sum, r) => sum + r.playerCount, 0);
    const totalRegions = regions.length;
    const averageLoad = totalRegions > 0 ? totalPlayers / totalRegions : 0;

    const regionLoads = regions.map(region => ({
      regionId: region.id,
      playerCount: region.playerCount,
      maxPlayers: region.maxPlayers,
      loadPercentage: region.maxPlayers > 0 ? (region.playerCount / region.maxPlayers) * 100 : 0,
      status: region.status
    }));

    const serverLoads: Record<string, { totalPlayers: number; totalRegions: number; regions: Region[] }> = {};
    
    for (const region of regions) {
      if (!serverLoads[region.serverNode]) {
        serverLoads[region.serverNode] = { totalPlayers: 0, totalRegions: 0, regions: [] };
      }
      serverLoads[region.serverNode].totalPlayers += region.playerCount;
      serverLoads[region.serverNode].totalRegions += 1;
      serverLoads[region.serverNode].regions.push(region);
    }

    const serverLoadArray = Object.entries(serverLoads).map(([serverNode, data]) => ({
      serverNode,
      totalPlayers: data.totalPlayers,
      totalRegions: data.totalRegions,
      averageLoad: data.totalRegions > 0 ? data.totalPlayers / data.totalRegions : 0
    }));

    return {
      totalPlayers,
      totalRegions,
      averageLoad,
      regionLoads,
      serverLoads: serverLoadArray
    };
  }

  // Helper methods for index management
  private addToServerNodeIndex(serverNode: string, regionId: string): void {
    if (!this.serverNodeIndex.has(serverNode)) {
      this.serverNodeIndex.set(serverNode, new Set());
    }
    this.serverNodeIndex.get(serverNode)!.add(regionId);
  }

  private removeFromServerNodeIndex(serverNode: string, regionId: string): void {
    const nodeRegions = this.serverNodeIndex.get(serverNode);
    if (nodeRegions) {
      nodeRegions.delete(regionId);
      if (nodeRegions.size === 0) {
        this.serverNodeIndex.delete(serverNode);
      }
    }
  }

  private addToEventTypeIndex(eventType: string, event: GameEvent): void {
    if (!this.eventTypeIndex.has(eventType)) {
      this.eventTypeIndex.set(eventType, []);
    }
    this.eventTypeIndex.get(eventType)!.push(event);
  }

  private addToRegionEventIndex(regionId: string, event: GameEvent): void {
    if (!this.regionEventIndex.has(regionId)) {
      this.regionEventIndex.set(regionId, []);
    }
    this.regionEventIndex.get(regionId)!.push(event);
  }

  private addToPlayerEventIndex(playerId: string, event: GameEvent): void {
    if (!this.playerEventIndex.has(playerId)) {
      this.playerEventIndex.set(playerId, []);
    }
    this.playerEventIndex.get(playerId)!.push(event);
  }

  private rebuildEventIndexes(): void {
    // Clear existing indexes
    this.eventTypeIndex.clear();
    this.regionEventIndex.clear();
    this.playerEventIndex.clear();

    // Rebuild from current events
    for (const event of this.gameEvents) {
      this.addToEventTypeIndex(event.eventType, event);
      if (event.regionId) {
        this.addToRegionEventIndex(event.regionId, event);
      }
      if (event.playerId) {
        this.addToPlayerEventIndex(event.playerId, event);
      }
    }
  }

  // Cleanup and maintenance
  async cleanupOldEvents(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    return this.deleteOldEvents(cutoffDate);
  }

  getRepositoryStats() {
    return {
      totalRegions: this.regions.size,
      totalEvents: this.gameEvents.length,
      serverNodes: this.serverNodeIndex.size,
      eventTypes: this.eventTypeIndex.size,
      regionsWithEvents: this.regionEventIndex.size,
      playersWithEvents: this.playerEventIndex.size
    };
  }
}

export const worldRepository = new MemWorldRepository();
