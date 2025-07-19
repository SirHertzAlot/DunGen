import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { sessionRepository } from '../../persistence/repos/sessionRepository';
import { logger } from '../../logging/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role?: string;
  };
  session?: {
    id: string;
    token: string;
  };
}

export class AuthMiddleware {
  // JWT token verification
  static verifyToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

      if (!token) {
        return res.status(401).json({ error: 'Access token required' });
      }

      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = {
        id: decoded.userId,
        username: decoded.username,
        role: decoded.role
      };

      next();
    } catch (error) {
      logger.warn('Invalid token', { error: error.message });
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
  }

  // Session-based authentication
  static async verifySession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const sessionToken = req.headers['x-session-token'] as string;

      if (!sessionToken) {
        return res.status(401).json({ error: 'Session token required' });
      }

      const session = await sessionRepository.findByToken(sessionToken);

      if (!session || !session.isActive) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      // Update last activity
      await sessionRepository.updateActivity(session.id);

      req.user = {
        id: session.playerId,
        username: '', // Would need to fetch from player repository
      };

      req.session = {
        id: session.id,
        token: sessionToken
      };

      next();
    } catch (error) {
      logger.error('Session verification failed', { error: error.message });
      res.status(500).json({ error: 'Authentication error' });
    }
  }

  // Role-based access control
  static requireRole(roles: string | string[]) {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!req.user.role || !allowedRoles.includes(req.user.role)) {
        logger.warn('Insufficient permissions', {
          userId: req.user.id,
          userRole: req.user.role,
          requiredRoles: allowedRoles
        });
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    };
  }

  // Admin access only
  static requireAdmin = AuthMiddleware.requireRole(['admin']);

  // Moderator or admin access
  static requireModerator = AuthMiddleware.requireRole(['admin', 'moderator']);

  // Player authentication (for game endpoints)
  static requirePlayer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    if (!req.user) {
      return res.status(401).json({ error: 'Player authentication required' });
    }

    // Additional player-specific checks can be added here
    next();
  }

  // Optional authentication (user info if available, but doesn't require it)
  static optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = {
          id: decoded.userId,
          username: decoded.username,
          role: decoded.role
        };
      }
    } catch (error) {
      // Ignore token errors for optional auth
      logger.debug('Optional auth failed', { error: error.message });
    }

    next();
  }
}

// Utility functions for authentication
export class AuthUtils {
  static generateToken(userId: string, username: string, role?: string): string {
    return jwt.sign(
      { userId, username, role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateSessionToken(): string {
    return jwt.sign(
      { type: 'session', timestamp: Date.now() },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  }
}

// Export middleware functions
export const {
  verifyToken,
  verifySession,
  requireRole,
  requireAdmin,
  requireModerator,
  requirePlayer,
  optionalAuth
} = AuthMiddleware;
