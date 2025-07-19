import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { logger } from '../../logging/logger';
import { prometheusMiddleware } from '../../monitoring/prometheusExporter';
import { apiRoutes } from '../../api/routes';
import { AuthMiddleware } from '../../api/middleware/auth';

/**
 * REST API Handler for MMORPG backend
 * Provides RESTful endpoints with proper middleware, validation, and error handling
 */

export interface RestConfig {
  port: number;
  corsOrigins: string[];
  rateLimiting: {
    windowMs: number;
    max: number;
  };
  compression: boolean;
  helmet: boolean;
  bodyLimit: string;
}

export class RestHandler {
  private app: express.Application;
  private server?: any;
  private config: RestConfig;
  private isInitialized = false;

  constructor(config?: Partial<RestConfig>) {
    this.config = {
      port: parseInt(process.env.REST_PORT || '8000'),
      corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5000'],
      rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000 // limit each IP to 1000 requests per windowMs
      },
      compression: true,
      helmet: true,
      bodyLimit: '10mb',
      ...config
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    if (this.config.helmet) {
      this.app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      }));
    }

    // CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        if (this.config.corsOrigins.includes(origin) || 
            this.config.corsOrigins.includes('*')) {
          return callback(null, true);
        }
        
        const msg = `CORS policy violation: Origin ${origin} not allowed`;
        logger.warn(msg, { origin });
        return callback(new Error(msg), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Session-Token',
        'X-Request-ID'
      ]
    }));

    // Compression
    if (this.config.compression) {
      this.app.use(compression({
        level: 6,
        threshold: 1024,
        filter: (req, res) => {
          if (req.headers['x-no-compression']) {
            return false;
          }
          return compression.filter(req, res);
        }
      }));
    }

    // Body parsing
    this.app.use(express.json({ limit: this.config.bodyLimit }));
    this.app.use(express.urlencoded({ extended: true, limit: this.config.bodyLimit }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      req.requestId = requestId as any;
      res.setHeader('X-Request-ID', requestId);

      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('REST Request', {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      });

      next();
    });

    // Rate limiting
    this.app.use(rateLimit({
      windowMs: this.config.rateLimiting.windowMs,
      max: this.config.rateLimiting.max,
      message: {
        error: 'Too many requests',
        retryAfter: Math.ceil(this.config.rateLimiting.windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        return req.ip || 'unknown';
      },
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/metrics';
      }
    }));

    // Prometheus metrics
    this.app.use(prometheusMiddleware());

    // Request timeout
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.setTimeout(30000, () => {
        logger.warn('Request timeout', {
          method: req.method,
          path: req.path,
          ip: req.ip
        });
        
        if (!res.headersSent) {
          res.status(408).json({
            error: 'Request timeout',
            message: 'The request took too long to process'
          });
        }
      });
      
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // API documentation endpoint
    this.app.get('/api/docs', (req: Request, res: Response) => {
      res.json({
        title: 'MMORPG Backend API',
        version: '1.0.0',
        description: 'RESTful API for MMORPG backend services',
        endpoints: {
          players: {
            'GET /api/players/:id': 'Get player by ID',
            'POST /api/players': 'Create new player',
            'PUT /api/players/:id': 'Update player',
            'DELETE /api/players/:id': 'Delete player',
            'POST /api/players/:id/move': 'Move player',
          },
          world: {
            'GET /api/world/regions': 'Get all regions',
            'GET /api/world/regions/:id': 'Get region by ID',
            'POST /api/world/regions': 'Create region (admin)',
            'PUT /api/world/regions/:id/status': 'Update region status (admin)',
            'POST /api/world/events': 'Log game event',
            'GET /api/world/events': 'Get game events',
          },
          game: {
            'POST /api/game/combat/attack': 'Perform attack',
            'POST /api/game/chat/message': 'Send chat message',
            'POST /api/game/trade/initiate': 'Initiate trade',
          },
          admin: {
            'GET /api/admin/stats/overview': 'Get system statistics (admin)',
            'GET /api/admin/players/search': 'Search players (admin)',
            'POST /api/admin/maintenance/mode': 'Toggle maintenance mode (admin)',
          }
        },
        authentication: {
          header: 'Authorization: Bearer <token>',
          session: 'X-Session-Token: <session_token>'
        }
      });
    });

    // Mount API routes
    this.app.use('/api', apiRoutes);

    // Serve static files for admin dashboard (if in production)
    if (process.env.NODE_ENV === 'production') {
      this.app.use('/admin', express.static('admin/dist'));
      
      // Admin dashboard fallback
      this.app.get('/admin/*', (req: Request, res: Response) => {
        res.sendFile('admin/dist/index.html', { root: process.cwd() });
      });
    }

    // Catch-all route for undefined endpoints
    this.app.all('*', (req: Request, res: Response) => {
      logger.warn('Route not found', {
        method: req.method,
        path: req.path,
        ip: req.ip
      });

      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
        available_endpoints: '/api/docs'
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      const requestId = (req as any).requestId || 'unknown';
      
      logger.error('REST API Error', {
        requestId,
        error: error.message,
        stack: error.stack,
        method: req.method,
        path: req.path,
        body: req.body,
        query: req.query,
        params: req.params,
        ip: req.ip
      });

      // Don't expose internal errors in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      let statusCode = 500;
      let message = 'Internal Server Error';
      
      if (error.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation Error';
      } else if (error.name === 'UnauthorizedError') {
        statusCode = 401;
        message = 'Unauthorized';
      } else if (error.name === 'ForbiddenError') {
        statusCode = 403;
        message = 'Forbidden';
      } else if (error.name === 'NotFoundError') {
        statusCode = 404;
        message = 'Not Found';
      } else if (error.name === 'ConflictError') {
        statusCode = 409;
        message = 'Conflict';
      }

      const errorResponse: any = {
        error: message,
        requestId,
        timestamp: new Date().toISOString()
      };

      if (isDevelopment) {
        errorResponse.details = error.message;
        errorResponse.stack = error.stack;
      }

      res.status(statusCode).json(errorResponse);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at Promise', {
        promise,
        reason: reason instanceof Error ? reason.message : reason
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception thrown', {
        error: error.message,
        stack: error.stack
      });
      
      // Graceful shutdown
      process.exit(1);
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.server = this.app.listen(this.config.port, '0.0.0.0', () => {
        logger.info(`REST API server listening on port ${this.config.port}`, {
          port: this.config.port,
          environment: process.env.NODE_ENV || 'development',
          corsOrigins: this.config.corsOrigins
        });
      });

      this.server.on('error', (error: any) => {
        logger.error('REST server error', { error: error.message });
        throw error;
      });

      this.isInitialized = true;
      logger.info('REST handler initialized');
    } catch (error) {
      logger.error('Failed to initialize REST handler', { error: error.message });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down REST handler');
    
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server.close((error: any) => {
          if (error) {
            logger.error('Error shutting down REST server', { error: error.message });
            reject(error);
          } else {
            logger.info('REST server shutdown complete');
            this.isInitialized = false;
            resolve();
          }
        });
      });
    }
  }

  getApp(): express.Application {
    return this.app;
  }

  getConfig(): RestConfig {
    return { ...this.config };
  }
}

// Create and export singleton instance
export const restHandler = new RestHandler();

export default restHandler;
