/**
 * Microsoft Copilot Studio Compatible SSE Transport
 * Implements the Streamable HTTP protocol expected by Copilot Studio
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { VERSION, SERVER_NAME } from '../version.js';
import { MetadataParser } from '../bc/metadata.js';
import { ToolGenerator } from '../tools/generator.js';
import { ToolExecutor } from '../tools/executor.js';
import { OAuthAuth } from '../auth/oauth.js';
import { resolveBCConfig } from '../config.js';
import { GENERIC_TOOLS, isGenericTool } from '../tools/generic-tools.js';
import { GenericToolExecutor } from '../tools/generic-executor.js';
import { BCApiClient } from '../bc/client.js';
import { CompanyManager } from '../api/company-manager.js';
import { ApiContextManager } from '../api/api-context-manager.js';
import { validateToolName, validateResourceUri } from '../utils/input-validator.js';
import { LRUCache } from 'lru-cache';

interface CopilotSession {
  bcClient: BCApiClient;
  companyManager: CompanyManager;
  apiContextManager: ApiContextManager;
}

const ALLOWED_METHODS = new Set([
  'initialize', 'notifications/initialized',
  'tools/list', 'tools/call',
  'resources/list', 'resources/read',
  'prompts/list', 'prompts/get',
  'ping'
]);

export function createCopilotSseEndpoint(): Router {
  const router = Router();
  const bcConfig = resolveBCConfig({});

  let oauthAuth: OAuthAuth | undefined;
  const clientId = process.env.BC_CLIENT_ID || process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.BC_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;

  if (clientId && clientSecret && bcConfig.tenantId) {
    try {
      oauthAuth = new OAuthAuth(bcConfig.tenantId, clientId, clientSecret);
      logger.info('OAuth initialized for Copilot Studio SSE');
    } catch (error) {
      logger.error('OAuth initialization failed', error instanceof Error ? error : undefined);
    }
  }

  // Session cache: reuse BCApiClient/CompanyManager/ApiContextManager across requests
  const sessions = new LRUCache<string, CopilotSession>({ max: 50, ttl: 30 * 60 * 1000 });

  function getOrCreateSession(config: typeof bcConfig): CopilotSession {
    const key = `${config.tenantId}:${config.environment}`;
    let session = sessions.get(key);
    if (!session) {
      const bcClientForDiscovery = new BCApiClient(config);
      const apiContextManager = new ApiContextManager(bcClientForDiscovery);
      const bcClient = new BCApiClient(config, apiContextManager);
      const companyManager = new CompanyManager(bcClient);
      session = { bcClient, companyManager, apiContextManager };
      sessions.set(key, session);
    }
    return session;
  }

  /**
   * GET endpoint for SSE streaming (server-to-client messages)
   * Per MCP Streamable HTTP spec, clients can open SSE connection to receive server messages
   *
   * Special handling for validation requests (Claude Web, etc):
   * - If Accept header prefers JSON over SSE, return server info as JSON
   * - Otherwise, open SSE stream
   */
  router.get('/', async (req: Request, res: Response) => {
    const acceptHeader = req.get('Accept') || '';
    const userAgent = req.get('User-Agent') || '';

    // Detect validation/discovery requests (prefer JSON response for validators)
    const isValidationRequest =
      acceptHeader.includes('application/json') && !acceptHeader.includes('text/event-stream') ||
      acceptHeader.includes('*/*') && !req.get('Connection')?.includes('keep-alive') ||
      userAgent.includes('curl') && !acceptHeader.includes('text/event-stream');

    if (isValidationRequest) {
      // Return server capabilities for validation/discovery
      logger.info('MCP validation/discovery request detected');
      res.json({
        name: SERVER_NAME,
        version: VERSION,
        protocol: 'MCP 2024-11-05 / 2025-03-26',  // Support both protocols
        description: 'Model Context Protocol server for Microsoft Dynamics 365 Business Central',
        transports: ['sse', 'http'],
        capabilities: {
          tools: {
            listChanged: true
          },
          resources: {
            subscribe: true,
            listChanged: true
          }
        },
        note: 'Prompts capability available for protocol 2025-03-26+ clients',
        endpoints: {
          sse: 'GET (Server-Sent Events)',
          jsonrpc: 'POST (JSON-RPC 2.0)'
        }
      });
      return;
    }

    // Normal SSE connection
    logger.info('SSE connection opened');

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Send initial comment to establish connection
    res.write(': connected\n\n');

    // Keep connection alive with periodic pings
    const keepAliveInterval = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 30000);

    // Clean up on connection close
    req.on('close', () => {
      logger.info('SSE connection closed');
      clearInterval(keepAliveInterval);
    });
  });

  /**
   * Handle a single JSON-RPC request and return the response
   * Returns null for notifications (no response needed)
   */
  async function handleSingleRequest(body: any): Promise<any> {
    try {
      // Validate request has required fields
      if (!body || typeof body !== 'object') {
        return {
          jsonrpc: '2.0',
          id: body?.id || null,
          error: {
            code: -32600,
            message: 'Invalid Request'
          }
        };
      }

      // Handle notifications (no id = notification, no response needed)
      if (!('id' in body)) {
        logger.info(`Notification received: ${body.method}`);
        return null;
      }

      // Handle missing method
      if (!body.method) {
        return {
          jsonrpc: '2.0',
          id: body.id,
          error: {
            code: -32600,
            message: 'Invalid Request: missing method'
          }
        };
      }

      // Validate JSON-RPC method
      if (!ALLOWED_METHODS.has(body.method)) {
        return {
          jsonrpc: '2.0',
          id: body.id,
          error: {
            code: -32601,
            message: `Method not found: ${body.method}`
          }
        };
      }

      // Handle specific methods
      if (body.method === 'initialize') {
        logger.info('Processing initialize request', {
          clientProtocol: body.params?.protocolVersion,
          clientInfo: body.params?.clientInfo
        });

        // Protocol version negotiation: Use client's version for backwards compatibility
        const clientProtocol = body.params?.protocolVersion || '2024-11-05';
        const serverProtocol = '2025-03-26';
        // Copilot Studio uses 2024-11-05, so use that for compatibility
        const negotiatedProtocol = clientProtocol === '2024-11-05' ? '2024-11-05' : serverProtocol;

        // Build capabilities based on protocol version
        const capabilities: any = {
          tools: {
            listChanged: true
          },
          resources: {
            subscribe: true,
            listChanged: true
          }
        };

        // Prompts were added in protocol 2025-03-26, only include for newer clients
        if (negotiatedProtocol !== '2024-11-05') {
          capabilities.prompts = {
            listChanged: true
          };
          capabilities.completions = {};
        }

        return {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: negotiatedProtocol,
            capabilities,
            serverInfo: {
              name: SERVER_NAME,
              version: VERSION
            }
          }
        };
      }

      if (body.method === 'tools/list') {
        // Feature flag: Use generic tools if TOOL_MODE=generic
        const useGenericTools = process.env.TOOL_MODE?.trim() === 'generic';

        logger.info('🔧 tools/list request received', {
          toolMode: process.env.TOOL_MODE,
          useGenericTools,
          params: body.params
        });

        if (useGenericTools) {
          const cleanTools = GENERIC_TOOLS.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }));

          logger.info(`✅ Returning ${cleanTools.length} generic tools`, {
            toolNames: cleanTools.map(t => t.name)
          });

          const response = {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: cleanTools
            }
          };

          logger.info('📤 tools/list response', {
            toolCount: cleanTools.length,
            responseSize: JSON.stringify(response).length
          });

          return response;
        }

        // Legacy: Dynamic tool generation
        logger.info('Using dynamic tools mode (generating from metadata)');
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

        // Support cursor-based pagination
        const cursor = body.params?.cursor;
        const requestedLimit = body.params?.limit;
        const pageSize = Math.min(requestedLimit || 100, 200);

        let paginatedTools = tools;
        let nextCursor: string | undefined;

        if (cursor) {
          const startIndex = parseInt(cursor, 10);
          paginatedTools = tools.slice(startIndex, startIndex + pageSize);
          if (startIndex + pageSize < tools.length) {
            nextCursor = (startIndex + pageSize).toString();
          }
        } else {
          paginatedTools = tools.slice(0, pageSize);
          if (pageSize < tools.length) {
            nextCursor = pageSize.toString();
          }
        }

        logger.info(`Returning ${paginatedTools.length} of ${tools.length} tools`);

        // Strip annotations field for Claude Web compatibility
        // Some clients may not handle additional fields well
        const cleanTools = paginatedTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }));

        return {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            tools: cleanTools,
            ...(nextCursor && { nextCursor })
          }
        };
      }

      if (body.method === 'tools/call') {
        const accessToken = oauthAuth
          ? await oauthAuth.getAccessToken(bcConfig.tenantId)
          : process.env.BC_ACCESS_TOKEN || '';

        const toolName = body.params.name;
        const toolArgs = body.params.arguments || {};
        const useGenericTools = process.env.TOOL_MODE?.trim() === 'generic';

        // Validate tool name before execution
        try {
          validateToolName(toolName);
        } catch {
          return {
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32602,
              message: `Invalid tool name: ${toolName}`
            }
          };
        }

        logger.info('🔧 tools/call request received', {
          toolName,
          arguments: toolArgs,
          toolMode: process.env.TOOL_MODE,
          useGenericTools,
          isGenericTool: isGenericTool(toolName)
        });

        // Feature flag: Check if this is a generic tool execution
        if (useGenericTools && isGenericTool(toolName)) {
          logger.info(`⚡ Executing generic tool: ${toolName}`);

          const { bcClient, companyManager, apiContextManager } = getOrCreateSession(bcConfig);
          const executor = new GenericToolExecutor(bcClient, companyManager, apiContextManager, accessToken);

          const startTime = Date.now();
          const result = await executor.execute({
            toolName,
            arguments: toolArgs
          });
          const duration = Date.now() - startTime;

          logger.info(`✅ Tool execution completed: ${toolName}`, {
            duration: `${duration}ms`,
            isError: result.isError,
            contentLength: JSON.stringify(result.content).length
          });

          const response = {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              content: result.content,
              isError: result.isError
            }
          };

          logger.info('📤 tools/call response', {
            toolName,
            responseSize: JSON.stringify(response).length
          });

          return response;
        }

        // Legacy: Dynamic tool execution
        logger.info(`Executing dynamic tool: ${toolName}`);
        const executor = new ToolExecutor(bcConfig, accessToken);
        const result = await executor.execute({
          toolName: body.params.name,
          arguments: body.params.arguments || {}
        });

        return {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: result.content,
            isError: result.isError
          }
        };
      }

      if (body.method === 'resources/list') {
        logger.info('📚 resources/list request received');

        const resources = [
          {
            uri: 'bc://environment/info',
            name: 'Environment Information',
            description: 'Current Business Central environment details (tenant, environment name, API version, company)',
            mimeType: 'application/json'
          },
          {
            uri: 'bc://api/context',
            name: 'Active API Context',
            description: 'Currently active Business Central API context (publisher, group, version)',
            mimeType: 'application/json'
          },
          {
            uri: 'bc://companies/list',
            name: 'Available Companies',
            description: 'List of all Business Central companies in the current environment',
            mimeType: 'application/json'
          },
          {
            uri: 'bc://entities/list',
            name: 'Available Entities',
            description: 'List of all Business Central entities (resources) available in the current API context',
            mimeType: 'application/json'
          },
          {
            uri: 'bc://tools/guide',
            name: 'Tool Usage Guide',
            description: 'Guide for using Business Central MCP tools effectively',
            mimeType: 'text/markdown'
          }
        ];

        logger.info(`✅ Returning ${resources.length} resources`);

        return {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            resources
          }
        };
      }

      if (body.method === 'resources/read') {
        const uri = body.params?.uri;
        logger.info(`📖 resources/read request received`, { uri });

        if (!uri) {
          return {
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32602,
              message: 'Invalid params: uri is required'
            }
          };
        }

        // Validate resource URI
        try {
          validateResourceUri(uri);
        } catch {
          return {
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32602,
              message: `Invalid resource URI: ${uri}`
            }
          };
        }

        // Get access token for BC API calls
        const accessToken = oauthAuth
          ? await oauthAuth.getAccessToken(bcConfig.tenantId)
          : process.env.BC_ACCESS_TOKEN || '';

        try {
          // Environment Information
          if (uri === 'bc://environment/info') {
            const companyId = process.env.BC_COMPANY_ID || bcConfig.companyId || '';
            return {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify({
                      tenant: {
                        id: bcConfig.tenantId
                      },
                      environment: {
                        name: bcConfig.environment,
                        type: bcConfig.environment === 'Production' ? 'production' : 'sandbox'
                      },
                      api: {
                        version: bcConfig.apiVersion,
                        baseUrl: `https://api.businesscentral.dynamics.com/${bcConfig.apiVersion}/${bcConfig.tenantId}/${bcConfig.environment}`
                      },
                      company: {
                        id: companyId
                      }
                    }, null, 2)
                  }
                ]
              }
            };
          }

          // Active API Context
          if (uri === 'bc://api/context') {
            return {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify({
                      publisher: '',
                      group: '',
                      version: 'v2.0',
                      displayName: 'Standard Business Central API v2.0',
                      description: 'The standard Microsoft Dynamics 365 Business Central API providing access to core entities like customers, vendors, items, and sales orders.'
                    }, null, 2)
                  }
                ]
              }
            };
          }

          // Companies List
          if (uri === 'bc://companies/list') {
            const bcClient = new BCApiClient(bcConfig);
            const response = await bcClient.get('companies', undefined, accessToken);
            const companies = response.value || [];

            return {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify({
                      count: companies.length,
                      companies: companies.map((c: any) => ({
                        id: c.id,
                        name: c.name,
                        displayName: c.displayName
                      }))
                    }, null, 2)
                  }
                ]
              }
            };
          }

          // Entities List
          if (uri === 'bc://entities/list') {
            const bcClientForDiscovery = new BCApiClient(bcConfig);
            const apiContextManager = new ApiContextManager(bcClientForDiscovery);
            const bcClient = new BCApiClient(bcConfig, apiContextManager);

            const response = await bcClient.get('', undefined, accessToken);

            // Extract entity names from OData context
            const entities = response.value || [];
            const entityNames = entities.map((e: any) => e.name || e.kind).filter(Boolean);

            return {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify({
                      apiContext: 'Standard BC API v2.0',
                      count: entityNames.length,
                      entities: entityNames.slice(0, 50),
                      note: entityNames.length > 50 ? `Showing first 50 of ${entityNames.length} entities. Use list_resources tool for complete list.` : undefined
                    }, null, 2)
                  }
                ]
              }
            };
          }

          // Tool Usage Guide
          if (uri === 'bc://tools/guide') {
            const guide = `# Business Central MCP Tools Guide

## Available Tool Categories

### 1. API Context Management
- \`list_bc_api_contexts\` - Discover available API contexts
- \`set_active_api\` - Switch between Standard, Microsoft, or ISV APIs
- \`get_active_api\` - Check current API context

### 2. Company Management
- \`list_companies\` - List all companies
- \`set_active_company\` - Switch active company
- \`get_active_company\` - Check current company

### 3. Resource Discovery
- \`list_resources\` - List all entity names (customers, items, etc.)
- \`get_resource_schema\` - Get entity schema/properties
- \`get_odata_metadata\` - Search metadata

### 4. CRUD Operations
- \`list_records\` - Query records with OData filters
- \`create_record\` - Create new records
- \`update_record\` - Update existing records
- \`delete_record\` - Delete records
- \`find_records_by_field\` - Search by specific field

## Common Usage Patterns

### Query Data
\`\`\`
list_records(resource="customers", top=10)
list_records(resource="salesOrders", filter="customerNumber eq '10000'")
\`\`\`

### Create Record
\`\`\`
create_record(resource="customers", data={
  "displayName": "New Customer",
  "email": "customer@example.com"
})
\`\`\`

### Update Record
\`\`\`
update_record(resource="customers", id="uuid", data={
  "email": "newemail@example.com"
})
\`\`\`

## Tips
- Always use \`list_resources\` to discover available entities
- Use \`get_resource_schema\` to see required fields before creating
- Entity names are case-sensitive (use exact names from list_resources)
`;
            return {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: 'text/markdown',
                    text: guide
                  }
                ]
              }
            };
          }

          // Unknown resource URI
          return {
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32602,
              message: `Unknown resource URI: ${uri}`
            }
          };
        } catch (error) {
          logger.error('Resource read failed', error instanceof Error ? error : undefined);
          return {
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Failed to read resource'
            }
          };
        }
      }

      if (body.method === 'prompts/list') {
        logger.info('💬 prompts/list request received');

        const prompts = [
          {
            name: 'query-customers',
            description: 'Query Business Central customers with optional filters',
            arguments: [
              {
                name: 'filter',
                description: 'OData filter expression (e.g., "displayName eq \'Acme Corp\'" or "city eq \'Atlanta\'")',
                required: false
              },
              {
                name: 'top',
                description: 'Number of records to return (default: 50, max: 1000)',
                required: false
              }
            ]
          },
          {
            name: 'query-sales-orders',
            description: 'Query Business Central sales orders with optional filters',
            arguments: [
              {
                name: 'customerNumber',
                description: 'Filter by customer number',
                required: false
              },
              {
                name: 'dateFilter',
                description: 'Filter by date (e.g., "orderDate gt 2025-01-01")',
                required: false
              },
              {
                name: 'top',
                description: 'Number of records to return (default: 50)',
                required: false
              }
            ]
          },
          {
            name: 'create-customer',
            description: 'Create a new Business Central customer with required and optional fields',
            arguments: [
              {
                name: 'displayName',
                description: 'Customer display name (required)',
                required: true
              },
              {
                name: 'email',
                description: 'Customer email address',
                required: false
              },
              {
                name: 'phoneNumber',
                description: 'Customer phone number',
                required: false
              },
              {
                name: 'address',
                description: 'Customer street address',
                required: false
              },
              {
                name: 'city',
                description: 'Customer city',
                required: false
              }
            ]
          },
          {
            name: 'explore-entities',
            description: 'Discover available Business Central entities and their schemas',
            arguments: [
              {
                name: 'searchTerm',
                description: 'Optional search term to filter entities (e.g., "sales", "customer")',
                required: false
              }
            ]
          },
          {
            name: 'switch-company',
            description: 'Switch to a different Business Central company',
            arguments: [
              {
                name: 'companyName',
                description: 'Company display name to switch to',
                required: false
              }
            ]
          }
        ];

        logger.info(`✅ Returning ${prompts.length} prompts`);

        return {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            prompts
          }
        };
      }

      if (body.method === 'prompts/get') {
        const promptName = body.params?.name;
        logger.info(`📝 prompts/get request received`, { promptName });

        if (!promptName) {
          return {
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32602,
              message: 'Invalid params: name is required'
            }
          };
        }

        const args = body.params?.arguments || {};

        // Query Customers Prompt
        if (promptName === 'query-customers') {
          const filter = args.filter || '';
          const top = args.top || '50';

          const prompt = `Please query Business Central customers${filter ? ` with filter: ${filter}` : ''}. Limit results to ${top} records.

Use the list_records tool with these parameters:
- resource: "customers"${filter ? `\n- filter: "${filter}"` : ''}
- top: ${top}

Return the customer details including name, email, phone number, and address.`;

          return {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              description: 'Query Business Central customers with optional filters',
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: prompt
                  }
                }
              ]
            }
          };
        }

        // Query Sales Orders Prompt
        if (promptName === 'query-sales-orders') {
          const customerNumber = args.customerNumber || '';
          const dateFilter = args.dateFilter || '';
          const top = args.top || '50';

          let filters = [];
          if (customerNumber) filters.push(`customerNumber eq '${customerNumber.replace(/'/g, "''")}'`);
          if (dateFilter) filters.push(dateFilter);
          const filterStr = filters.length > 0 ? filters.join(' and ') : '';

          const prompt = `Please query Business Central sales orders${filterStr ? ` with filter: ${filterStr}` : ''}. Limit results to ${top} records.

Use the list_records tool with these parameters:
- resource: "salesOrders"${filterStr ? `\n- filter: "${filterStr}"` : ''}
- top: ${top}

Return the sales order details including order number, customer, date, amount, and status.`;

          return {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              description: 'Query Business Central sales orders with optional filters',
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: prompt
                  }
                }
              ]
            }
          };
        }

        // Create Customer Prompt
        if (promptName === 'create-customer') {
          const displayName = args.displayName || '';
          const email = args.email || '';
          const phoneNumber = args.phoneNumber || '';
          const address = args.address || '';
          const city = args.city || '';

          if (!displayName) {
            return {
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32602,
                message: 'Invalid params: displayName is required'
              }
            };
          }

          const customerData: any = { displayName };
          if (email) customerData.email = email;
          if (phoneNumber) customerData.phoneNumber = phoneNumber;
          if (address) customerData.addressLine1 = address;
          if (city) customerData.city = city;

          const prompt = `Please create a new Business Central customer with the following details:
- Display Name: ${displayName}${email ? `\n- Email: ${email}` : ''}${phoneNumber ? `\n- Phone: ${phoneNumber}` : ''}${address ? `\n- Address: ${address}` : ''}${city ? `\n- City: ${city}` : ''}

Use the create_record tool with these parameters:
- resource: "customers"
- data: ${JSON.stringify(customerData, null, 2)}

Return the created customer's ID and all details.`;

          return {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              description: 'Create a new Business Central customer',
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: prompt
                  }
                }
              ]
            }
          };
        }

        // Explore Entities Prompt
        if (promptName === 'explore-entities') {
          const searchTerm = args.searchTerm || '';

          const prompt = `Please help me explore Business Central entities${searchTerm ? ` related to "${searchTerm}"` : ''}.

First, use the list_resources tool to get all available entity names.
${searchTerm ? `Then filter the results to show only entities containing "${searchTerm}".` : ''}

For any interesting entities, use the get_resource_schema tool to show:
- Available properties/fields
- Required vs optional fields
- Data types
- Any relationships

Present the information in a clear, organized way.`;

          return {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              description: 'Discover available Business Central entities and their schemas',
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: prompt
                  }
                }
              ]
            }
          };
        }

        // Switch Company Prompt
        if (promptName === 'switch-company') {
          const companyName = args.companyName || '';

          const prompt = `Please help me switch to ${companyName ? `the "${companyName}" company` : 'a different company'} in Business Central.

First, use the list_companies tool to show all available companies with their IDs and names.
${companyName ? `Then use the set_active_company tool to switch to the company named "${companyName}".` : 'Then ask me which company I want to switch to, and use set_active_company with the company ID.'}

Confirm the switch by using get_active_company to show the currently active company.`;

          return {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              description: 'Switch to a different Business Central company',
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: prompt
                  }
                }
              ]
            }
          };
        }

        // Unknown prompt
        return {
          jsonrpc: '2.0',
          id: body.id,
          error: {
            code: -32602,
            message: `Unknown prompt: ${promptName}`
          }
        };
      }

      // Unknown method
      return {
        jsonrpc: '2.0',
        id: body.id,
        error: {
          code: -32601,
          message: `Method not found: ${body.method}`
        }
      };

    } catch (error) {
      logger.error('Request processing failed', error instanceof Error ? error : undefined);
      return {
        jsonrpc: '2.0',
        id: body?.id || null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        }
      };
    }
  }

  /**
   * POST endpoint for client-to-server messages
   * Handles JSON-RPC requests, notifications, and responses per MCP spec
   * Supports both single requests and batch requests (arrays) per JSON-RPC 2.0
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const rawBody = req.body;

      // Handle batch requests (array) per JSON-RPC 2.0 spec
      if (Array.isArray(rawBody)) {
        logger.info(`Batch request with ${rawBody.length} items`);
        const responses: any[] = [];

        for (const body of rawBody) {
          if (!body || typeof body !== 'object') continue;

          const response = await handleSingleRequest(body);
          if (response !== null) { // null means notification, no response needed
            responses.push(response);
          }
        }

        // Per JSON-RPC spec: don't return empty array for all-notification batch
        if (responses.length === 0) {
          res.status(204).end();
        } else {
          res.json(responses);
        }
        return;
      }

      // Handle single request
      const body = rawBody;
      logger.info(`Single request: ${JSON.stringify(body)}`);

      const response = await handleSingleRequest(body);

      // null means notification, no response needed
      if (response === null) {
        res.status(204).end();
      } else {
        res.json(response);
      }

    } catch (error) {
      logger.error('Copilot Studio request failed', error instanceof Error ? error : undefined);
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        }
      });
    }
  });

  return router;
}
