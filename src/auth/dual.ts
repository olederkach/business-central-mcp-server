/**
 * Dual Authentication Middleware
 * Supports BOTH API Key AND OAuth token authentication for Copilot Studio
 *
 * Use Cases:
 * - API Key: MCP protocol discovery (initialize, tools/list, resources/list, prompts/list)
 * - OAuth: User-initiated tool execution (with user context for audit logging)
 *
 * This allows Copilot Studio to:
 * 1. Discover MCP capabilities using API Key (no user context needed)
 * 2. Execute tools using OAuth tokens (with user context)
 */

import { Request, Response, NextFunction } from 'express';
import { ApiKeyAuth } from './api-key.js';
import { MCPOAuthAuth } from './oauth-mcp.js';
import { logger } from '../utils/logger.js';

export class DualAuth {
  private apiKeyAuth: ApiKeyAuth;
  private oauthAuth: MCPOAuthAuth;

  constructor(keyVaultName?: string) {
    this.apiKeyAuth = new ApiKeyAuth(keyVaultName);
    const requiredScope = process.env.MCP_OAUTH_REQUIRED_SCOPE ?? 'MCP.Access';
    this.oauthAuth = new MCPOAuthAuth(undefined, undefined, { requiredScope });
    logger.info('Dual authentication initialized (API Key + OAuth)');
  }

  async authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Extract authentication credentials
      const apiKeyHeader = req.headers['x-api-key'];
      const authHeader = req.headers.authorization;

      // Case 1: X-API-Key header present
      if (apiKeyHeader && typeof apiKeyHeader === 'string') {
        logger.debug('Attempting API Key authentication (X-API-Key header)');
        return this.apiKeyAuth.authenticate(req, res, next);
      }

      // Case 2: Authorization Bearer token present
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);

        // Detect token type: JWT has exactly 3 dot-separated parts (header.payload.signature)
        const isJWT = token.split('.').length === 3;

        if (isJWT) {
          logger.debug('Attempting OAuth authentication (JWT token)');
          return this.oauthAuth.authenticate(req, res, next);
        } else {
          logger.debug('Attempting API Key authentication (Bearer token)');
          return this.apiKeyAuth.authenticate(req, res, next);
        }
      }

      // Case 3: No authentication credentials provided
      logger.warn('No authentication credentials provided');
      res.status(401).json({
        error: 'Authentication required',
        message: 'Provide authentication using one of these methods:',
        methods: {
          apiKey: {
            header: 'X-API-Key: <your-api-key>',
            description: 'For MCP protocol discovery (tools/list, resources/list, prompts/list)'
          },
          apiKeyBearer: {
            header: 'Authorization: Bearer <your-api-key>',
            description: 'Alternative API Key format'
          },
          oauth: {
            header: 'Authorization: Bearer <jwt-token>',
            description: 'For user-initiated tool execution (from Copilot Studio)',
            tokenUrl: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
            scope: `api://${process.env.AZURE_CLIENT_ID}/${process.env.MCP_OAUTH_REQUIRED_SCOPE || 'user_impersonation'}`
          }
        }
      });
    } catch (error) {
      logger.error('Dual authentication error:', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Authentication failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export function createDualAuthMiddleware(keyVaultName?: string) {
  const auth = new DualAuth(keyVaultName);
  return (req: Request, res: Response, next: NextFunction) => auth.authenticate(req, res, next);
}
