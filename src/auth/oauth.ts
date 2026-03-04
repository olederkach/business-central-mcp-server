/**
 * OAuth 2.0 Authentication for Business Central
 * Uses Azure AD / Microsoft Entra ID
 */

import { Request, Response, NextFunction } from 'express';
import { ConfidentialClientApplication, AuthorizationUrlRequest, AuthorizationCodeRequest } from '@azure/msal-node';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

interface TokenCache {
  token: string;
  expiresAt: Date;
  tenantId: string;
}

export class OAuthAuth {
  private msalClient: ConfidentialClientApplication;
  private tokenCache: Map<string, TokenCache>;
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
    
    const authUrlRequest: AuthorizationUrlRequest = {
      scopes: ['https://api.businesscentral.dynamics.com/.default'],
      redirectUri
    };

    try {
      const authUrl = await this.msalClient.getAuthCodeUrl(authUrlRequest);
      res.redirect(authUrl);
    } catch (error) {
      console.error('OAuth initiate error:', error);
      res.status(500).json({ error: 'Failed to initiate OAuth flow' });
    }
  }

  async handleCallback(req: Request, res: Response): Promise<void> {
    const { code } = req.query;
    
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
      console.error('OAuth callback error:', error);
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
      console.error('Token acquisition error:', error);
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

      // Verify signature, issuer, and expiration
      jwt.verify(token, signingKey, {
        issuer: [
          `https://login.microsoftonline.com/${this.tenantId}/v2.0`,
          `https://sts.windows.net/${this.tenantId}/`
        ],
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
    console.error('Failed to create OAuth middleware:', error);
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
    console.error('Failed to create OAuth routes:', error);
    throw error;
  }
}
