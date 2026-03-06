/**
 * MCP Protocol Handler
 * Implements Model Context Protocol JSON-RPC 2.0
 */

import { Request, Response } from 'express';
import { BCConfigParser } from '../bc/config.js';
import { MetadataParser, MetadataMode } from '../bc/metadata.js';
import { MCPTool } from '../tools/generator.js';
import { OAuthAuth } from '../auth/oauth.js';
import { BC_PROMPTS, getPromptTemplate } from './prompts.js';
import { trackMcpRequest } from '../monitoring/app-insights.js';
import { GENERIC_TOOLS, isGenericTool } from '../tools/generic-tools.js';
import { GenericToolExecutor } from '../tools/generic-executor.js';
import { CompanyManager } from '../api/company-manager.js';
import { VERSION, SERVER_NAME } from '../version.js';
import { ApiContextManager } from '../api/api-context-manager.js';
import { BCApiClient } from '../bc/client.js';
import { logger } from '../utils/logger.js';
import { LogSanitizer } from '../utils/log-sanitizer.js';
import { validateJsonRpcMethod, validateToolName, validateResourceUri, ValidationError } from '../utils/input-validator.js';
import { LRUCache } from 'lru-cache';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface McpServerInfo {
  name: string;
  version: string;
  description?: string;
}

interface McpCapabilities {
  tools?: Record<string, any>;
  resources?: Record<string, any>;
  prompts?: Record<string, any>;
}

interface ManagedSession {
  bcClient: BCApiClient;
  companyManager: CompanyManager;
  apiContextManager: ApiContextManager;
}

export class McpProtocolHandler {
  private oauthAuth?: OAuthAuth;
  private metadataMode: MetadataMode;
  private sessions = new LRUCache<string, ManagedSession>({ max: 100, ttl: 30 * 60 * 1000 });

  constructor(metadataMode: MetadataMode = 'all') {
    this.metadataMode = metadataMode;
    logger.info('MCP Protocol Handler initialized (generic tools mode)');

    // Always initialize OAuth for BC API calls (separate from MCP endpoint auth)
    try {
      this.oauthAuth = new OAuthAuth();
      logger.info('OAuth initialized for BC API authentication');
    } catch (error) {
      logger.error('OAuth initialization failed', error instanceof Error ? error : undefined, {
        BC_TENANT_ID: process.env.BC_TENANT_ID ? 'Set' : 'MISSING',
        BC_CLIENT_ID: process.env.BC_CLIENT_ID ? 'Set' : 'MISSING',
        BC_CLIENT_SECRET: process.env.BC_CLIENT_SECRET ? 'Set' : 'MISSING',
        AZURE_TENANT_ID: process.env.AZURE_TENANT_ID ? 'Set' : 'MISSING',
        AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID ? 'Set' : 'MISSING',
        AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET ? 'Set' : 'MISSING'
      });
      this.oauthAuth = undefined;
    }
  }

  async handle(req: Request, res: Response): Promise<void> {
    const rpcRequest = req.body as JsonRpcRequest;
    const startTime = Date.now();

    logger.info('MCP Request Received', {
      requestId: rpcRequest.id,
      method: rpcRequest.method,
      params: LogSanitizer.sanitize(rpcRequest.params),
      source: req.ip || req.socket.remoteAddress
    });

    if (rpcRequest.jsonrpc !== '2.0') {
      const errorResponse = this.createError(
        rpcRequest.id,
        -32600,
        'Invalid Request: jsonrpc must be "2.0"'
      );

      logger.error('MCP Request Invalid', undefined, {
        requestId: rpcRequest.id,
        error: errorResponse.error
      });

      res.status(400).json(errorResponse);
      return;
    }

    // SECURITY: Validate JSON-RPC method name
    try {
      validateJsonRpcMethod(rpcRequest.method);
    } catch (error) {
      if (error instanceof ValidationError) {
        const errorResponse = this.createError(
          rpcRequest.id,
          -32601,
          `Invalid method: ${error.message}`
        );

        logger.error('MCP Method Validation Failed', undefined, {
          requestId: rpcRequest.id,
          method: rpcRequest.method,
          validationError: error.message
        });

        res.status(400).json(errorResponse);
        return;
      }
      throw error;
    }

    // Handle notifications (no response needed)
    if (rpcRequest.method?.startsWith('notifications/')) {
      logger.info('MCP Notification (no response)', {
        requestId: rpcRequest.id,
        method: rpcRequest.method
      });
      res.status(204).send();
      return;
    }

    try {
      const result = await this.handleMethod(rpcRequest, req);
      const duration = Date.now() - startTime;

      // Track successful MCP request
      trackMcpRequest(rpcRequest.method, duration, true);

      const successResponse = this.createSuccess(rpcRequest.id, result);

      logger.info('MCP Response Success', {
        requestId: rpcRequest.id,
        method: rpcRequest.method,
        duration,
        resultSize: JSON.stringify(result).length
      });

      res.json(successResponse);
    } catch (error) {
      const duration = Date.now() - startTime;

      // Track failed MCP request
      trackMcpRequest(rpcRequest.method, duration, false);

      const errorResponse = this.createError(
        rpcRequest.id,
        -32603,
        error instanceof Error ? error.message : 'Internal error'
      );

      logger.error('MCP Response Error', error instanceof Error ? error : undefined, {
        requestId: rpcRequest.id,
        method: rpcRequest.method,
        duration
      });

      res.json(errorResponse);
    }
  }

  private async handleMethod(rpcRequest: JsonRpcRequest, req: Request): Promise<any> {
    switch (rpcRequest.method) {
      case 'initialize':
        return this.handleInitialize(rpcRequest.params);

      case 'ping':
        return this.handlePing();

      case 'tools/list':
        return this.handleToolsList(req, rpcRequest.params);

      case 'tools/call':
        return this.handleToolsCall(rpcRequest.params, req);

      case 'resources/list':
        return this.handleResourcesList(req);

      case 'resources/read':
        return this.handleResourcesRead(rpcRequest.params, req);

      case 'prompts/list':
        return this.handlePromptsList(req);

      case 'prompts/get':
        return this.handlePromptsGet(rpcRequest.params, req);

      default:
        throw new Error(`Method not found: ${rpcRequest.method}`);
    }
  }

  private handleInitialize(_params: any): any {
    return {
      protocolVersion: '2025-03-26',
      serverInfo: {
        name: SERVER_NAME,
        version: VERSION,
        description: 'Model Context Protocol server for Microsoft Dynamics 365 Business Central'
      } as McpServerInfo,
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        // MCP 2025-03-26: Completions capability for argument autocompletion
        completions: {}
      } as McpCapabilities
    };
  }

  /**
   * REQUIRED MCP METHOD: ping
   * Liveness check - can be initiated by either client or server
   * Returns empty object per MCP specification
   */
  private handlePing(): any {
    return {};
  }

  /**
   * Get or create a managed session for the given BC config.
   * Sessions are keyed by tenant+environment so state (active company, API context)
   * persists across requests to the same tenant/environment.
   */
  private getSession(bcConfig: any): ManagedSession {
    const key = `${bcConfig.tenantId}:${bcConfig.environment}`;
    let session = this.sessions.get(key);
    if (!session) {
      const bcClientForDiscovery = new BCApiClient(bcConfig);
      const apiContextManager = new ApiContextManager(bcClientForDiscovery);
      const bcClient = new BCApiClient(bcConfig, apiContextManager);
      const companyManager = new CompanyManager(bcClient);
      session = { bcClient, companyManager, apiContextManager };
      this.sessions.set(key, session);
    }
    return session;
  }

  private async handleToolsList(_req: Request, _params?: any): Promise<{ tools: MCPTool[] }> {
    logger.info(`Tools/list: Returning ${GENERIC_TOOLS.length} generic tools`);
    return { tools: GENERIC_TOOLS };
  }

  private async handleToolsCall(params: any, req: Request): Promise<any> {
    const bcConfig = (req as any).bcConfig;
    if (!bcConfig) {
      throw new Error('BC configuration not found in request');
    }

    if (!params?.name) {
      throw new Error('Missing required parameter: name');
    }

    // SECURITY: Validate tool name to prevent injection attacks
    try {
      validateToolName(params.name);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new Error(`Invalid tool name: ${error.message}`);
      }
      throw error;
    }

    const toolName = params.name;

    // Verify tool exists in generic tools
    if (!isGenericTool(toolName)) {
      throw new Error(`Tool not found: ${toolName}. Only generic tools (13 tools) are supported.`);
    }

    logger.info(`Executing generic tool: ${toolName}`);

    const accessToken = await this.getAccessToken(req, bcConfig.tenantId);

    const { bcClient, companyManager, apiContextManager } = this.getSession(bcConfig);
    const executor = new GenericToolExecutor(bcClient, companyManager, apiContextManager, accessToken);

    return executor.execute({
      toolName,
      arguments: params.arguments || {}
    });
  }

  private async handleResourcesList(req: Request): Promise<{ resources: any[] }> {
    const bcConfig = (req as any).bcConfig;
    if (!bcConfig) {
      throw new Error('BC configuration not found in request');
    }

    return {
      resources: [
        {
          uri: `bc://${bcConfig.tenantId}/${bcConfig.environment}/companies`,
          name: 'Companies List',
          description: 'Available Business Central companies - use for company_id parameter in tools. Returns list with id (UUID), displayName, and other company details.',
          mimeType: 'application/json'
        },
        {
          uri: `bc://${bcConfig.tenantId}/${bcConfig.environment}/entities`,
          name: 'Entity Categories',
          description: 'Available Business Central entity/resource names (API categories) - use for resource parameter in tools. Returns entity names like "customers", "items", "salesOrders", "vendors", etc.',
          mimeType: 'application/json'
        },
        {
          uri: `bc://${bcConfig.tenantId}/${bcConfig.environment}/api-contexts`,
          name: 'API Contexts',
          description: 'Available API routes with publisher, group, and version - use for set_active_api tool. Returns Standard BC API v2.0, Microsoft extended APIs, and custom ISV APIs.',
          mimeType: 'application/json'
        },
        {
          uri: `bc://${bcConfig.tenantId}/${bcConfig.environment}/metadata`,
          name: 'Full API Metadata',
          description: 'Complete OData metadata (EDMX) with all entities, properties, and relationships',
          mimeType: 'application/json'
        }
      ]
    };
  }

  private async handleResourcesRead(params: any, req: Request): Promise<any> {
    const bcConfig = (req as any).bcConfig;
    if (!bcConfig) {
      throw new Error('BC configuration not found in request');
    }

    if (!params?.uri) {
      throw new Error('Missing required parameter: uri');
    }

    // SECURITY: Validate resource URI to prevent injection attacks
    try {
      validateResourceUri(params.uri);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new Error(`Invalid resource URI: ${error.message}`);
      }
      throw error;
    }

    const accessToken = await this.getAccessToken(req, bcConfig.tenantId);

    if (params.uri.endsWith('/companies')) {
      const { companyManager } = this.getSession(bcConfig);
      const companies = await companyManager.discoverCompanies();

      return {
        contents: [{
          uri: params.uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            count: companies.length,
            companies: companies
          }, null, 2)
        }]
      };
    }

    if (params.uri.endsWith('/entities')) {
      // Return list of available entity names (resource names)
      const metadataParser = new MetadataParser(bcConfig, accessToken, this.metadataMode);

      try {
        const entities = await metadataParser.parse();
        const entityNames = entities.map(e => ({
          name: e.name,
          entitySetName: e.entitySetName,
          operations: e.operations,
          description: `${e.name} entity with ${e.properties.length} properties`
        }));

        return {
          contents: [{
            uri: params.uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              count: entityNames.length,
              entities: entityNames
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: params.uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to fetch entities'
            }, null, 2)
          }]
        };
      }
    }

    if (params.uri.endsWith('/api-contexts')) {
      const { apiContextManager } = this.getSession(bcConfig);

      try {
        const apis = await apiContextManager.discoverApis(accessToken);

        return {
          contents: [{
            uri: params.uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              count: apis.length,
              apis: apis.map(api => ({
                publisher: api.publisher,
                group: api.group,
                version: api.version,
                displayName: api.displayName,
                isStandardApi: api.publisher === '' && api.group === ''
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: params.uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to fetch API contexts',
              default: {
                publisher: '',
                group: '',
                version: 'v2.0',
                displayName: 'Standard BC API v2.0',
                isStandardApi: true
              }
            }, null, 2)
          }]
        };
      }
    }

    if (params.uri.endsWith('/metadata')) {
      const metadataParser = new MetadataParser(bcConfig, accessToken, this.metadataMode);
      const metadataUrl = BCConfigParser.buildMetadataUrl(bcConfig);
      
      try {
        const entities = await metadataParser.parse();
        const metadata = {
          url: metadataUrl,
          entityCount: entities.length,
          entities: entities.map(e => ({
            name: e.name,
            operations: e.operations,
            propertyCount: e.properties.length
          }))
        };

        return {
          contents: [{
            uri: params.uri,
            mimeType: 'application/json',
            text: JSON.stringify(metadata, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: params.uri,
            mimeType: 'text/plain',
            text: `Metadata endpoint: ${metadataUrl}\nError: ${error instanceof Error ? error.message : 'Failed to fetch'}`
          }]
        };
      }
    }

    throw new Error(`Resource not found: ${params.uri}`);
  }

  private async handlePromptsList(_req: Request): Promise<{ prompts: any[] }> {
    return {
      prompts: BC_PROMPTS
    };
  }

  private async handlePromptsGet(params: any, _req: Request): Promise<any> {
    if (!params?.name) {
      throw new Error('Missing required parameter: name');
    }

    const template = getPromptTemplate(params.name, params.arguments || {});
    
    if (!template) {
      throw new Error(`Prompt not found: ${params.name}`);
    }

    return template;
  }

  private async getAccessToken(req: Request, tenantId: string): Promise<string> {
    const explicitToken = (req as any).accessToken;
    if (explicitToken) {
      return explicitToken;
    }

    if (!this.oauthAuth) {
      throw new Error('OAuth not configured and no access token provided');
    }

    return this.oauthAuth.getAccessToken(tenantId);
  }

  private createSuccess(id: string | number | undefined, result: any): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  private createError(id: string | number | undefined, code: number, message: string, data?: any): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, data }
    };
  }

  invalidateCache(): void {
    this.sessions.clear();
    logger.info('Cache invalidated: sessions cleared');
  }

  getCacheStats(): any {
    // Generic tools mode - return minimal stats
    return {
      mode: 'generic',
      totalTools: GENERIC_TOOLS.length,
      entries: 0,
      hits: 0,
      misses: 0,
      size: 0
    };
  }
}
