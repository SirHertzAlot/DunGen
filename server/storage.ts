import { 
  type Player, 
  type InsertPlayer, 
  type Region, 
  type InsertRegion,
  type Session,
  type InsertSession,
  type GameEvent,
  type InsertGameEvent,
  type Guild,
  type InsertGuild
} from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';

export interface IStorage {
  // Player operations
  getPlayer(id: string): Promise<Player | undefined>;
  getPlayerByUsername(username: string): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined>;
  getPlayersInRegion(regionId: string): Promise<Player[]>;
  
  // Region operations
  getRegion(id: string): Promise<Region | undefined>;
  getAllRegions(): Promise<Region[]>;
  createRegion(region: InsertRegion): Promise<Region>;
  updateRegion(id: string, updates: Partial<Region>): Promise<Region | undefined>;
  
  // Session operations
  createSession(session: InsertSession): Promise<Session>;
  getActiveSession(playerId: string): Promise<Session | undefined>;
  endSession(sessionId: string): Promise<void>;
  
  // Game events
  createGameEvent(event: InsertGameEvent): Promise<GameEvent>;
  getPlayerEvents(playerId: string, limit?: number): Promise<GameEvent[]>;
  
  // Guild operations
  getGuild(id: string): Promise<Guild | undefined>;
  createGuild(guild: InsertGuild): Promise<Guild>;
  getPlayerGuild(playerId: string): Promise<Guild | undefined>;
}

export class MemStorage implements IStorage {
  private players: Map<string, Player>;
  private regions: Map<string, Region>;
  private sessions: Map<string, Session>;
  private gameEvents: Map<string, GameEvent>;
  private guilds: Map<string, Guild>;

  constructor() {
    this.players = new Map();
    this.regions = new Map();
    this.sessions = new Map();
    this.gameEvents = new Map();
    this.guilds = new Map();
    
    // Initialize default regions for testing
    this.initializeDefaultRegions();
  }

  private async initializeDefaultRegions() {
    const defaultRegions = [
      { id: "region_0_0", name: "Starting Plains", minX: -100, maxX: 100, minY: -100, maxY: 100, serverNode: "node_1" },
      { id: "region_0_1", name: "Dark Forest", minX: -100, maxX: 100, minY: 100, maxY: 300, serverNode: "node_1" },
      { id: "region_1_0", name: "Mountain Pass", minX: 100, maxX: 300, minY: -100, maxY: 100, serverNode: "node_2" },
    ];
    
    for (const region of defaultRegions) {
      await this.createRegion(region);
    }
  }

  // Player operations
  async getPlayer(id: string): Promise<Player | undefined> {
    return this.players.get(id);
  }

  async getPlayerByUsername(username: string): Promise<Player | undefined> {
    return Array.from(this.players.values()).find(
      (player) => player.username === username,
    );
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const id = uuidv4();
    const now = new Date();
    const player: Player = { 
      id,
      username: insertPlayer.username,
      email: insertPlayer.email,
      passwordHash: insertPlayer.passwordHash,
      level: insertPlayer.level ?? 1,
      experience: insertPlayer.experience ?? 0,
      health: insertPlayer.health ?? 100,
      mana: insertPlayer.mana ?? 100,
      positionX: insertPlayer.positionX ?? 0,
      positionY: insertPlayer.positionY ?? 0,
      positionZ: insertPlayer.positionZ ?? 0,
      regionId: insertPlayer.regionId ?? "region_0_0",
      inventory: insertPlayer.inventory ?? {},
      stats: insertPlayer.stats ?? {},
      guild: insertPlayer.guild ?? null,
      lastActive: insertPlayer.lastActive ?? now,
      isOnline: insertPlayer.isOnline ?? false,
      createdAt: now,
      updatedAt: now
    };
    this.players.set(id, player);
    return player;
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined> {
    const player = this.players.get(id);
    if (!player) return undefined;
    
    const updatedPlayer = { ...player, ...updates, updatedAt: new Date() };
    this.players.set(id, updatedPlayer);
    return updatedPlayer;
  }

  async getPlayersInRegion(regionId: string): Promise<Player[]> {
    return Array.from(this.players.values()).filter(
      (player) => player.regionId === regionId && player.isOnline
    );
  }

  // Region operations
  async getRegion(id: string): Promise<Region | undefined> {
    return this.regions.get(id);
  }

  async getAllRegions(): Promise<Region[]> {
    return Array.from(this.regions.values());
  }

  async createRegion(insertRegion: InsertRegion): Promise<Region> {
    const region: Region = { 
      id: insertRegion.id,
      name: insertRegion.name,
      minX: insertRegion.minX,
      maxX: insertRegion.maxX,
      minY: insertRegion.minY,
      maxY: insertRegion.maxY,
      serverNode: insertRegion.serverNode,
      playerCount: insertRegion.playerCount ?? 0,
      maxPlayers: insertRegion.maxPlayers ?? 100,
      status: insertRegion.status ?? "active",
      createdAt: new Date()
    };
    this.regions.set(region.id, region);
    return region;
  }

  async updateRegion(id: string, updates: Partial<Region>): Promise<Region | undefined> {
    const region = this.regions.get(id);
    if (!region) return undefined;
    
    const updatedRegion = { ...region, ...updates };
    this.regions.set(id, updatedRegion);
    return updatedRegion;
  }

  // Session operations
  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = uuidv4();
    const now = new Date();
    const session: Session = { 
      id,
      playerId: insertSession.playerId,
      sessionToken: insertSession.sessionToken,
      regionId: insertSession.regionId,
      ipAddress: insertSession.ipAddress,
      userAgent: insertSession.userAgent ?? null,
      startedAt: now,
      lastActivity: now,
      endedAt: insertSession.endedAt ?? null,
      isActive: insertSession.isActive ?? true
    };
    this.sessions.set(id, session);
    return session;
  }

  async getActiveSession(playerId: string): Promise<Session | undefined> {
    return Array.from(this.sessions.values()).find(
      (session) => session.playerId === playerId && session.isActive
    );
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      session.endedAt = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  // Game events
  async createGameEvent(insertEvent: InsertGameEvent): Promise<GameEvent> {
    const id = uuidv4();
    const event: GameEvent = { 
      id,
      playerId: insertEvent.playerId ?? null,
      eventType: insertEvent.eventType,
      eventData: insertEvent.eventData,
      regionId: insertEvent.regionId ?? null,
      timestamp: new Date()
    };
    this.gameEvents.set(id, event);
    return event;
  }

  async getPlayerEvents(playerId: string, limit: number = 50): Promise<GameEvent[]> {
    return Array.from(this.gameEvents.values())
      .filter((event) => event.playerId === playerId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Guild operations
  async getGuild(id: string): Promise<Guild | undefined> {
    return this.guilds.get(id);
  }

  async createGuild(insertGuild: InsertGuild): Promise<Guild> {
    const id = uuidv4();
    const guild: Guild = { 
      id,
      name: insertGuild.name,
      description: insertGuild.description ?? null,
      leaderId: insertGuild.leaderId,
      memberCount: insertGuild.memberCount ?? 1,
      maxMembers: insertGuild.maxMembers ?? 50,
      level: insertGuild.level ?? 1,
      experience: insertGuild.experience ?? 0,
      createdAt: new Date()
    };
    this.guilds.set(id, guild);
    return guild;
  }

  async getPlayerGuild(playerId: string): Promise<Guild | undefined> {
    const player = await this.getPlayer(playerId);
    if (!player?.guild) return undefined;
    return this.getGuild(player.guild);
  }
}

export const storage = new MemStorage();
