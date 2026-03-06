/**
 * Business Central MCP Server - SSE Transport (Streamable HTTP)
 * Server-Sent Events transport for Microsoft Copilot Studio
 */

import { Router, Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';
import { VERSION, SERVER_NAME } from '../version.js';
import { MetadataParser } from '../bc/metadata.js';
import { ToolGenerator } from '../tools/generator.js';
import { ToolExecutor } from '../tools/executor.js';
import { OAuthAuth } from '../auth/oauth.js';
import { BC_PROMPTS, getPromptTemplate } from '../mcp/prompts.js';
import { resolveBCConfig } from '../config.js';
import { LRUCache } from 'lru-cache';

// Store active SSE sessions (bounded to prevent memory exhaustion from leaked connections)
const sessions = new LRUCache<string, { transport: SSEServerTransport; server: Server }>({
  max: 100,
  ttl: 30 * 60 * 1000 // 30 minutes
});

/**
 * Create an MCP Server instance with all handlers configured
 */
function createMcpServerInstance(): Server {
  const bcConfig = resolveBCConfig({});

  let oauthAuth: OAuthAuth | undefined;
  const clientId = process.env.BC_CLIENT_ID || process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.BC_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;

  if (clientId && clientSecret && bcConfig.tenantId) {
    try {
      oauthAuth = new OAuthAuth(bcConfig.tenantId, clientId, clientSecret);
      logger.info('OAuth initialized for BC API authentication');
    } catch (error) {
      logger.error('OAuth initialization failed', error instanceof Error ? error : undefined);
    }
  }

  const server = new Server(
    {
      name: SERVER_NAME,
      version: VERSION
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    }
  );

  let cachedTools: any[] | null = null;

  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    if (cachedTools && !request.params?.cursor) {
      return { tools: cachedTools };
    }

    try {
      const accessToken = oauthAuth
        ? await oauthAuth.getAccessToken(bcConfig.tenantId)
        : process.env.BC_ACCESS_TOKEN || '';

      const metadataParser = new MetadataParser(
        bcConfig,
        accessToken,
        (process.env.METADATA_MODE as any) || 'all'
      );
      const entities = await metadataParser.parse();

      const generator = new ToolGenerator(bcConfig);
      const tools = generator.generateTools(entities);

      cachedTools = tools;

      if (request.params?.cursor) {
        const startIndex = parseInt(request.params.cursor, 10);
        const limit = 100;
        const endIndex = startIndex + limit;
        const paginatedTools = tools.slice(startIndex, endIndex);
        const nextCursor = endIndex < tools.length ? endIndex.toString() : undefined;

        return { tools: paginatedTools, nextCursor };
      }

      return { tools };
    } catch (error) {
      logger.error('Error generating tools', error instanceof Error ? error : undefined);
      return { tools: [] };
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const accessToken = oauthAuth
        ? await oauthAuth.getAccessToken(bcConfig.tenantId)
        : process.env.BC_ACCESS_TOKEN || '';

      const executor = new ToolExecutor(bcConfig, accessToken);
      const result = await executor.execute({
        toolName: request.params.name,
        arguments: request.params.arguments || {}
      });

      return {
        content: result.content,
        isError: result.isError
      };
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: `bc://${bcConfig.tenantId}/${bcConfig.environment}/companies`,
          name: 'Companies',
          description: 'Available Business Central companies',
          mimeType: 'application/json'
        },
        {
          uri: `bc://${bcConfig.tenantId}/${bcConfig.environment}/metadata`,
          name: 'API Metadata',
          description: 'OData metadata (EDMX)',
          mimeType: 'application/xml'
        }
      ]
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const accessToken = oauthAuth
      ? await oauthAuth.getAccessToken(bcConfig.tenantId)
      : process.env.BC_ACCESS_TOKEN || '';

    if (request.params.uri.endsWith('/companies')) {
      try {
        const executor = new ToolExecutor(bcConfig, accessToken);
        const result = await executor.execute({
          toolName: 'bc_v2_company_list',
          arguments: { $top: 100 }
        });

        return {
          contents: [{
            uri: request.params.uri,
            mimeType: 'application/json',
            text: result.content[0].text
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: request.params.uri,
            mimeType: 'text/plain',
            text: `Error reading companies: ${error instanceof Error ? error.message : 'Unknown error'}`
          }]
        };
      }
    }

    if (request.params.uri.endsWith('/metadata')) {
      try {
        const metadataParser = new MetadataParser(
          bcConfig,
          accessToken,
          (process.env.METADATA_MODE as any) || 'all'
        );
        const entities = await metadataParser.parse();

        const metadata = {
          tenant: bcConfig.tenantId,
          environment: bcConfig.environment,
          apiType: bcConfig.apiType,
          entityCount: entities.length,
          entities: entities.map(e => ({
            name: e.name,
            namespace: e.namespace,
            operations: e.operations,
            propertyCount: e.properties.length,
            navigationPropertyCount: e.navigationProperties.length
          }))
        };

        return {
          contents: [{
            uri: request.params.uri,
            mimeType: 'application/json',
            text: JSON.stringify(metadata, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: request.params.uri,
            mimeType: 'text/plain',
            text: `Error reading metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
          }]
        };
      }
    }

    throw new Error(`Resource not found: ${request.params.uri}`);
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: BC_PROMPTS
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const template = getPromptTemplate(request.params.name, request.params.arguments || {});

    if (!template) {
      throw new Error(`Prompt not found: ${request.params.name}`);
    }

    return {
      description: template.description,
      messages: template.messages
    };
  });

  return server;
}

export function createSseEndpoint(): Router {
  const router = Router();

  /**
   * GET /sse - Establish SSE connection (Streamable HTTP)
   * Client initiates SSE stream here
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      logger.info('SSE (Streamable HTTP) connection initiated');

      // Create full URL for message endpoint
      const protocol = req.protocol;
      const host = req.get('host');
      const messageEndpoint = `${protocol}://${host}/sse/message`;

      logger.info(`SSE message endpoint: ${messageEndpoint}`);

      // Create SSE transport with absolute message endpoint URL
      const transport = new SSEServerTransport(messageEndpoint, res);

      // Create MCP server instance for this session
      const server = createMcpServerInstance();

      // Store session
      sessions.set(transport.sessionId, { transport, server });

      // Connect transport to server
      await server.connect(transport);

      // Start SSE stream
      await transport.start();

      logger.info(`SSE session started: ${transport.sessionId}`);

      // Cleanup on close
      transport.onclose = () => {
        logger.info(`SSE session closed: ${transport.sessionId}`);
        sessions.delete(transport.sessionId);
      };

      transport.onerror = (error) => {
        logger.error(`SSE session error: ${transport.sessionId}`, error);
        sessions.delete(transport.sessionId);
      };

    } catch (error) {
      logger.error('Failed to establish SSE connection', error instanceof Error ? error : undefined);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'SSE Connection Failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });

  /**
   * POST /sse/message - Receive client messages
   * Client sends JSON-RPC requests here
   */
  router.post('/message', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['x-mcp-session-id'] as string;

      if (!sessionId) {
        res.status(400).json({ error: 'Missing x-mcp-session-id header' });
        return;
      }

      const session = sessions.get(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Handle the incoming message
      await session.transport.handlePostMessage(req as any, res as any);

    } catch (error) {
      logger.error('Failed to handle SSE message', error instanceof Error ? error : undefined);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Message Processing Failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });

  /**
   * DELETE /sse/:sessionId - Close SSE session
   */
  router.delete('/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (session) {
      session.transport.close();
      sessions.delete(sessionId);
      res.json({ message: 'Session closed' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  /**
   * GET /sse/sessions - List active sessions (for debugging)
   */
  router.get('/sessions', (_req: Request, res: Response) => {
    res.json({
      count: sessions.size,
      sessions: Array.from(sessions.keys())
    });
  });

  return router;
}
