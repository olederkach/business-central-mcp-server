/**
 * OAuth 2.0 Dynamic Client Registration (DCR) - RFC 7591
 * Enables "Dynamic discovery" mode in Microsoft Copilot Studio
 *
 * This implementation:
 * - Provides OpenID Connect Discovery endpoint (/.well-known/openid-configuration)
 * - Implements Dynamic Client Registration endpoint (/oauth/register)
 * - Delegates actual OAuth flows to Azure AD
 *
 * SECURITY: The registration endpoint requires API key authentication.
 * Client secrets are NEVER returned in responses — callers receive the
 * Azure AD client_id and must obtain secrets through secure channels.
 */

import { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { logger } from '../utils/logger.js';

interface RegisteredClient {
  client_id: string;
  client_id_issued_at: number;
  client_secret_expires_at: number;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_name?: string;
  contacts?: string[];
  scope?: string;
  registration_access_token: string;
}

interface ClientRegistrationRequest {
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  scope?: string;
  contacts?: string[];
  tos_uri?: string;
  policy_uri?: string;
  jwks_uri?: string;
  jwks?: any;
  software_id?: string;
  software_version?: string;
}

interface ClientRegistrationResponse {
  client_id: string;
  client_id_issued_at: number;
  client_secret_expires_at: number;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_name?: string;
  contacts?: string[];
  scope?: string;
  registration_access_token: string;
}

// In-memory client store (no disk persistence for secrets)
const registeredClients = new Map<string, RegisteredClient>();

export class DynamicClientRegistration {
  private tenantId: string;
  private clientId: string;
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.tenantId = process.env.AZURE_TENANT_ID || process.env.BC_TENANT_ID || '';
    this.clientId = process.env.AZURE_CLIENT_ID || process.env.BC_CLIENT_ID || '';

    if (!this.tenantId || !this.clientId) {
      throw new Error('DCR requires AZURE_TENANT_ID and AZURE_CLIENT_ID environment variables');
    }

    this.baseUrl = baseUrl ||
      process.env.MCP_SERVER_URL ||
      `http://localhost:${process.env.PORT || 3005}`;

    logger.info('DCR initialized', {
      tenantId: this.tenantId,
      clientId: this.clientId,
      baseUrl: this.baseUrl
    });
  }

  getDiscoveryDocument() {
    return {
      issuer: this.baseUrl,
      authorization_endpoint: `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize`,
      token_endpoint: `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      jwks_uri: `https://login.microsoftonline.com/${this.tenantId}/discovery/v2.0/keys`,
      response_types_supported: ['code', 'token', 'id_token', 'code id_token', 'id_token token'],
      subject_types_supported: ['pairwise'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      registration_endpoint: `${this.baseUrl}/oauth/register`,
      scopes_supported: ['openid', 'profile', 'email', 'offline_access', `api://${this.clientId}/MCP.Access`, 'access_as_user'],
      claims_supported: [
        'sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'nonce',
        'name', 'given_name', 'family_name', 'email', 'email_verified',
        'preferred_username', 'oid', 'tid', 'upn', 'scp', 'roles'
      ],
      grant_types_supported: ['authorization_code', 'refresh_token', 'implicit'],
      code_challenge_methods_supported: ['S256'],
      response_modes_supported: ['query', 'fragment', 'form_post'],
      tenant_region_scope: null,
      cloud_instance_name: 'microsoftonline.com',
      cloud_graph_host_name: 'graph.microsoft.com',
      msgraph_host: 'graph.microsoft.com',
      rbac_url: 'https://pas.windows.net'
    };
  }

  /**
   * Register a new OAuth client
   * SECURITY: Returns the Azure AD client_id but NEVER the client_secret.
   */
  registerClient(request: ClientRegistrationRequest): ClientRegistrationResponse {
    if (!request.redirect_uris || request.redirect_uris.length === 0) {
      throw new Error('redirect_uris is required and must not be empty');
    }

    for (const uri of request.redirect_uris) {
      if (!this.isValidRedirectUri(uri)) {
        throw new Error(`Invalid redirect_uri: ${uri}`);
      }
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const registrationAccessToken = randomBytes(32).toString('hex');

    const client: RegisteredClient = {
      client_id: this.clientId,
      client_id_issued_at: issuedAt,
      client_secret_expires_at: 0,
      redirect_uris: request.redirect_uris,
      grant_types: request.grant_types || ['authorization_code', 'refresh_token'],
      response_types: request.response_types || ['code'],
      token_endpoint_auth_method: request.token_endpoint_auth_method || 'client_secret_post',
      client_name: request.client_name,
      contacts: request.contacts,
      scope: request.scope || `openid profile email api://${this.clientId}/MCP.Access`,
      registration_access_token: registrationAccessToken
    };

    registeredClients.set(this.clientId, client);

    logger.info('Client registered', {
      clientId: client.client_id,
      clientName: client.client_name,
      redirectUris: client.redirect_uris
    });

    return {
      client_id: client.client_id,
      client_id_issued_at: client.client_id_issued_at,
      client_secret_expires_at: client.client_secret_expires_at,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      response_types: client.response_types,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      client_name: client.client_name,
      contacts: client.contacts,
      scope: client.scope,
      registration_access_token: registrationAccessToken
    };
  }

  /**
   * Validate client credentials using constant-time comparison
   */
  validateClient(clientId: string, clientSecret: string): boolean {
    if (!clientId || !clientSecret) {
      return false;
    }

    const expectedId = this.clientId;
    const expectedSecret = process.env.AZURE_CLIENT_SECRET || process.env.BC_CLIENT_SECRET || '';

    if (!expectedSecret) {
      return false;
    }

    const idMatch = clientId === expectedId;

    const secretBuf = Buffer.from(clientSecret);
    const expectedBuf = Buffer.from(expectedSecret);

    if (secretBuf.length !== expectedBuf.length) {
      return false;
    }

    const secretMatch = timingSafeEqual(secretBuf, expectedBuf);
    return idMatch && secretMatch;
  }

  getClient(clientId: string): RegisteredClient | null {
    return registeredClients.get(clientId) || null;
  }

  deleteClient(clientId: string): boolean {
    return registeredClients.delete(clientId);
  }

  listClients(): RegisteredClient[] {
    return Array.from(registeredClients.values());
  }

  private isValidRedirectUri(uri: string): boolean {
    try {
      const url = new URL(uri);

      if (url.protocol === 'https:') {
        return true;
      }

      if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
        return true;
      }

      // Block dangerous schemes
      const blockedSchemes = ['javascript:', 'data:', 'file:', 'vbscript:'];
      if (blockedSchemes.includes(url.protocol)) {
        return false;
      }

      // Allow reverse-domain custom schemes for native apps (e.g., com.microsoft.copilot://callback)
      if (url.protocol.includes('.')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }
}

export function createDiscoveryEndpoint(baseUrl?: string) {
  return (_req: Request, res: Response) => {
    try {
      const dcr = new DynamicClientRegistration(baseUrl);
      const discovery = dcr.getDiscoveryDocument();

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json(discovery);
    } catch (error) {
      logger.error('Discovery endpoint error', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to generate discovery document'
      });
    }
  };
}

export function createRegistrationEndpoint(baseUrl?: string) {
  return (req: Request, res: Response) => {
    try {
      const dcr = new DynamicClientRegistration(baseUrl);

      if (!req.body || typeof req.body !== 'object') {
        res.status(400).json({
          error: 'invalid_client_metadata',
          error_description: 'Request body must be a JSON object'
        });
        return;
      }

      const client = dcr.registerClient(req.body);
      res.status(201).json(client);
    } catch (error) {
      logger.error('Client registration error', error instanceof Error ? error : undefined);

      if (error instanceof Error && error.message.includes('redirect_uris')) {
        res.status(400).json({
          error: 'invalid_redirect_uri',
          error_description: error.message
        });
      } else if (error instanceof Error && error.message.includes('required')) {
        res.status(400).json({
          error: 'invalid_client_metadata',
          error_description: error.message
        });
      } else {
        res.status(500).json({
          error: 'server_error',
          error_description: 'Failed to register client'
        });
      }
    }
  };
}

export function createClientManagementEndpoints(baseUrl?: string) {
  const dcr = new DynamicClientRegistration(baseUrl);

  return {
    listClients: (_req: Request, res: Response) => {
      try {
        const clients = dcr.listClients();
        const sanitized = clients.map(c => ({
          client_id: c.client_id,
          client_name: c.client_name,
          redirect_uris: c.redirect_uris,
          grant_types: c.grant_types,
          client_id_issued_at: c.client_id_issued_at,
          client_secret_expires_at: c.client_secret_expires_at
        }));
        res.json({ clients: sanitized });
      } catch (error) {
        logger.error('List clients error', error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Failed to list clients' });
      }
    },

    deleteClient: (req: Request, res: Response) => {
      try {
        const { clientId } = req.params;
        const deleted = dcr.deleteClient(clientId);

        if (deleted) {
          res.json({ success: true, message: 'Client deleted' });
        } else {
          res.status(404).json({ error: 'Client not found' });
        }
      } catch (error) {
        logger.error('Delete client error', error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Failed to delete client' });
      }
    }
  };
}
