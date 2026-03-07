/**
 * OAuth 2.0 Authentication for MCP Server
 * Validates tokens from Copilot Studio using Azure AD / Microsoft Entra ID
 *
 * SECURITY: This implementation properly verifies JWT signatures using Microsoft's public keys
 * This is separate from BC API OAuth (which uses client credentials)
 * This validates user tokens from Copilot Studio
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { logger } from '../utils/logger.js';

interface TokenPayload {
  aud?: string; // Audience
  iss?: string; // Issuer
  exp?: number; // Expiration
  nbf?: number; // Not before
  sub?: string; // Subject (user ID)
  oid?: string; // Object ID
  email?: string;
  upn?: string; // User Principal Name
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  scp?: string; // Scopes (space-separated)
  roles?: string[]; // Roles array
}

interface UserInfo {
  userId: string;
  email?: string;
  name?: string;
  scopes?: string[];
  roles?: string[];
}

/**
 * Custom error for token validation failures
 */
class TokenValidationError extends Error {
  constructor(
    message: string,
    public code: 'expired' | 'invalid' | 'missing_scope' | 'verification_failed',
    public details?: any
  ) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

export class MCPOAuthAuth {
  private tenantId: string;
  private clientId: string;
  private requiredScope: string;
  private validateAudience: boolean;
  private validateIssuer: boolean;
  private jwksClient: JwksClient;

  /**
   * Initialize OAuth authentication for MCP endpoint
   * @param tenantId - Azure AD tenant ID
   * @param clientId - App registration client ID (same as BC app)
   * @param options - Optional configuration
   */
  constructor(
    tenantId?: string,
    clientId?: string,
    options?: {
      requiredScope?: string;
      validateAudience?: boolean;
      validateIssuer?: boolean;
    }
  ) {
    // Get configuration from constructor or environment
    this.tenantId =
      tenantId ||
      process.env.AZURE_TENANT_ID ||
      process.env.BC_TENANT_ID ||
      '';

    this.clientId =
      clientId ||
      process.env.AZURE_CLIENT_ID ||
      process.env.BC_CLIENT_ID ||
      '';

    // Validate required config
    if (!this.tenantId || !this.clientId) {
      throw new Error(
        'OAuth MCP auth requires AZURE_TENANT_ID and AZURE_CLIENT_ID environment variables'
      );
    }

    // Configuration options
    this.requiredScope = options?.requiredScope ?? 'MCP.Access';
    this.validateAudience = options?.validateAudience ?? true;
    this.validateIssuer = options?.validateIssuer ?? true;

    // Initialize JWKS client for JWT signature verification
    this.jwksClient = new JwksClient({
      jwksUri: `https://login.microsoftonline.com/${this.tenantId}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxAge: 600000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10
    });

    logger.info('MCP OAuth initialized with signature verification', {
      tenantId: this.tenantId,
      clientId: this.clientId,
      requiredScope: this.requiredScope,
      expectedAudience: `api://${this.clientId}`,
      jwksUri: `https://login.microsoftonline.com/${this.tenantId}/discovery/v2.0/keys`
    });
  }

  /**
   * Express middleware for OAuth authentication
   */
  async authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'Missing or invalid Authorization header',
          expected: 'Bearer <token>',
          authType: 'oauth2',
          authUrl: `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize`
        });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer '

      // Validate token
      const userInfo = await this.validateToken(token);

      // Attach user info to request for logging/auditing
      req.user = userInfo;
      req.accessToken = token;

      logger.info('User authenticated', {
        userId: userInfo.userId,
        email: userInfo.email,
        name: userInfo.name,
        scopes: userInfo.scopes
      });

      next();
    } catch (error) {
      // Handle token validation errors with proper OAuth 2.0 error responses
      if (error instanceof TokenValidationError) {
        if (error.code === 'expired') {
          // RFC 6750: Return 401 with WWW-Authenticate header for expired tokens
          // This signals the client (Copilot Studio) to refresh the token
          res.setHeader(
            'WWW-Authenticate',
            `Bearer realm="MCP Server", error="invalid_token", error_description="The access token expired"`
          );
          res.status(401).json({
            error: 'invalid_token',
            error_description: 'The access token expired',
            message: 'Token has expired. Please refresh your token.',
            expired_at: error.details?.expiredAt
          });
          return;
        } else if (error.code === 'missing_scope') {
          // 403 for insufficient scope (authorized but not permitted)
          res.status(403).json({
            error: 'insufficient_scope',
            error_description: error.message,
            required_scope: this.requiredScope
          });
          return;
        } else {
          // 401 for other validation failures
          res.setHeader(
            'WWW-Authenticate',
            `Bearer realm="MCP Server", error="invalid_token", error_description="${error.message}"`
          );
          res.status(401).json({
            error: 'invalid_token',
            error_description: error.message,
            message: 'Token validation failed'
          });
          return;
        }
      }

      // Generic error handler
      logger.error('OAuth authentication error', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Authentication failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Validate OAuth token with CRYPTOGRAPHIC SIGNATURE VERIFICATION
   * @param token - JWT token from Authorization header
   * @returns User info if valid
   * @throws TokenValidationError if validation fails
   *
   * SECURITY: This method verifies the JWT signature using Microsoft's public keys
   * from the JWKS endpoint. This prevents token forgery attacks.
   */
  async validateToken(token: string): Promise<UserInfo> {
    // Basic format check
    if (!token || typeof token !== 'string') {
      logger.error('Invalid token format: empty or not a string');
      throw new TokenValidationError(
        'Invalid token format',
        'invalid',
        { reason: 'Token is empty or not a string' }
      );
    }

    // JWT tokens have 3 parts separated by dots
    const parts = token.split('.');
    if (parts.length !== 3) {
      logger.error('Invalid token format: not a valid JWT');
      throw new TokenValidationError(
        'Invalid token format: not a valid JWT',
        'invalid',
        { reason: 'Token does not have 3 parts' }
      );
    }

    // Step 1: Decode header to get key ID (kid) WITHOUT verification
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header || !decoded.header.kid) {
      logger.error('Failed to decode token header or missing kid');
      throw new TokenValidationError(
        'Failed to decode token header',
        'invalid',
        { reason: 'Missing key ID (kid) in token header' }
      );
    }

    const kid = decoded.header.kid;
    logger.debug('Token kid: ' + kid);

    // Step 2: Get the signing key from JWKS endpoint
    let signingKey: string;
    try {
      const key = await this.jwksClient.getSigningKey(kid);
      signingKey = key.getPublicKey();
    } catch (error) {
      logger.error('Failed to get signing key from JWKS', error instanceof Error ? error : undefined);
      throw new TokenValidationError(
        'Failed to retrieve signing key',
        'verification_failed',
        { kid, error: error instanceof Error ? error.message : String(error) }
      );
    }

    // Step 3: VERIFY JWT SIGNATURE and validate claims
    // Accept both formats: v1.0 tokens use "api://{clientId}", v2.0 tokens use bare "{clientId}"
    const expectedAudiences = [`api://${this.clientId}`, this.clientId];
    const expectedIssuers = [
      `https://login.microsoftonline.com/${this.tenantId}/v2.0`,
      `https://sts.windows.net/${this.tenantId}/`
    ];

    let payload: TokenPayload;
    try {
      const verifyOptions: jwt.VerifyOptions = {
        audience: this.validateAudience ? expectedAudiences as [string, ...string[]] : undefined,
        algorithms: ['RS256'], // Azure AD uses RS256
        clockTolerance: 60 // Allow 60 seconds clock skew
      };

      // jwt.verify expects issuer to be string | [string, ...string[]] (non-empty tuple)
      if (this.validateIssuer && expectedIssuers.length > 0) {
        verifyOptions.issuer = expectedIssuers as [string, ...string[]];
      }

      payload = jwt.verify(token, signingKey, verifyOptions) as TokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.error('Token expired', error, {
          expiration: error.expiredAt?.toISOString()
        });
        throw new TokenValidationError(
          'Token has expired',
          'expired',
          { expiredAt: error.expiredAt?.toISOString() }
        );
      } else if (error instanceof jwt.JsonWebTokenError) {
        // Log actual token claims for debugging audience/issuer mismatches
        const decodedPayload = decoded?.payload as Record<string, unknown> | undefined;
        logger.error('JWT verification failed: ' + error.message, undefined, {
          expectedAudiences,
          actualAudience: decodedPayload?.aud,
          actualIssuer: decodedPayload?.iss,
          tokenVersion: decodedPayload?.ver
        });
        throw new TokenValidationError(
          `JWT verification failed: ${error.message}`,
          'verification_failed',
          { reason: error.message }
        );
      } else if (error instanceof jwt.NotBeforeError) {
        logger.error('Token not yet valid (nbf in future)');
        throw new TokenValidationError(
          'Token is not yet valid',
          'invalid',
          { reason: 'Token nbf (not before) time is in the future' }
        );
      } else {
        logger.error('Token verification error', error instanceof Error ? error : undefined);
        throw new TokenValidationError(
          'Token verification failed',
          'verification_failed',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    // Step 4: Validate scope or role (must have required permission)
    // Delegated tokens use 'scp' claim, client_credentials tokens use 'roles' claim
    const scopes = payload.scp?.split(' ') || [];
    const roles = payload.roles || [];
    const hasScope = scopes.includes(this.requiredScope);
    const hasRole = roles.includes(this.requiredScope);
    if (this.requiredScope && !hasScope && !hasRole) {
      logger.error('Missing required scope/role', undefined, {
        required: this.requiredScope,
        scopes: scopes.join(' '),
        roles: roles.join(' ')
      });
      throw new TokenValidationError(
        `Missing required scope: ${this.requiredScope}`,
        'missing_scope',
        { required: this.requiredScope, scopes, roles }
      );
    }

    // Step 5: Extract user information
    const userInfo: UserInfo = {
      userId: payload.oid || payload.sub || 'unknown',
      email: payload.email || payload.upn || payload.preferred_username,
      name: payload.name || this.buildName(payload.given_name, payload.family_name),
      scopes,
      roles: payload.roles || []
    };

    logger.info('Token validated successfully with signature verification', {
      userId: userInfo.userId,
      email: userInfo.email,
      scopes: userInfo.scopes
    });

    return userInfo;
  }


  /**
   * Build full name from first and last names
   */
  private buildName(givenName?: string, familyName?: string): string | undefined {
    if (!givenName && !familyName) {
      return undefined;
    }
    return `${givenName || ''} ${familyName || ''}`.trim();
  }

  /**
   * Extract user info from request (after authentication)
   */
  static getUserInfo(req: Request): UserInfo | undefined {
    return req.user;
  }
}

/**
 * Create Express middleware for OAuth authentication
 */
export function createMCPOAuthMiddleware() {
  try {
    // Read required scope from environment variable
    // Set to empty string to disable scope validation (useful for client_credentials flow)
    const requiredScope = process.env.MCP_OAUTH_REQUIRED_SCOPE ?? 'MCP.Access';

    const auth = new MCPOAuthAuth(
      undefined, // tenantId - will read from env
      undefined, // clientId - will read from env
      { requiredScope } // Pass the scope from environment
    );

    return (req: Request, res: Response, next: NextFunction) =>
      auth.authenticate(req, res, next);
  } catch (error) {
    logger.error('Failed to create MCP OAuth middleware', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Helper to get user from authenticated request
 */
export function getAuthenticatedUser(req: Request): UserInfo | undefined {
  return MCPOAuthAuth.getUserInfo(req);
}
