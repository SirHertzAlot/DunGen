import { Session, InsertSession } from '@shared/schema';
import { logger } from '../../logging/logger';

/**
 * Session repository for managing player sessions and authentication
 * Handles session tracking, validation, and cleanup
 */
export interface ISessionRepository {
  create(session: InsertSession): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  findByToken(sessionToken: string): Promise<Session | null>;
  findByPlayerId(playerId: string): Promise<Session[]>;
  findActiveByPlayerId(playerId: string): Promise<Session | null>;
  updateActivity(id: string): Promise<Session | null>;
  endSession(id: string): Promise<boolean>;
  endPlayerSessions(playerId: string): Promise<number>;
  findExpiredSessions(timeoutMinutes: number): Promise<Session[]>;
  cleanupExpiredSessions(timeoutMinutes: number): Promise<number>;
  getActiveSessions(): Promise<Session[]>;
  getSessionStats(): Promise<SessionStatistics>;
}

export interface SessionStatistics {
  totalSessions: number;
  activeSessions: number;
  uniquePlayers: number;
  averageSessionDuration: number;
  sessionsByRegion: Record<string, number>;
  recentLogins: number; // Last hour
  sessionsByIpAddress: Record<string, number>;
}

export class MemSessionRepository implements ISessionRepository {
  private sessions: Map<string, Session> = new Map();
  private tokenIndex: Map<string, string> = new Map();
  private playerIndex: Map<string, Set<string>> = new Map();
  private currentId = 1;

  async create(sessionData: InsertSession): Promise<Session> {
    try {
      // Check if session token already exists
      if (this.tokenIndex.has(sessionData.sessionToken)) {
        throw new Error('Session token already exists');
      }

      const id = `session_${this.currentId++}`;
      const now = new Date();

      const session: Session = {
        id,
        playerId: sessionData.playerId,
        sessionToken: sessionData.sessionToken,
        regionId: sessionData.regionId,
        ipAddress: sessionData.ipAddress,
        userAgent: sessionData.userAgent || null,
        startedAt: now,
        lastActivity: now,
        endedAt: null,
        isActive: true
      };

      this.sessions.set(id, session);
      this.tokenIndex.set(session.sessionToken, id);
      this.addToPlayerIndex(session.playerId, id);

      logger.info('Session created', { 
        sessionId: id, 
        playerId: session.playerId,
        ipAddress: session.ipAddress 
      });

      return session;
    } catch (error) {
      logger.error('Failed to create session', { error: error.message, sessionData });
      throw error;
    }
  }

  async findById(id: string): Promise<Session | null> {
    return this.sessions.get(id) || null;
  }

  async findByToken(sessionToken: string): Promise<Session | null> {
    const id = this.tokenIndex.get(sessionToken);
    return id ? this.sessions.get(id) || null : null;
  }

  async findByPlayerId(playerId: string): Promise<Session[]> {
    const sessionIds = this.playerIndex.get(playerId) || new Set();
    const sessions: Session[] = [];

    for (const id of sessionIds) {
      const session = this.sessions.get(id);
      if (session) {
        sessions.push(session);
      }
    }

    // Sort by start time (newest first)
    sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return sessions;
  }

  async findActiveByPlayerId(playerId: string): Promise<Session | null> {
    const sessionIds = this.playerIndex.get(playerId) || new Set();

    for (const id of sessionIds) {
      const session = this.sessions.get(id);
      if (session && session.isActive) {
        return session;
      }
    }

    return null;
  }

  async updateActivity(id: string): Promise<Session | null> {
    try {
      const session = this.sessions.get(id);
      if (!session) {
        return null;
      }

      session.lastActivity = new Date();
      this.sessions.set(id, session);

      logger.debug('Session activity updated', { sessionId: id });
      return session;
    } catch (error) {
      logger.error('Failed to update session activity', { error: error.message, sessionId: id });
      throw error;
    }
  }

  async endSession(id: string): Promise<boolean> {
    try {
      const session = this.sessions.get(id);
      if (!session) {
        return false;
      }

      session.isActive = false;
      session.endedAt = new Date();
      this.sessions.set(id, session);

      logger.info('Session ended', { 
        sessionId: id, 
        playerId: session.playerId,
        duration: session.endedAt.getTime() - session.startedAt.getTime()
      });

      return true;
    } catch (error) {
      logger.error('Failed to end session', { error: error.message, sessionId: id });
      throw error;
    }
  }

  async endPlayerSessions(playerId: string): Promise<number> {
    try {
      const sessionIds = this.playerIndex.get(playerId) || new Set();
      let endedCount = 0;

      for (const id of sessionIds) {
        const session = this.sessions.get(id);
        if (session && session.isActive) {
          session.isActive = false;
          session.endedAt = new Date();
          this.sessions.set(id, session);
          endedCount++;
        }
      }

      logger.info('Player sessions ended', { playerId, endedCount });
      return endedCount;
    } catch (error) {
      logger.error('Failed to end player sessions', { error: error.message, playerId });
      throw error;
    }
  }

  async findExpiredSessions(timeoutMinutes: number): Promise<Session[]> {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - timeoutMinutes);

    const expiredSessions: Session[] = [];

    for (const session of this.sessions.values()) {
      if (session.isActive && session.lastActivity < cutoffTime) {
        expiredSessions.push(session);
      }
    }

    return expiredSessions;
  }

  async cleanupExpiredSessions(timeoutMinutes: number): Promise<number> {
    try {
      const expiredSessions = await this.findExpiredSessions(timeoutMinutes);
      let cleanedCount = 0;

      for (const session of expiredSessions) {
        session.isActive = false;
        session.endedAt = new Date();
        this.sessions.set(session.id, session);
        cleanedCount++;
      }

      if (cleanedCount > 0) {
        logger.info('Expired sessions cleaned up', { cleanedCount, timeoutMinutes });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', { error: error.message, timeoutMinutes });
      throw error;
    }
  }

  async getActiveSessions(): Promise<Session[]> {
    const activeSessions: Session[] = [];

    for (const session of this.sessions.values()) {
      if (session.isActive) {
        activeSessions.push(session);
      }
    }

    return activeSessions;
  }

  async getSessionStats(): Promise<SessionStatistics> {
    const sessions = Array.from(this.sessions.values());
    const activeSessions = sessions.filter(s => s.isActive);
    const uniquePlayers = new Set(sessions.map(s => s.playerId)).size;
    
    // Calculate average session duration for completed sessions
    const completedSessions = sessions.filter(s => s.endedAt);
    const totalDuration = completedSessions.reduce((sum, s) => {
      return sum + (s.endedAt!.getTime() - s.startedAt.getTime());
    }, 0);
    const averageSessionDuration = completedSessions.length > 0 
      ? totalDuration / completedSessions.length 
      : 0;

    // Sessions by region
    const sessionsByRegion: Record<string, number> = {};
    for (const session of activeSessions) {
      sessionsByRegion[session.regionId] = (sessionsByRegion[session.regionId] || 0) + 1;
    }

    // Recent logins (last hour)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    const recentLogins = sessions.filter(s => s.startedAt >= oneHourAgo).length;

    // Sessions by IP address
    const sessionsByIpAddress: Record<string, number> = {};
    for (const session of activeSessions) {
      sessionsByIpAddress[session.ipAddress] = (sessionsByIpAddress[session.ipAddress] || 0) + 1;
    }

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      uniquePlayers,
      averageSessionDuration,
      sessionsByRegion,
      recentLogins,
      sessionsByIpAddress
    };
  }

  // Helper methods
  private addToPlayerIndex(playerId: string, sessionId: string): void {
    if (!this.playerIndex.has(playerId)) {
      this.playerIndex.set(playerId, new Set());
    }
    this.playerIndex.get(playerId)!.add(sessionId);
  }

  private removeFromPlayerIndex(playerId: string, sessionId: string): void {
    const playerSessions = this.playerIndex.get(playerId);
    if (playerSessions) {
      playerSessions.delete(sessionId);
      if (playerSessions.size === 0) {
        this.playerIndex.delete(playerId);
      }
    }
  }

  // Additional utility methods
  async deleteSession(id: string): Promise<boolean> {
    try {
      const session = this.sessions.get(id);
      if (!session) {
        return false;
      }

      // Remove from indexes
      this.tokenIndex.delete(session.sessionToken);
      this.removeFromPlayerIndex(session.playerId, id);
      this.sessions.delete(id);

      logger.info('Session deleted', { sessionId: id, playerId: session.playerId });
      return true;
    } catch (error) {
      logger.error('Failed to delete session', { error: error.message, sessionId: id });
      throw error;
    }
  }

  async findSessionsByIpAddress(ipAddress: string): Promise<Session[]> {
    const sessions: Session[] = [];

    for (const session of this.sessions.values()) {
      if (session.ipAddress === ipAddress) {
        sessions.push(session);
      }
    }

    // Sort by start time (newest first)
    sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return sessions;
  }

  async findRecentSessions(hours: number = 24): Promise<Session[]> {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hours);

    const recentSessions: Session[] = [];

    for (const session of this.sessions.values()) {
      if (session.startedAt >= cutoffTime) {
        recentSessions.push(session);
      }
    }

    // Sort by start time (newest first)
    recentSessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return recentSessions;
  }

  async getSessionDuration(id: string): Promise<number | null> {
    const session = this.sessions.get(id);
    if (!session) {
      return null;
    }

    const endTime = session.endedAt || new Date();
    return endTime.getTime() - session.startedAt.getTime();
  }

  // Batch operations
  async createBatch(sessions: InsertSession[]): Promise<Session[]> {
    const createdSessions: Session[] = [];

    for (const sessionData of sessions) {
      try {
        const session = await this.create(sessionData);
        createdSessions.push(session);
      } catch (error) {
        logger.error('Failed to create session in batch', { 
          error: error.message, 
          sessionData 
        });
      }
    }

    return createdSessions;
  }

  async endBatch(sessionIds: string[]): Promise<number> {
    let endedCount = 0;

    for (const id of sessionIds) {
      try {
        if (await this.endSession(id)) {
          endedCount++;
        }
      } catch (error) {
        logger.error('Failed to end session in batch', { 
          error: error.message, 
          sessionId: id 
        });
      }
    }

    return endedCount;
  }

  getRepositoryStats() {
    return {
      totalSessions: this.sessions.size,
      uniqueTokens: this.tokenIndex.size,
      playersWithSessions: this.playerIndex.size,
      activeSessions: Array.from(this.sessions.values()).filter(s => s.isActive).length
    };
  }
}

export const sessionRepository = new MemSessionRepository();
