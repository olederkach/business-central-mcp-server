/**
 * Business Central MCP Server - HTTP Transport
 * Express application for Copilot Studio and web clients
 */

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { McpProtocolHandler } from './mcp/protocol.js';
import { createApiKeyMiddleware } from './auth/api-key.js';
import { createOAuthRoutes } from './auth/oauth.js';
import { createDualAuthMiddleware } from './auth/dual.js';
import { createDiscoveryEndpoint, createRegistrationEndpoint, createClientManagementEndpoints } from './auth/dcr.js';
import { loadConfig } from './config.js';
import { logger } from './utils/logger.js';
import { createCopilotSseEndpoint } from './transports/copilot-sse.js';
import { createDynamicOpenApiRoutes, createPublicOpenApiSpecHandler } from './openapi/routes-dynamic.js';
import { initializeAppInsights, appInsightsMiddleware } from './monitoring/app-insights.js';
import { mcpRateLimiter, healthCheckLimiter, authLimiter } from './middleware/rate-limit.js';
import { getEnvironmentSummary } from './config/validator.js';
import { VERSION } from './version.js';
import { parseBCConfigWithFallback, parseBCConfigStrict } from './middleware/bc-config.js';
import { requestIdMiddleware } from './middleware/request-id.js';

const config = loadConfig();
const app = express();

// Trust proxy for Azure Container Apps (behind reverse proxy)
app.set('trust proxy', 1);

// Initialize Application Insights
const telemetry = initializeAppInsights();
if (telemetry) {
  logger.info('Application Insights enabled');
}

// SECURITY: Configure helmet with strict security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for error pages
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny' // Prevent clickjacking
  },
  noSniff: true, // Prevent MIME type sniffing
  xssFilter: true, // Enable XSS filter
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  }
}));

// SECURITY: Restrict CORS to trusted origins only
const rawOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || [];
if (rawOrigins.includes('*')) {
  logger.warn('CORS_ORIGINS=* is not allowed with credentials; treating as no origins (deny all cross-origin)');
}
const allowedOrigins = rawOrigins.filter(o => o !== '*');
const corsEnabled = allowedOrigins.length > 0;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    // If no CORS origins configured, deny all cross-origin requests
    if (!corsEnabled) {
      return callback(new Error('CORS not configured - cross-origin requests not allowed'));
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} not allowed by CORS policy`));
  },
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 86400 // 24 hours
}));

// SECURITY: Request ID tracking for correlation and debugging
app.use(requestIdMiddleware);

// SECURITY: Body size limit to prevent DoS attacks while allowing BC data processing
app.use(express.json({
  limit: '500kb',  // Reduced from 10mb - sufficient for Business Central data processing
  strict: true,
  verify: (_req, _res, buf) => {
    // Additional validation to prevent large payloads
    if (buf.length > 500 * 1024) {
      throw new Error('Request payload too large');
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '500kb' }));

// SECURITY: Add request timeout to prevent slowloris attacks
app.use((_req: Request, _res: Response, next: NextFunction) => {
  _req.setTimeout(30000); // 30 seconds
  _res.setTimeout(30000);
  next();
});

// Add Application Insights middleware
if (telemetry) {
  app.use(appInsightsMiddleware);
}

const mcpHandler = new McpProtocolHandler(config.metadataMode);

let authMiddleware: (req: express.Request, res: express.Response, next: express.NextFunction) => void;

if (config.authMode === 'oauth') {
  try {
    // Use Dual Auth middleware for Copilot Studio integration
    // Accepts BOTH API Key (for MCP discovery) AND OAuth tokens (for tool execution)
    authMiddleware = createDualAuthMiddleware(config.keyVaultName);
    logger.info('Dual authentication enabled (API Key + OAuth) for Copilot Studio integration');
    logger.info('- API Key: For MCP protocol discovery (initialize, tools/list, resources/list, prompts/list)');
    logger.info('- OAuth: For user-initiated tool execution (with user context for audit logging)');
  } catch (error) {
    logger.error('Failed to initialize dual auth, falling back to API key', error instanceof Error ? error : undefined);
    authMiddleware = createApiKeyMiddleware(config.keyVaultName);
  }
} else {
  authMiddleware = createApiKeyMiddleware(config.keyVaultName);
  logger.info('API key authentication enabled');
}

// URL-based multi-tenant endpoints (with rate limiting)
// These require explicit URL-based configuration (no fallback to env vars)
app.post(
  '/:tenantId/:environment/api/:version/companies\\(:companyId\\)',
  mcpRateLimiter,
  parseBCConfigStrict,
  authMiddleware,
  (req, res) => mcpHandler.handle(req, res)
);

app.post(
  '/:tenantId/:environment/api/:publisher/:group/:version/companies\\(:companyId\\)',
  mcpRateLimiter,
  parseBCConfigStrict,
  authMiddleware,
  (req, res) => mcpHandler.handle(req, res)
);

// IMPORTANT: /mcp sub-path discovery routes MUST be registered before app.use('/mcp')
// because Express matches app.use('/mcp') for ANY path starting with /mcp
app.get('/mcp/.well-known/openid-configuration', healthCheckLimiter, createDiscoveryEndpoint());

// MCP Endpoint - Universal endpoint for ALL MCP clients
// Supports both POST (JSON-RPC) and GET (SSE streaming) per MCP Streamable HTTP spec
//
// /mcp - X-API-Key or Bearer token authentication (production ready)
//    Authentication: X-API-Key header OR Authorization: Bearer <token>
//    Configuration: Supports BOTH URL-based config AND environment variables
//    URL format: /{tenantId}/{env}/api/{version}/companies({companyId})
//    Env vars: BC_TENANT_ID, BC_ENVIRONMENT_NAME, BC_COMPANY_ID
//    Best for: All MCP clients (Azure AI Foundry, Copilot Studio, Claude Desktop, custom clients)
//    SECURITY: authLimiter prevents brute force attacks on authentication
app.use('/mcp', authLimiter, mcpRateLimiter, parseBCConfigWithFallback, authMiddleware, createCopilotSseEndpoint());

// Public OpenAPI spec endpoint (no auth required for Power Platform import)
app.get('/openapi.json', mcpRateLimiter, createPublicOpenApiSpecHandler());

// OpenAPI/REST endpoints for Power Platform Custom Connector - with rate limiting
// Dynamically generated from Business Central metadata
app.use('/api', mcpRateLimiter, authMiddleware, createDynamicOpenApiRoutes());

// OAuth 2.0 Dynamic Client Registration (DCR) endpoints
// Enables "Dynamic discovery" mode in Microsoft Copilot Studio
// Discovery endpoints (public, no auth required)
// MCS probes multiple paths per RFC 8414, RFC 9728, and OpenID Connect Discovery
const discoveryHandler = createDiscoveryEndpoint();
app.get('/.well-known/openid-configuration', healthCheckLimiter, discoveryHandler);
app.get('/.well-known/oauth-authorization-server', healthCheckLimiter, discoveryHandler);
app.get('/.well-known/oauth-authorization-server/mcp', healthCheckLimiter, discoveryHandler);
app.get('/.well-known/openid-configuration/mcp', healthCheckLimiter, discoveryHandler);

// RFC 9728 Protected Resource Metadata — tells MCS where to get tokens for this resource
app.get('/.well-known/oauth-protected-resource', healthCheckLimiter, (_req, res) => {
  const azureClientId = process.env.AZURE_CLIENT_ID || process.env.BC_CLIENT_ID || '';
  const baseUrl = process.env.MCP_SERVER_URL || `http://localhost:${process.env.PORT || 3005}`;
  res.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: [`api://${azureClientId}/.default`, 'openid'],
    bearer_methods_supported: ['header']
  });
});
app.get('/.well-known/oauth-protected-resource/mcp', healthCheckLimiter, (_req, res) => {
  const azureClientId = process.env.AZURE_CLIENT_ID || process.env.BC_CLIENT_ID || '';
  const baseUrl = process.env.MCP_SERVER_URL || `http://localhost:${process.env.PORT || 3005}`;
  res.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: [`api://${azureClientId}/.default`, 'openid'],
    bearer_methods_supported: ['header']
  });
});

// Dynamic Client Registration endpoint (requires auth + rate limited)
// DCR endpoint is public (rate-limited only) — MCS calls this before it has a token.
// SECURITY: This is safe because registerClient() returns the existing Azure AD client_id,
// not a new secret. The actual client_secret is never exposed through this endpoint.
app.post('/oauth/register', authLimiter, createRegistrationEndpoint());

// Client management endpoints (admin only)
const clientManagement = createClientManagementEndpoints();
app.get('/oauth/clients', authMiddleware, clientManagement.listClients);
app.delete('/oauth/clients/:clientId', authMiddleware, clientManagement.deleteClient);

if (config.authMode === 'oauth') {
  const oauthRoutes = createOAuthRoutes();
  app.get('/oauth/authorize', oauthRoutes.authorize);
  app.get('/oauth/callback', oauthRoutes.callback);
}

// MCP OAuth endpoints — Claude.ai and other MCP clients send OAuth requests here
// These redirect/proxy to Azure AD per the MCP authorization spec
if (config.authMode === 'oauth') {
  const azureTenantId = process.env.AZURE_TENANT_ID || process.env.BC_TENANT_ID;
  const azureClientId = process.env.AZURE_CLIENT_ID || process.env.BC_CLIENT_ID;
  const azureAdBase = `https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0`;

  // /authorize — redirect to Azure AD authorize endpoint
  // SECURITY: Rate-limited to prevent redirect floods to Azure AD
  app.get('/authorize', authLimiter, (req, res) => {
    const params = new URLSearchParams(req.query as Record<string, string>);
    // Replace generic scope with Azure AD scope
    if (params.get('scope') && !params.get('scope')?.startsWith('api://')) {
      params.set('scope', `api://${azureClientId}/.default openid`);
    }
    res.redirect(`${azureAdBase}/authorize?${params.toString()}`);
  });

  // /token — proxy to Azure AD token endpoint
  // SECURITY: Rate-limited to prevent brute-force token exchange attempts
  app.post('/token', authLimiter, express.urlencoded({ extended: true }), async (req, res) => {
    try {
      const body = new URLSearchParams(req.body as Record<string, string>);
      // Inject client secret if not provided (MCP clients may not have it)
      if (!body.get('client_secret') && process.env.AZURE_CLIENT_SECRET) {
        body.set('client_secret', process.env.AZURE_CLIENT_SECRET);
      }
      // Replace generic scope with Azure AD scope
      if (body.get('scope') && !body.get('scope')?.startsWith('api://')) {
        body.set('scope', `api://${azureClientId}/.default`);
      }
      const response = await fetch(`${azureAdBase}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logger.error('Token proxy error', error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'token_proxy_error' });
    }
  });
}

// SECURITY: Basic health check (minimal info, no auth required)
// Used by Azure Container Apps health probes and load balancers
app.get('/health', healthCheckLimiter, (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// SECURITY: Detailed health check (requires authentication)
// Exposes detailed system information for monitoring and debugging
app.get('/health/detailed', healthCheckLimiter, authMiddleware, (_req, res) => {
  const stats = mcpHandler.getCacheStats();
  const envSummary = getEnvironmentSummary();

  // Server is always ready with generic tools (no lazy loading needed)
  const isReady = true;

  res.json({
    status: 'healthy',
    version: VERSION,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    ready: isReady,
    toolsMode: 'generic',
    toolsCount: 14,
    config: {
      metadataMode: config.metadataMode,
      authMode: config.authMode
    },
    environment: envSummary,
    cache: stats,
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }
  });
});

app.post('/cache/invalidate', authMiddleware, (_req, res) => {
  mcpHandler.invalidateCache();
  res.json({ success: true, message: 'Cache invalidated' });
});

app.get('/info', authMiddleware, (_req, res) => {
  const stats = mcpHandler.getCacheStats();

  res.json({
    name: 'Business Central MCP Server',
    version: VERSION,
    protocol: 'MCP 2024-11-05',
    description: 'Model Context Protocol server for Microsoft Dynamics 365 Business Central',
    features: {
      urlBasedConfiguration: true,
      standardApis: true,
      customApis: true,
      metadataModes: ['all', 'extensions-only'],
      authentication: ['api-key', 'oauth2', 'oauth2-dcr'],
      toolGeneration: 'lazy-on-demand',
      caching: 'in-memory-ttl',
      toolMode: process.env.TOOL_MODE || 'dynamic', // Show current TOOL_MODE setting
      dynamicClientRegistration: true // RFC 7591 DCR support
    },
    initialization: {
      ready: true,
      toolsCached: stats.entries > 0,
      toolsCount: stats.totalTools,
      note: stats.entries === 0 ? 'Tools will be generated on first tools/list request (2-5 seconds)' : 'Tools are cached and ready (<50ms)'
    },
    endpoints: {
      standard: '/{tenantId}/{env}/api/{version}/companies({companyId})',
      custom: '/{tenantId}/{env}/api/{publisher}/{group}/{version}/companies({companyId})',
      mcp: '/mcp (X-API-Key or Bearer - supports URL config OR env vars)',
      health: '/health',
      info: '/info',
      openidConfiguration: '/.well-known/openid-configuration',
      oauth: config.authMode === 'oauth' ? {
        authorize: '/oauth/authorize',
        callback: '/oauth/callback',
        register: '/oauth/register (DCR)',
        clients: '/oauth/clients (admin)'
      } : {
        register: '/oauth/register (DCR)',
        openidConfiguration: '/.well-known/openid-configuration'
      }
    }
  });
});

// MCP Endpoint at root path (for Copilot Studio compatibility)
// When Copilot Studio uses base URL without /mcp suffix, it expects MCP protocol at /
// This handles both POST (JSON-RPC) and GET (SSE) for MCP protocol
const rootMcpEndpoint = createCopilotSseEndpoint();
app.post('/', authLimiter, mcpRateLimiter, parseBCConfigWithFallback, authMiddleware, (req, res, next) => {
  rootMcpEndpoint(req, res, next);
});
app.get('/', authLimiter, mcpRateLimiter, parseBCConfigWithFallback, authMiddleware, (req, res, next) => {
  rootMcpEndpoint(req, res, next);
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    hint: 'Use POST to /{tenantId}/{env}/api/{version}/companies({companyId})'
  });
});

app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  // Get request ID for correlation
  const requestId = req.requestId;

  // SECURITY: Log full error details server-side
  logger.error('Unhandled error', error, {
    requestId,
    path: req.path,
    method: req.method,
    stack: error.stack
  });

  // SECURITY: Return generic error in production, detailed in development
  const isDevelopment = config.env !== 'production';
  const errorResponse: any = {
    error: 'Internal Server Error',
    requestId: requestId, // Include request ID for user to reference in support tickets
  };

  if (isDevelopment) {
    // Development: Show detailed error for debugging
    errorResponse.message = error.message;
    errorResponse.stack = error.stack;
    errorResponse.path = req.path;
    errorResponse.method = req.method;
  } else {
    // Production: Generic message, log details server-side
    errorResponse.message = 'An internal error occurred. Please contact support with the request ID.';
  }

  res.status(500).json(errorResponse);
});

export async function startHttpServer() {
  const port = config.port;
  const server = app.listen(port, () => {
    logger.info(`Business Central MCP Server running on port ${port}`);
    logger.info(`Metadata mode: ${config.metadataMode}`);
    logger.info(`Authentication: ${config.authMode}`);
    logger.info(`Environment: ${config.env}`);
  });

  const shutdown = () => {
    logger.info('Shutting down gracefully...');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10s if connections don't drain
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
