/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse
 */

import rateLimit from 'express-rate-limit';

export const mcpRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'), // 100 requests per minute default
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please wait before making more requests.',
    retryAfter: '60 seconds'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

export const healthCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300, // More generous for health checks
  standardHeaders: true,
  legacyHeaders: false
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 failed attempts per 15 min (MCS makes many rapid calls during setup)
  skipSuccessfulRequests: true, // Only count failed auth attempts
  message: {
    error: 'Too Many Failed Authentication Attempts',
    message: 'Account temporarily locked. Please try again in 15 minutes.'
  }
});

// Strict rate limiter for public/unauthenticated endpoints
// Protects against DDoS and abuse of open endpoints
export const publicEndpointLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: parseInt(process.env.PUBLIC_RATE_LIMIT_MAX || '10'), // 10 requests per minute (very restrictive)
  message: {
    error: 'Too Many Requests',
    message: 'Public endpoint rate limit exceeded. This endpoint has strict limits. Consider using authenticated endpoints for higher limits.',
    retryAfter: '60 seconds'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  // Additional DDoS protection
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded for public endpoint. Please wait before making more requests.',
      hint: 'For higher limits, use authenticated endpoints: /mcp or /mcp/bearer',
      retryAfter: 60,
      ip: req.ip
    });
  }
});

