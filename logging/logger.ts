import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

// Logger interface for DRY principle
export interface ILogger {
  info(message: string, context?: any): void;
  error(message: string, error?: Error, context?: any): void;
  warn(message: string, context?: any): void;
  debug(message: string, context?: any): void;
}

// Create a logger instance with UUID tracking
class MMORPGLogger implements ILogger {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            message,
            requestId: meta.requestId || uuidv4(),
            playerId: meta.playerId,
            regionId: meta.regionId,
            service: meta.service,
            ...meta
          });
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
          filename: 'logs/error.log', 
          level: 'error' 
        }),
        new winston.transports.File({ 
          filename: 'logs/combined.log' 
        })
      ]
    });
  }

  info(message: string, context: any = {}): void {
    this.logger.info(message, context);
  }

  error(message: string, error?: Error, context: any = {}): void {
    this.logger.error(message, {
      ...context,
      error: error?.message,
      stack: error?.stack
    });
  }

  warn(message: string, context: any = {}): void {
    this.logger.warn(message, context);
  }

  debug(message: string, context: any = {}): void {
    this.logger.debug(message, context);
  }
}

export const logger = new MMORPGLogger();