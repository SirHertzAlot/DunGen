import { z } from 'zod';

/**
 * Session model with validation schemas and utility functions
 * Handles session data structure, validation, and session management
 */

// Base session validation schema
export const SessionModelSchema = z.object({
  id: z.string().uuid(),
  playerId: z.string().uuid(),
  sessionToken: z.string().min(1),
  regionId: z.string().min(1),
  ipAddress: z.string().ip(),
  userAgent: z.string().nullable(),
  startedAt: z.date(),
  lastActivity: z.date(),
  endedAt: z.date().nullable(),
  isActive: z.boolean()
});

// Session creation schema
export const CreateSessionSchema = z.object({
  playerId: z.string().uuid(),
  sessionToken: z.string().min(1),
  regionId: z.string().min(1),
  ipAddress: z.string().ip(),
  userAgent: z.string().optional()
});

// Session activity update schema
export const UpdateSessionActivitySchema = z.object({
  sessionId: z.string().uuid(),
  lastActivity: z.date().optional().default(() => new Date()),
  regionId: z.string().optional()
});

// Session query schema
export const SessionQuerySchema = z.object({
  playerId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  regionId: z.string().optional(),
  ipAddress: z.string().ip().optional(),
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['startedAt', 'lastActivity', 'duration']).default('startedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

// Session statistics schema
export const SessionStatsSchema = z.object({
  totalSessions: z.number().int().min(0),
  activeSessions: z.number().int().min(0),
  uniquePlayers: z.number().int().min(0),
  averageSessionDuration: z.number().min(0), // in milliseconds
  sessionsByRegion: z.record(z.string(), z.number().int().min(0)),
  sessionsByHour: z.array(z.object({
    hour: z.number().int().min(0).max(23),
    count: z.number().int().min(0)
  })),
  recentLogins: z.number().int().min(0)
});

// Session event schema for tracking
export const SessionEventSchema = z.object({
  sessionId: z.string().uuid(),
  eventType: z.enum(['login', 'logout', 'timeout', 'region_change', 'activity_update']),
  eventData: z.record(z.any()),
  timestamp: z.date(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional()
});

// Multi-session management schema
export const MultiSessionSchema = z.object({
  playerId: z.string().uuid(),
  maxConcurrentSessions: z.number().int().min(1).max(5).default(1),
  allowMultipleRegions: z.boolean().default(false),
  currentSessions: z.array(SessionModelSchema)
});

// Type definitions
export type SessionModel = z.infer<typeof SessionModelSchema>;
export type CreateSession = z.infer<typeof CreateSessionSchema>;
export type UpdateSessionActivity = z.infer<typeof UpdateSessionActivitySchema>;
export type SessionQuery = z.infer<typeof SessionQuerySchema>;
export type SessionStats = z.infer<typeof SessionStatsSchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;
export type MultiSession = z.infer<typeof MultiSessionSchema>;

// Session utility functions
export class SessionModelUtils {
  
  /**
   * Validate session data against schema
   */
  static validateSession(data: any): SessionModel {
    return SessionModelSchema.parse(data);
  }

  /**
   * Generate secure session token
   */
  static generateSessionToken(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    const moreRandom = Math.random().toString(36).substring(2, 15);
    return `sess_${timestamp}_${random}_${moreRandom}`;
  }

  /**
   * Calculate session duration in milliseconds
   */
  static calculateDuration(session: SessionModel): number {
    const endTime = session.endedAt || new Date();
    return endTime.getTime() - session.startedAt.getTime();
  }

  /**
   * Calculate session duration in human-readable format
   */
  static formatDuration(durationMs: number): string {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Check if session is expired based on inactivity
   */
  static isSessionExpired(session: SessionModel, timeoutMinutes: number): boolean {
    if (!session.isActive) return true;
    
    const now = new Date();
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const timeSinceActivity = now.getTime() - session.lastActivity.getTime();
    
    return timeSinceActivity > timeoutMs;
  }

  /**
   * Check if session should be considered idle
   */
  static isSessionIdle(session: SessionModel, idleMinutes: number): boolean {
    if (!session.isActive) return false;
    
    const now = new Date();
    const idleMs = idleMinutes * 60 * 1000;
    const timeSinceActivity = now.getTime() - session.lastActivity.getTime();
    
    return timeSinceActivity > idleMs;
  }

  /**
   * Get session activity status
   */
  static getActivityStatus(session: SessionModel): 'active' | 'idle' | 'expired' | 'ended' {
    if (!session.isActive || session.endedAt) {
      return 'ended';
    }

    if (this.isSessionExpired(session, 30)) { // 30 minutes timeout
      return 'expired';
    }

    if (this.isSessionIdle(session, 5)) { // 5 minutes idle
      return 'idle';
    }

    return 'active';
  }

  /**
   * Validate IP address format
   */
  static validateIpAddress(ip: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Extract location info from IP (placeholder - would use IP geolocation service)
   */
  static getLocationFromIP(ip: string): { country?: string; region?: string; city?: string } {
    // Placeholder implementation - in production, use a service like MaxMind or IPinfo
    return {
      country: 'Unknown',
      region: 'Unknown',
      city: 'Unknown'
    };
  }

  /**
   * Parse user agent string
   */
  static parseUserAgent(userAgent: string | null): {
    browser?: string;
    browserVersion?: string;
    os?: string;
    device?: string;
  } {
    if (!userAgent) {
      return {};
    }

    const result: any = {};

    // Basic browser detection
    if (userAgent.includes('Chrome')) {
      result.browser = 'Chrome';
      const match = userAgent.match(/Chrome\/([0-9.]+)/);
      if (match) result.browserVersion = match[1];
    } else if (userAgent.includes('Firefox')) {
      result.browser = 'Firefox';
      const match = userAgent.match(/Firefox\/([0-9.]+)/);
      if (match) result.browserVersion = match[1];
    } else if (userAgent.includes('Safari')) {
      result.browser = 'Safari';
      const match = userAgent.match(/Version\/([0-9.]+)/);
      if (match) result.browserVersion = match[1];
    }

    // Basic OS detection
    if (userAgent.includes('Windows')) {
      result.os = 'Windows';
    } else if (userAgent.includes('Mac OS')) {
      result.os = 'macOS';
    } else if (userAgent.includes('Linux')) {
      result.os = 'Linux';
    } else if (userAgent.includes('Android')) {
      result.os = 'Android';
    } else if (userAgent.includes('iOS')) {
      result.os = 'iOS';
    }

    // Basic device detection
    if (userAgent.includes('Mobile')) {
      result.device = 'Mobile';
    } else if (userAgent.includes('Tablet')) {
      result.device = 'Tablet';
    } else {
      result.device = 'Desktop';
    }

    return result;
  }

  /**
   * Check for suspicious session activity
   */
  static detectSuspiciousActivity(session: SessionModel, previousSessions: SessionModel[]): {
    isSuspicious: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];

    // Check for rapid IP changes
    const recentSessions = previousSessions
      .filter(s => s.startedAt > new Date(Date.now() - 24 * 60 * 60 * 1000))
      .slice(0, 10);

    const uniqueIPs = new Set(recentSessions.map(s => s.ipAddress));
    if (uniqueIPs.size > 5) {
      reasons.push('Multiple IP addresses used in short period');
    }

    // Check for unusual session duration patterns
    const averageDuration = recentSessions
      .filter(s => s.endedAt)
      .reduce((sum, s) => sum + this.calculateDuration(s), 0) / recentSessions.length;

    const currentDuration = this.calculateDuration(session);
    if (averageDuration > 0 && (currentDuration > averageDuration * 10 || currentDuration < averageDuration * 0.1)) {
      reasons.push('Unusual session duration pattern');
    }

    // Check for concurrent sessions from different IPs
    const concurrentSessions = previousSessions.filter(s => 
      s.isActive && s.id !== session.id && s.ipAddress !== session.ipAddress
    );
    if (concurrentSessions.length > 0) {
      reasons.push('Concurrent sessions from different IP addresses');
    }

    return {
      isSuspicious: reasons.length > 0,
      reasons
    };
  }

  /**
   * Generate session summary for analytics
   */
  static generateSessionSummary(session: SessionModel): {
    id: string;
    playerId: string;
    duration: number;
    durationFormatted: string;
    activityStatus: string;
    location: any;
    deviceInfo: any;
    regionId: string;
  } {
    const duration = this.calculateDuration(session);
    
    return {
      id: session.id,
      playerId: session.playerId,
      duration,
      durationFormatted: this.formatDuration(duration),
      activityStatus: this.getActivityStatus(session),
      location: this.getLocationFromIP(session.ipAddress),
      deviceInfo: this.parseUserAgent(session.userAgent),
      regionId: session.regionId
    };
  }

  /**
   * Clean expired sessions from a list
   */
  static cleanExpiredSessions(sessions: SessionModel[], timeoutMinutes: number): {
    active: SessionModel[];
    expired: SessionModel[];
  } {
    const active: SessionModel[] = [];
    const expired: SessionModel[] = [];

    sessions.forEach(session => {
      if (this.isSessionExpired(session, timeoutMinutes)) {
        expired.push(session);
      } else {
        active.push(session);
      }
    });

    return { active, expired };
  }

  /**
   * Group sessions by time period
   */
  static groupSessionsByTime(
    sessions: SessionModel[], 
    period: 'hour' | 'day' | 'week'
  ): Record<string, SessionModel[]> {
    const groups: Record<string, SessionModel[]> = {};

    sessions.forEach(session => {
      let key: string;
      const date = session.startedAt;

      switch (period) {
        case 'hour':
          key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
          break;
        case 'day':
          key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
          break;
        default:
          key = date.toISOString();
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(session);
    });

    return groups;
  }

  /**
   * Calculate session statistics
   */
  static calculateStatistics(sessions: SessionModel[]): SessionStats {
    const activeSessions = sessions.filter(s => s.isActive);
    const completedSessions = sessions.filter(s => s.endedAt);
    
    const totalDuration = completedSessions.reduce((sum, s) => sum + this.calculateDuration(s), 0);
    const averageSessionDuration = completedSessions.length > 0 ? totalDuration / completedSessions.length : 0;

    const sessionsByRegion: Record<string, number> = {};
    activeSessions.forEach(session => {
      sessionsByRegion[session.regionId] = (sessionsByRegion[session.regionId] || 0) + 1;
    });

    const sessionsByHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: sessions.filter(s => s.startedAt.getHours() === hour).length
    }));

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentLogins = sessions.filter(s => s.startedAt >= oneHourAgo).length;

    const uniquePlayers = new Set(sessions.map(s => s.playerId)).size;

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      uniquePlayers,
      averageSessionDuration,
      sessionsByRegion,
      sessionsByHour,
      recentLogins
    };
  }
}

export default SessionModelUtils;
