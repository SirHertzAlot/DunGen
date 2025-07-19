import { 
  type Player, 
  type InsertPlayer, 
  type Region, 
  type InsertRegion,
  type World,
  type InsertWorld,
  type Block,
  type InsertBlock,
  type Cell,
  type InsertCell,
  type GameObject,
  type InsertGameObject,
  type Session,
  type InsertSession,
  type GameEvent,
  type InsertGameEvent,
  type Guild,
  type InsertGuild
} from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';

export interface IStorage {
  // World hierarchy operations
  createWorld(world: InsertWorld): Promise<World>;
  getWorld(id: string): Promise<World | undefined>;
  getAllWorlds(): Promise<World[]>;
  
  // Region operations
  getRegion(id: string): Promise<Region | undefined>;
  getAllRegions(): Promise<Region[]>;
  getRegionsByWorld(worldId: string): Promise<Region[]>;
  createRegion(region: InsertRegion): Promise<Region>;
  updateRegion(id: string, updates: Partial<Region>): Promise<Region | undefined>;
  
  // Block operations
  createBlock(block: InsertBlock): Promise<Block>;
  getBlock(id: string): Promise<Block | undefined>;
  getBlocksByRegion(regionId: string): Promise<Block[]>;
  
  // Cell operations
  createCell(cell: InsertCell): Promise<Cell>;
  getCell(id: string): Promise<Cell | undefined>;
  getCellsByBlock(blockId: string): Promise<Cell[]>;
  
  // Player operations
  getPlayer(id: string): Promise<Player | undefined>;
  getPlayerByUsername(username: string): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined>;
  getPlayersInRegion(regionId: string): Promise<Player[]>;
  
  // Game object operations - findable by UUID
  createGameObject(obj: InsertGameObject): Promise<GameObject>;
  getGameObject(id: string): Promise<GameObject | undefined>;
  findGameObjects(search: Partial<GameObject>): Promise<GameObject[]>;
  updateGameObject(id: string, updates: Partial<GameObject>): Promise<GameObject | undefined>;
  
  // Session operations
  createSession(session: InsertSession): Promise<Session>;
  getActiveSession(playerId: string): Promise<Session | undefined>;
  endSession(sessionId: string): Promise<void>;
  
  // Game events
  createGameEvent(event: InsertGameEvent): Promise<GameEvent>;
  getPlayerEvents(playerId: string, limit?: number): Promise<GameEvent[]>;
  getEventsByTrace(traceId: string): Promise<GameEvent[]>;
  
  // Guild operations
  getGuild(id: string): Promise<Guild | undefined>;
  createGuild(guild: InsertGuild): Promise<Guild>;
  getPlayerGuild(playerId: string): Promise<Guild | undefined>;
}

export class MemStorage implements IStorage {
  private worlds: Map<string, World>;
  private regions: Map<string, Region>;
  private blocks: Map<string, Block>;
  private cells: Map<string, Cell>;
  private players: Map<string, Player>;
  private gameObjects: Map<string, GameObject>;
  private sessions: Map<string, Session>;
  private gameEvents: Map<string, GameEvent>;
  private guilds: Map<string, Guild>;

  constructor() {
    this.worlds = new Map();
    this.regions = new Map();
    this.blocks = new Map();
    this.cells = new Map();
    this.players = new Map();
    this.gameObjects = new Map();
    this.sessions = new Map();
    this.gameEvents = new Map();
    this.guilds = new Map();
    
    // Initialize default world hierarchy for testing
    this.initializeDefaultRegions().catch(console.error);
  }

  private async initializeDefaultRegions() {
    // Create default world first
    const world = await this.createWorld({
      name: "Main World",
      description: "Primary game world",
      dimensions: 3,
      maxPlayers: 10000
    });

    const defaultRegions = [
      { 
        worldId: world.id,
        name: "Starting Plains", 
        gridX: 0, gridY: 0,
        minX: -100, maxX: 100, minY: -100, maxY: 100, minZ: 0, maxZ: 100,
        unificationContainerId: "container_region_0_0",
        serverNode: "node_1" 
      },
      { 
        worldId: world.id,
        name: "Dark Forest", 
        gridX: 0, gridY: 1,
        minX: -100, maxX: 100, minY: 100, maxY: 300, minZ: 0, maxZ: 100,
        unificationContainerId: "container_region_0_1",
        serverNode: "node_1" 
      },
      { 
        worldId: world.id,
        name: "Mountain Pass", 
        gridX: 1, gridY: 0,
        minX: 100, maxX: 300, minY: -100, maxY: 100, minZ: 0, maxZ: 200,
        unificationContainerId: "container_region_1_0",
        serverNode: "node_2" 
      },
    ];
    
    for (const regionData of defaultRegions) {
      await this.createRegion(regionData);
    }
  }

  // World operations
  async createWorld(worldData: InsertWorld): Promise<World> {
    const id = uuidv4();
    const world: World = {
      id,
      name: worldData.name,
      description: worldData.description || null,
      dimensions: worldData.dimensions || 3,
      maxPlayers: worldData.maxPlayers || 10000,
      status: worldData.status || "active",
      createdAt: new Date()
    };
    this.worlds.set(id, world);
    return world;
  }

  async getWorld(id: string): Promise<World | undefined> {
    return this.worlds.get(id);
  }

  async getAllWorlds(): Promise<World[]> {
    return Array.from(this.worlds.values());
  }

  // Block operations
  async createBlock(blockData: InsertBlock): Promise<Block> {
    const id = uuidv4();
    const block: Block = {
      id,
      regionId: blockData.regionId,
      name: blockData.name,
      gridX: blockData.gridX,
      gridY: blockData.gridY,
      minX: blockData.minX,
      maxX: blockData.maxX,
      minY: blockData.minY,
      maxY: blockData.maxY,
      minZ: blockData.minZ || null,
      maxZ: blockData.maxZ || null,
      biome: blockData.biome || null,
      generatedObjects: blockData.generatedObjects || [],
      createdAt: new Date()
    };
    this.blocks.set(id, block);
    return block;
  }

  async getBlock(id: string): Promise<Block | undefined> {
    return this.blocks.get(id);
  }

  async getBlocksByRegion(regionId: string): Promise<Block[]> {
    return Array.from(this.blocks.values()).filter(block => block.regionId === regionId);
  }

  // Cell operations
  async createCell(cellData: InsertCell): Promise<Cell> {
    const id = uuidv4();
    const cell: Cell = {
      id,
      blockId: cellData.blockId,
      gridX: cellData.gridX,
      gridY: cellData.gridY,
      minX: cellData.minX,
      maxX: cellData.maxX,
      minY: cellData.minY,
      maxY: cellData.maxY,
      minZ: cellData.minZ || null,
      maxZ: cellData.maxZ || null,
      terrainType: cellData.terrainType || null,
      objects: cellData.objects || [],
      createdAt: new Date()
    };
    this.cells.set(id, cell);
    return cell;
  }

  async getCell(id: string): Promise<Cell | undefined> {
    return this.cells.get(id);
  }

  async getCellsByBlock(blockId: string): Promise<Cell[]> {
    return Array.from(this.cells.values()).filter(cell => cell.blockId === blockId);
  }

  async getRegionsByWorld(worldId: string): Promise<Region[]> {
    return Array.from(this.regions.values()).filter(region => region.worldId === worldId);
  }

  // Game object operations - findable by UUID
  async createGameObject(objData: InsertGameObject): Promise<GameObject> {
    const id = uuidv4();
    const now = new Date();
    const gameObject: GameObject = {
      id,
      type: objData.type,
      name: objData.name,
      worldId: objData.worldId,
      regionId: objData.regionId,
      blockId: objData.blockId,
      cellId: objData.cellId,
      positionX: objData.positionX,
      positionY: objData.positionY,
      positionZ: objData.positionZ || null,
      properties: objData.properties || {},
      isActive: objData.isActive ?? true,
      createdAt: now,
      updatedAt: now
    };
    this.gameObjects.set(id, gameObject);
    return gameObject;
  }

  async getGameObject(id: string): Promise<GameObject | undefined> {
    return this.gameObjects.get(id);
  }

  async findGameObjects(search: Partial<GameObject>): Promise<GameObject[]> {
    return Array.from(this.gameObjects.values()).filter(obj => {
      return Object.entries(search).every(([key, value]) => {
        if (value === undefined) return true;
        return obj[key as keyof GameObject] === value;
      });
    });
  }

  async updateGameObject(id: string, updates: Partial<GameObject>): Promise<GameObject | undefined> {
    const existing = this.gameObjects.get(id);
    if (!existing) return undefined;

    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.gameObjects.set(id, updated);
    return updated;
  }

  async getEventsByTrace(traceId: string): Promise<GameEvent[]> {
    return Array.from(this.gameEvents.values()).filter(event => event.traceId === traceId);
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
    
    // Get the first available region for defaults if not provided
    const regions = Array.from(this.regions.values());
    const defaultRegion = regions.length > 0 ? regions[0] : null;
    
    const player: Player = { 
      id,
      username: insertPlayer.username,
      email: insertPlayer.email,
      passwordHash: insertPlayer.passwordHash,
      level: insertPlayer.level ?? 1,
      experience: insertPlayer.experience ?? 0,
      health: insertPlayer.health ?? 100,
      mana: insertPlayer.mana ?? 100,
      // Granular positioning
      worldId: insertPlayer.worldId ?? defaultRegion?.worldId ?? uuidv4(),
      regionId: insertPlayer.regionId ?? defaultRegion?.id ?? uuidv4(),
      blockId: insertPlayer.blockId ?? uuidv4(), // Should create default blocks/cells
      cellId: insertPlayer.cellId ?? uuidv4(),
      positionX: insertPlayer.positionX ?? 0,
      positionY: insertPlayer.positionY ?? 0,
      positionZ: insertPlayer.positionZ ?? null,
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
    const id = uuidv4();
    const region: Region = { 
      id,
      worldId: insertRegion.worldId,
      name: insertRegion.name,
      gridX: insertRegion.gridX,
      gridY: insertRegion.gridY,
      minX: insertRegion.minX,
      maxX: insertRegion.maxX,
      minY: insertRegion.minY,
      maxY: insertRegion.maxY,
      minZ: insertRegion.minZ ?? null,
      maxZ: insertRegion.maxZ ?? null,
      unificationContainerId: insertRegion.unificationContainerId,
      serverNode: insertRegion.serverNode,
      playerCount: insertRegion.playerCount ?? 0,
      maxPlayers: insertRegion.maxPlayers ?? 100,
      status: insertRegion.status ?? "active",
      createdAt: new Date()
    };
    this.regions.set(id, region);
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
      unificationContainerId: insertSession.unificationContainerId,
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
    const traceId = uuidv4();
    const event: GameEvent = { 
      id,
      traceId,
      playerId: insertEvent.playerId ?? null,
      gameObjectId: insertEvent.gameObjectId ?? null,
      eventType: insertEvent.eventType,
      eventData: insertEvent.eventData,
      worldId: insertEvent.worldId ?? null,
      regionId: insertEvent.regionId ?? null,
      blockId: insertEvent.blockId ?? null,
      cellId: insertEvent.cellId ?? null,
      unificationContainerId: insertEvent.unificationContainerId ?? null,
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
