import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { logger } from '../../logging/logger';

export interface ValidationOptions {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validate(schemas: ValidationOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Validation failed', { 
          path: req.path, 
          method: req.method, 
          errors: error.errors 
        });
        
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
            received: err.received
          }))
        });
      }
      
      logger.error('Validation middleware error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// Common validation schemas
export const commonSchemas = {
  uuid: z.string().uuid('Invalid UUID format'),
  positiveInt: z.coerce.number().int().min(1, 'Must be a positive integer'),
  paginationQuery: z.object({
    limit: z.coerce.number().min(1).max(1000).default(50),
    offset: z.coerce.number().min(0).default(0)
  }),
  regionCoordinates: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number().optional().default(0)
  })
};

// Middleware for specific common validations
export const validateUUID = (paramName: string) => {
  return validate({
    params: z.object({
      [paramName]: commonSchemas.uuid
    })
  });
};

export const validatePagination = validate({
  query: commonSchemas.paginationQuery
});

export const validateRegionCoordinates = validate({
  body: commonSchemas.regionCoordinates
});
