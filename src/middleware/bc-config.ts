/**
 * Business Central Configuration Middleware
 * Tries URL-based configuration first, then falls back to environment variables
 * This allows the same endpoint to work with both URL-based and env-var-based configuration
 */

import { Request, Response, NextFunction } from 'express';
import { BCConfigParser } from '../bc/config.js';
import { logger } from '../utils/logger.js';

/**
 * Parse BC configuration from request URL or environment variables
 *
 * Priority:
 * 1. URL-based configuration (e.g., /{tenantId}/{env}/api/{version}/companies({companyId}))
 * 2. Environment variables (BC_TENANT_ID, BC_ENVIRONMENT_NAME, BC_COMPANY_ID)
 *
 * This allows the same endpoint to work in both modes:
 * - Advanced: URL-based for multi-tenant scenarios
 * - Simple: Environment variables for single-tenant scenarios
 */
export function parseBCConfigWithFallback(req: Request, res: Response, next: NextFunction): void {
  try {
    // Try URL-based configuration first (original behavior)
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    try {
      (req as any).bcConfig = BCConfigParser.parseFromUrl(fullUrl);
      logger.debug('BC config parsed from URL', {
        tenantId: (req as any).bcConfig.tenantId,
        environment: (req as any).bcConfig.environment
      });
      next();
      return;
    } catch (urlError) {
      // URL parsing failed - try environment variables fallback
      logger.debug('URL-based BC config parsing failed, trying environment variables', {
        error: urlError instanceof Error ? urlError.message : 'Unknown error'
      });
    }

    // Fallback to environment variables
    const tenantId = process.env.BC_TENANT_ID;
    const environment = process.env.BC_ENVIRONMENT_NAME;
    const companyId = process.env.BC_COMPANY_ID || '00000000-0000-0000-0000-000000000000';
    const apiVersion = process.env.BC_API_VERSION || 'v2.0';

    if (!tenantId || !environment) {
      // Neither URL nor environment variables provided
      res.status(400).json({
        error: 'Missing Business Central configuration',
        message: 'Please provide BC configuration either via URL path or environment variables',
        urlFormat: [
          '/{tenantId}/{env}/api/{version}/companies({companyId})',
          '/{tenantId}/{env}/api/{publisher}/{group}/{version}/companies({companyId})'
        ],
        environmentVariables: {
          required: ['BC_TENANT_ID', 'BC_ENVIRONMENT_NAME'],
          optional: ['BC_COMPANY_ID', 'BC_API_VERSION'],
          current: {
            BC_TENANT_ID: tenantId ? 'Set' : 'MISSING',
            BC_ENVIRONMENT_NAME: environment ? 'Set' : 'MISSING',
            BC_COMPANY_ID: companyId ? 'Set' : 'Using default',
            BC_API_VERSION: apiVersion
          }
        }
      });
      return;
    }

    // Build BC config from environment variables
    const envUrl = `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/${environment}/api/${apiVersion}/companies(${companyId})`;

    try {
      (req as any).bcConfig = BCConfigParser.parseFromUrl(envUrl);
      logger.info('BC config parsed from environment variables', {
        tenantId,
        environment,
        apiVersion
      });
      next();
    } catch (envError) {
      res.status(500).json({
        error: 'Failed to parse BC configuration from environment variables',
        message: envError instanceof Error ? envError.message : 'Unknown error',
        environmentVariables: {
          BC_TENANT_ID: tenantId,
          BC_ENVIRONMENT_NAME: environment,
          BC_COMPANY_ID: companyId,
          BC_API_VERSION: apiVersion
        }
      });
    }
  } catch (error) {
    logger.error('Unexpected error in BC config middleware', error instanceof Error ? error : undefined);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Strict URL-based BC config parser (original behavior, no fallback)
 * Use this for endpoints that MUST have URL-based configuration
 */
export function parseBCConfigStrict(req: Request, res: Response, next: NextFunction): void {
  try {
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    (req as any).bcConfig = BCConfigParser.parseFromUrl(fullUrl);
    next();
  } catch (error) {
    res.status(400).json({
      error: 'Invalid URL format',
      message: error instanceof Error ? error.message : 'Unknown error',
      expected: [
        '/{tenantId}/{env}/api/{version}/companies({companyId})',
        '/{tenantId}/{env}/api/{publisher}/{group}/{version}/companies({companyId})'
      ]
    });
  }
}
