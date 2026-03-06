/**
 * Request ID Middleware
 * Generates and tracks unique request IDs for correlation and debugging
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

// Extend Express Request type for custom properties used across middleware
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      bcConfig?: any;
      accessToken?: string;
      user?: any;
    }
  }
}

/**
 * Request ID middleware
 * - Accepts X-Request-ID header from client
 * - Generates UUID if not provided
 * - Adds to response headers
 * - Logs request details with ID
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing X-Request-ID if valid (alphanumeric + hyphens/underscores, max 128 chars)
  const incoming = req.headers['x-request-id'] as string;
  const isValid = incoming && /^[a-zA-Z0-9_-]{1,128}$/.test(incoming);
  const requestId = isValid ? incoming : randomUUID();

  // Attach to request object for use in handlers
  req.requestId = requestId;

  // Add to response headers for client correlation
  res.setHeader('X-Request-ID', requestId);

  // Log incoming request with ID
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    contentLength: req.headers['content-length']
  });

  // Track request timing
  const startTime = Date.now();

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
}

/**
 * Get request ID from request object
 * Useful for adding to error logs and responses
 */
export function getRequestId(req: Request): string | undefined {
  return req.requestId;
}
