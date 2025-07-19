import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { logger } from '../../logging/logger';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const key = this.getKey(req);
        const current = await this.increment(key);
        
        const remaining = Math.max(0, this.config.maxRequests - current);
        const resetTime = Date.now() + this.config.windowMs;
        
        // Set headers
        res.set({
          'X-RateLimit-Limit': this.config.maxRequests.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': new Date(resetTime).toISOString()
        });

        if (current > this.config.maxRequests) {
          logger.warn('Rate limit exceeded', {
            key,
            current,
            limit: this.config.maxRequests,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });
          
          return res.status(429).json({
            error: 'Too many requests',
            message: `Rate limit exceeded. Maximum ${this.config.maxRequests} requests per ${this.config.windowMs / 1000} seconds.`,
            retryAfter: Math.ceil(this.config.windowMs / 1000)
          });
        }

        next();
      } catch (error) {
        logger.error('Rate limiting error', { error: error.message });
        // Allow request through on Redis error
        next();
      }
    };
  }

  private getKey(req: Request): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(req);
    }
    
    // Default key generation
    const ip = req.ip || req.connection.remoteAddress;
    const route = req.route?.path || req.path;
    return `rate_limit:${ip}:${route}`;
  }

  private async increment(key: string): Promise<number> {
    const multi = redis.multi();
    multi.incr(key);
    multi.expire(key, Math.ceil(this.config.windowMs / 1000));
    
    const results = await multi.exec();
    return results?.[0]?.[1] as number || 0;
  }
}

// Predefined rate limiters for different endpoints
export const rateLimiters = {
  // General API rate limiting
  general: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100
  }),

  // Authentication endpoints
  auth: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyGenerator: (req) => `auth:${req.ip}:${req.body?.username || 'unknown'}`
  }),

  // Player actions (movement, combat, etc.)
  playerActions: new RateLimiter({
    windowMs: 1000, // 1 second
    maxRequests: 10,
    keyGenerator: (req) => `player_action:${req.user?.id || req.ip}`
  }),

  // Chat/messaging
  chat: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    keyGenerator: (req) => `chat:${req.user?.id || req.ip}`
  }),

  // Admin operations
  admin: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200,
    keyGenerator: (req) => `admin:${req.user?.id || req.ip}`
  }),

  // Heavy operations (reports, exports)
  heavy: new RateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    keyGenerator: (req) => `heavy:${req.user?.id || req.ip}`
  })
};

// Rate limiting middleware functions
export const generalRateLimit = rateLimiters.general.middleware();
export const authRateLimit = rateLimiters.auth.middleware();
export const playerActionRateLimit = rateLimiters.playerActions.middleware();
export const chatRateLimit = rateLimiters.chat.middleware();
export const adminRateLimit = rateLimiters.admin.middleware();
export const heavyRateLimit = rateLimiters.heavy.middleware();

// Dynamic rate limiter creator
export function createRateLimit(config: RateLimitConfig) {
  return new RateLimiter(config).middleware();
}
