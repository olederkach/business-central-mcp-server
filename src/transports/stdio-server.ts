/**
 * stdio Transport for MCP Server
 * Used by Claude Desktop, Claude Code, and other desktop MCP clients
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { OAuthAuth } from '../auth/oauth.js';
import { BC_PROMPTS, getPromptTemplate } from '../mcp/prompts.js';
import { CLIConfig, resolveBCConfig } from '../config.js';
import { VERSION, SERVER_NAME } from '../version.js';
import { GENERIC_TOOLS, isGenericTool } from '../tools/generic-tools.js';
import { GenericToolExecutor } from '../tools/generic-executor.js';
import { BCApiClient } from '../bc/client.js';
import { CompanyManager } from '../api/company-manager.js';
import { ApiContextManager } from '../api/api-context-manager.js';

/**
 * Start MCP server in stdio mode
 * @param cliConfig - Optional CLI configuration (overrides env vars)
 */
export async function startStdioServer(cliConfig: CLIConfig = {}): Promise<void> {
  // Resolve BC config from CLI args + environment variables
  const bcConfig = resolveBCConfig(cliConfig);

  console.error('✓ BC Configuration resolved:');
  console.error(`  Tenant: ${bcConfig.tenantId}`);
  console.error(`  Environment: ${bcConfig.environment}`);
  console.error(`  Company: ${bcConfig.companyId}`);
  console.error(`  API Type: ${bcConfig.apiType}`);

  // Setup OAuth with CLI-provided or environment credentials
  let oauthAuth: OAuthAuth | undefined;

  const clientId =
    cliConfig.clientId ||
    process.env.BC_CLIENT_ID ||
    process.env.AZURE_CLIENT_ID;

  const clientSecret =
    cliConfig.clientSecret ||
    process.env.BC_CLIENT_SECRET ||
    process.env.AZURE_CLIENT_SECRET;

  if (clientId && clientSecret && bcConfig.tenantId) {
    try {
      oauthAuth = new OAuthAuth(bcConfig.tenantId, clientId, clientSecret);
      console.error('✅ OAuth initialized for BC API authentication');
    } catch (error) {
      console.error('❌ OAuth initialization failed:', error);
      console.error('   BC API calls will fail without valid credentials');
      oauthAuth = undefined;
    }
  } else {
    console.error('⚠️  Warning: BC OAuth credentials not configured');
    console.error('   Set BC_CLIENT_ID and BC_CLIENT_SECRET');
    console.error('   Or use --clientId and --clientSecret arguments');
  }

  // Initialize session objects (persist across tool calls)
  const bcClientForDiscovery = new BCApiClient(bcConfig);
  const apiContextManager = new ApiContextManager(bcClientForDiscovery);
  const bcClient = new BCApiClient(bcConfig, apiContextManager);
  const companyManager = new CompanyManager(bcClient);

  // Create MCP server
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

  // Helper to get access token
  async function getAccessToken(): Promise<string> {
    if (oauthAuth) {
      return oauthAuth.getAccessToken(bcConfig.tenantId);
    }
    return process.env.BC_ACCESS_TOKEN || '';
  }

  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    // Return generic tools (14 resource-agnostic tools)
    if (request.params?.cursor) {
      const startIndex = parseInt(request.params.cursor, 10);
      // Validate cursor is a non-negative integer; if invalid, return full list
      if (isNaN(startIndex) || startIndex < 0 || startIndex >= GENERIC_TOOLS.length) {
        return { tools: GENERIC_TOOLS };
      }
      const limit = 100;
      const endIndex = startIndex + limit;
      const paginatedTools = GENERIC_TOOLS.slice(startIndex, endIndex);
      const nextCursor = endIndex < GENERIC_TOOLS.length ? endIndex.toString() : undefined;
      return { tools: paginatedTools, nextCursor };
    }
    return { tools: GENERIC_TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;

    if (!isGenericTool(toolName)) {
      throw new Error(`Tool not found: ${toolName}. Use list_tools to see available tools.`);
    }

    const accessToken = await getAccessToken();
    const executor = new GenericToolExecutor(bcClient, companyManager, apiContextManager, accessToken);

    const result = await executor.execute({
      toolName,
      arguments: request.params.arguments || {}
    });

    return {
      content: result.content,
      isError: result.isError
    };
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
          uri: `bc://${bcConfig.tenantId}/${bcConfig.environment}/api-contexts`,
          name: 'API Contexts',
          description: 'Available API routes (publisher/group/version)',
          mimeType: 'application/json'
        }
      ]
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const accessToken = await getAccessToken();

    if (request.params.uri.endsWith('/companies')) {
      try {
        const companies = await companyManager.discoverCompanies();
        return {
          contents: [{
            uri: request.params.uri,
            mimeType: 'application/json',
            text: JSON.stringify({ count: companies.length, companies }, null, 2)
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

    if (request.params.uri.endsWith('/api-contexts')) {
      try {
        const apis = await apiContextManager.discoverApis(accessToken);
        return {
          contents: [{
            uri: request.params.uri,
            mimeType: 'application/json',
            text: JSON.stringify({ count: apis.length, apis }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: request.params.uri,
            mimeType: 'text/plain',
            text: `Error reading API contexts: ${error instanceof Error ? error.message : 'Unknown error'}`
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

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('✅ Business Central MCP Server running on stdio');
  console.error(`   Version: ${VERSION}`);
  console.error(`   Tools: ${GENERIC_TOOLS.length} generic tools`);
  console.error(`   Tenant: ${bcConfig.tenantId}`);
  console.error(`   Environment: ${bcConfig.environment}`);
}
