/**
 * OAuth 2.0 Authentication for Business Central
 * Uses Azure AD / Microsoft Entra ID
 */

import { Request, Response, NextFunction } from 'express';
import { ConfidentialClientApplication, AuthorizationUrlRequest, AuthorizationCodeRequest } from '@azure/msal-node';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

interface TokenCache {
  token: string;
  expiresAt: Date;
  tenantId: string;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class OAuthAuth {
  private msalClient: ConfidentialClientApplication;
  private tokenCache: Map<string, TokenCache>;
  private pendingStates: Map<string, number>;
  private tenantId: string;

  /**
   * Initialize OAuth authentication for Business Central
   * @param tenantId - Azure AD tenant ID (optional, uses env var if not provided)
   * @param clientId - App registration client ID (optional, uses env var if not provided)
   * @param clientSecret - App registration secret (optional, uses env var if not provided)
   */
  constructor(
    tenantId?: string,
    clientId?: string,
    clientSecret?: string
  ) {
    this.tokenCache = new Map();
    this.pendingStates = new Map();

    // Priority: constructor params > environment variables
    this.tenantId =
      tenantId ||
      process.env.AZURE_TENANT_ID ||
      process.env.BC_TENANT_ID ||
      '';

    const finalClientId =
      clientId ||
      process.env.AZURE_CLIENT_ID ||
      process.env.BC_CLIENT_ID ||
      '';

    const finalClientSecret =
      clientSecret ||
      process.env.AZURE_CLIENT_SECRET ||
      process.env.BC_CLIENT_SECRET ||
      '';

    // Validate required credentials
    if (!this.tenantId || !finalClientId || !finalClientSecret) {
      throw new Error(
        'OAuth requires tenant ID, client ID, and client secret. ' +
        'Provide via constructor params or environment variables: ' +
        'BC_TENANT_ID, BC_CLIENT_ID, BC_CLIENT_SECRET'
      );
    }

    // Initialize MSAL client
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: finalClientId,
        authority: `https://login.microsoftonline.com/${this.tenantId}`,
        clientSecret: finalClientSecret
      }
    });
  }

  async authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      res.status(401).json({
        error: 'Authentication required',
        authUrl: `${req.protocol}://${req.get('host')}/oauth/authorize`,
        authType: 'oauth2'
      });
      return;
    }

    const isValid = await this.validateToken(token);
    if (!isValid) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }

    (req as any).accessToken = token;
    next();
  }

  async initiateFlow(req: Request, res: Response): Promise<void> {
    const redirectUri = `${req.protocol}://${req.get('host')}/oauth/callback`;
    const state = randomUUID();
    this.pendingStates.set(state, Date.now());
    // Evict expired states
    for (const [key, ts] of this.pendingStates) {
      if (Date.now() - ts > STATE_TTL_MS) this.pendingStates.delete(key);
    }

    const authUrlRequest: AuthorizationUrlRequest = {
      scopes: ['https://api.businesscentral.dynamics.com/.default'],
      redirectUri,
      state
    };

    try {
      const authUrl = await this.msalClient.getAuthCodeUrl(authUrlRequest);
      res.redirect(authUrl);
    } catch (error) {
      logger.error('OAuth initiate error', error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Failed to initiate OAuth flow' });
    }
  }

  async handleCallback(req: Request, res: Response): Promise<void> {
    const { code, state } = req.query;

    // Validate CSRF state parameter
    if (!state || typeof state !== 'string' || !this.pendingStates.has(state)) {
      res.status(400).json({ error: 'Invalid or missing state parameter' });
      return;
    }
    const stateTs = this.pendingStates.get(state)!;
    this.pendingStates.delete(state);
    if (Date.now() - stateTs > STATE_TTL_MS) {
      res.status(400).json({ error: 'State parameter expired' });
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/oauth/callback`;
    
    const tokenRequest: AuthorizationCodeRequest = {
      code,
      scopes: ['https://api.businesscentral.dynamics.com/.default'],
      redirectUri
    };

    try {
      const result = await this.msalClient.acquireTokenByCode(tokenRequest);

      if (!result) {
        throw new Error('No token result');
      }

      res.json({
        accessToken: result.accessToken,
        expiresOn: result.expiresOn,
        tokenType: 'Bearer',
        scope: result.scopes?.join(' ')
      });
    } catch (error) {
      logger.error('OAuth callback error', error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Token exchange failed' });
    }
  }

  async getAccessToken(tenantId: string): Promise<string> {
    const cached = this.tokenCache.get(tenantId);
    if (cached && cached.expiresAt > new Date()) {
      return cached.token;
    }

    try {
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: ['https://api.businesscentral.dynamics.com/.default']
      });

      if (!result) {
        throw new Error('Failed to acquire token');
      }

      this.tokenCache.set(tenantId, {
        token: result.accessToken,
        expiresAt: result.expiresOn || new Date(Date.now() + 3600000),
        tenantId
      });

      return result.accessToken;
    } catch (error) {
      logger.error('Token acquisition error', error instanceof Error ? error : undefined);
      throw new Error('Failed to get access token');
    }
  }

  private async validateToken(token: string): Promise<boolean> {
    try {
      // Decode without verification to get the header for key lookup
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || !decoded.header.kid) {
        return false;
      }

      // Get signing key from Azure AD JWKS endpoint
      const client = jwksClient({
        jwksUri: `https://login.microsoftonline.com/${this.tenantId}/discovery/v2.0/keys`,
        cache: true,
        cacheMaxAge: 600000 // 10 minutes
      });

      const key = await client.getSigningKey(decoded.header.kid);
      const signingKey = key.getPublicKey();

      // Verify signature, issuer, audience, and expiration
      const audience = process.env.AZURE_CLIENT_ID || process.env.BC_CLIENT_ID;
      jwt.verify(token, signingKey, {
        issuer: [
          `https://login.microsoftonline.com/${this.tenantId}/v2.0`,
          `https://sts.windows.net/${this.tenantId}/`
        ],
        ...(audience ? { audience } : {}),
        clockTolerance: 30 // 30 seconds tolerance
      });

      return true;
    } catch {
      return false;
    }
  }
}

export function createOAuthMiddleware() {
  try {
    const auth = new OAuthAuth();
    return (req: Request, res: Response, next: NextFunction) => auth.authenticate(req, res, next);
  } catch (error) {
    logger.error('Failed to create OAuth middleware', error instanceof Error ? error : undefined);
    throw error;
  }
}

export function createOAuthRoutes() {
  try {
    const auth = new OAuthAuth();
    return {
      authorize: (req: Request, res: Response) => auth.initiateFlow(req, res),
      callback: (req: Request, res: Response) => auth.handleCallback(req, res)
    };
  } catch (error) {
    logger.error('Failed to create OAuth routes', error instanceof Error ? error : undefined);
    throw error;
  }
}
