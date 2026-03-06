/**
 * API Key Authentication
 * Supports both header-based (X-API-Key) and Bearer token authentication
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';
import { logger } from '../utils/logger.js';

interface ApiKeyCache {
  hash: string;
  validUntil: Date;
}

export class ApiKeyAuth {
  private cache: Map<string, ApiKeyCache>;
  private secretClient?: SecretClient;
  private envKeys: string[];

  constructor(keyVaultName?: string) {
    this.cache = new Map();
    this.envKeys = (process.env.MCP_API_KEYS || '').split(',').filter(Boolean);
    
    if (keyVaultName) {
      try {
        const credential = new DefaultAzureCredential();
        this.secretClient = new SecretClient(
          `https://${keyVaultName}.vault.azure.net`,
          credential
        );
      } catch (error) {
        logger.warn('Failed to initialize Key Vault client');
      }
    }
  }

  async authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiKey = this.extractApiKey(req);
      
      if (!apiKey) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'Provide API key in X-API-Key header or Authorization: Bearer <key>'
        });
        return;
      }

      const isValid = await this.validateKey(apiKey);
      
      if (!isValid) {
        res.status(403).json({
          error: 'Invalid API key'
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('API key authentication error', error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Authentication failed' });
    }
  }

  private extractApiKey(req: Request): string | null {
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && typeof apiKeyHeader === 'string') {
      return apiKeyHeader;
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  private async validateKey(apiKey: string): Promise<boolean> {
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    const cached = this.cache.get(hash);
    if (cached && cached.validUntil > new Date()) {
      return true;
    }

    const isValid = await this.checkKeyValidity(apiKey, hash);
    
    if (isValid) {
      this.cache.set(hash, {
        hash,
        validUntil: new Date(Date.now() + 5 * 60 * 1000)
      });
    }
    
    return isValid;
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   * SECURITY: Uses crypto.timingSafeEqual to prevent key enumeration
   */
  private constantTimeCompare(a: string, b: string): boolean {
    try {
      // Ensure both strings are same length to use timingSafeEqual
      const bufA = Buffer.from(a, 'utf8');
      const bufB = Buffer.from(b, 'utf8');

      // If lengths differ, still compare to prevent length leakage
      if (bufA.length !== bufB.length) {
        // Pad shorter buffer with zeros
        const maxLen = Math.max(bufA.length, bufB.length);
        const paddedA = Buffer.alloc(maxLen);
        const paddedB = Buffer.alloc(maxLen);
        bufA.copy(paddedA);
        bufB.copy(paddedB);
        return crypto.timingSafeEqual(paddedA, paddedB);
      }

      return crypto.timingSafeEqual(bufA, bufB);
    } catch (error) {
      return false;
    }
  }

  private async checkKeyValidity(apiKey: string, hash: string): Promise<boolean> {
    // Check environment variable keys first using constant-time comparison
    for (const key of this.envKeys) {
      if (this.constantTimeCompare(key, apiKey)) {
        return true;
      }
    }

    // Check Key Vault keys
    if (this.secretClient) {
      try {
        const secret = await this.secretClient.getSecret('mcp-api-keys');
        if (!secret.value) {
          return false;
        }
        
        // Support both comma-separated plain keys and JSON array
        let validKeys: string[];
        try {
          validKeys = JSON.parse(secret.value);
        } catch {
          // Not JSON, treat as comma-separated string
          validKeys = secret.value.split(',').map(k => k.trim()).filter(Boolean);
        }

        // Check plain key match using constant-time comparison
        for (const validKey of validKeys) {
          if (this.constantTimeCompare(validKey, apiKey)) {
            return true;
          }
        }

        // Check hash match (for legacy format) using constant-time comparison
        for (const validKey of validKeys) {
          if (this.constantTimeCompare(validKey, hash)) {
            return true;
          }
        }
      } catch (error) {
        logger.warn('Key Vault lookup failed');
      }
    }

    return false;
  }
}

export function createApiKeyMiddleware(keyVaultName?: string) {
  const auth = new ApiKeyAuth(keyVaultName);
  return (req: Request, res: Response, next: NextFunction) => auth.authenticate(req, res, next);
}
