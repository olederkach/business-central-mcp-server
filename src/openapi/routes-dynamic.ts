/**
 * Dynamic OpenAPI-compliant REST API routes for Power Platform Custom Connector
 * Automatically generates endpoints from Business Central metadata
 */

import { Router, Request, Response } from 'express';
import { ToolExecutor } from '../tools/executor.js';
import { ToolGenerator } from '../tools/generator.js';
import { resolveBCConfig } from '../config.js';
import { OAuthAuth } from '../auth/oauth.js';
import { logger } from '../utils/logger.js';
import { MetadataParser } from '../bc/metadata.js';
import { OpenApiGenerator } from './generator.js';

export function createDynamicOpenApiRoutes(): Router {
  const router = Router();
  const bcConfig = resolveBCConfig({});

  let oauthAuth: OAuthAuth | undefined;
  const clientId = process.env.BC_CLIENT_ID || process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.BC_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;

  if (clientId && clientSecret && bcConfig.tenantId) {
    try {
      oauthAuth = new OAuthAuth(bcConfig.tenantId, clientId, clientSecret);
      logger.info('OAuth initialized for Dynamic OpenAPI routes');
    } catch (error) {
      logger.error('OAuth initialization failed', error instanceof Error ? error : undefined);
    }
  }

  // Cache for OpenAPI spec and tool mapping
  let cachedSpec: any = null;
  let cachedToolMap: Map<string, string> = new Map(); // entitySetName -> base tool name
  let cachedTools: Map<string, any> = new Map(); // full tool name -> tool object
  let cacheInitialized = false;

  // Get base URL from request or environment
  function getBaseUrl(req?: Request): string {
    if (process.env.OPENAPI_BASE_URL) {
      return process.env.OPENAPI_BASE_URL;
    }

    if (req) {
      const protocol = req.protocol;
      const host = req.get('host');
      return `${protocol}://${host}/api`;
    }

    // Fallback - should be set in environment
    return 'https://localhost:3005/api';
  }

  // Initialize cache on first use
  async function ensureCache(baseUrl: string): Promise<void> {
    if (cacheInitialized) return;

    const accessToken = oauthAuth
      ? await oauthAuth.getAccessToken(bcConfig.tenantId)
      : process.env.BC_ACCESS_TOKEN || '';

    const metadataParser = new MetadataParser(
      bcConfig,
      accessToken,
      (process.env.METADATA_MODE as any) || 'all'
    );
    const entities = await metadataParser.parse();

    // Generate tool map for routing
    const toolGenerator = new ToolGenerator(bcConfig);
    const tools = toolGenerator.generateTools(entities);

    cachedToolMap.clear();
    cachedTools.clear();
    for (const tool of tools) {
      const entitySetName = tool.annotations?.entitySetName;
      if (entitySetName) {
        // Map entitySetName to base tool name (without operation suffix)
        // e.g., "companies" -> "bc_v2_company"
        const baseName = tool.name.replace(/_list$|_get$|_create$|_update$|_delete$/, '');
        if (!cachedToolMap.has(entitySetName)) {
          cachedToolMap.set(entitySetName, baseName);
        }
      }
      // Cache full tool object by name
      cachedTools.set(tool.name, tool);
    }

    // Generate OpenAPI spec
    const generator = new OpenApiGenerator();
    cachedSpec = generator.generateSpec(entities, baseUrl);

    cacheInitialized = true;
  }

  // OpenAPI specification endpoint - dynamically generated
  router.get('/openapi.json', async (req: Request, res: Response) => {
    try {
      const baseUrl = getBaseUrl(req);
      await ensureCache(baseUrl);
      res.json(cachedSpec);
    } catch (error) {
      logger.error('Error generating OpenAPI spec', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Failed to generate OpenAPI specification',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Swagger UI redirect
  router.get('/docs', (req: Request, res: Response) => {
    const protocol = req.protocol;
    const host = req.get('host');
    const specUrl = `${protocol}://${host}/api/openapi.json`;
    res.redirect('https://petstore.swagger.io/?url=' + encodeURIComponent(specUrl));
  });

  // Generic LIST endpoint - GET /:entitySetName
  router.get('/:entitySetName', async (req: Request, res: Response) => {
    try {
      const baseUrl = getBaseUrl(req);
      await ensureCache(baseUrl);
      const entitySetName = req.params.entitySetName;

      // Map entitySetName to base tool name and append operation
      const baseName = cachedToolMap.get(entitySetName);
      if (!baseName) {
        res.status(404).json({
          error: 'Not Found',
          message: `No entity set found for: ${entitySetName}`
        });
        return;
      }

      const toolName = `${baseName}_list`;

      const params: any = {};
      if (req.query.$top) params.$top = parseInt(req.query.$top as string);
      if (req.query.$skip) params.$skip = parseInt(req.query.$skip as string);
      if (req.query.$filter) params.$filter = req.query.$filter;
      if (req.query.$orderby) params.$orderby = req.query.$orderby;
      if (req.query.$select) params.$select = req.query.$select;
      if (req.query.$expand) params.$expand = req.query.$expand;

      const result = await executeTool(toolName, params);
      res.json(result);
    } catch (error) {
      logger.error(`Error listing ${req.params.entitySetName}`, error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Generic GET by ID endpoint - GET /:entitySetName/:id
  router.get('/:entitySetName/:id', async (req: Request, res: Response) => {
    try {
      const baseUrl = getBaseUrl(req);
      await ensureCache(baseUrl);
      const entitySetName = req.params.entitySetName;

      const baseName = cachedToolMap.get(entitySetName);
      if (!baseName) {
        res.status(404).json({
          error: 'Not Found',
          message: `No entity set found for: ${entitySetName}`
        });
        return;
      }

      const toolName = `${baseName}_get`;

      const params: any = { id: req.params.id };
      if (req.query.$select) params.$select = req.query.$select;
      if (req.query.$expand) params.$expand = req.query.$expand;

      const result = await executeTool(toolName, params);
      res.json(result);
    } catch (error) {
      logger.error(`Error getting ${req.params.entitySetName}/${req.params.id}`, error instanceof Error ? error : undefined);
      const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Generic CREATE endpoint - POST /:entitySetName
  router.post('/:entitySetName', async (req: Request, res: Response) => {
    try {
      const baseUrl = getBaseUrl(req);
      await ensureCache(baseUrl);
      const entitySetName = req.params.entitySetName;

      const baseName = cachedToolMap.get(entitySetName);
      if (!baseName) {
        res.status(404).json({
          error: 'Not Found',
          message: `No entity set found for: ${entitySetName}`
        });
        return;
      }

      const toolName = `${baseName}_create`;

      const result = await executeTool(toolName, req.body);
      res.status(201).json(result);
    } catch (error) {
      logger.error(`Error creating ${req.params.entitySetName}`, error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Generic UPDATE endpoint - PATCH /:entitySetName/:id
  router.patch('/:entitySetName/:id', async (req: Request, res: Response) => {
    try {
      const baseUrl = getBaseUrl(req);
      await ensureCache(baseUrl);
      const entitySetName = req.params.entitySetName;

      const baseName = cachedToolMap.get(entitySetName);
      if (!baseName) {
        res.status(404).json({
          error: 'Not Found',
          message: `No entity set found for: ${entitySetName}`
        });
        return;
      }

      const toolName = `${baseName}_update`;

      const params = {
        ...req.body,
        id: req.params.id,
        etag: req.headers['if-match'] as string
      };

      const result = await executeTool(toolName, params);
      res.json(result);
    } catch (error) {
      logger.error(`Error updating ${req.params.entitySetName}/${req.params.id}`, error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Generic DELETE endpoint - DELETE /:entitySetName/:id
  router.delete('/:entitySetName/:id', async (req: Request, res: Response) => {
    try {
      const baseUrl = getBaseUrl(req);
      await ensureCache(baseUrl);
      const entitySetName = req.params.entitySetName;

      const baseName = cachedToolMap.get(entitySetName);
      if (!baseName) {
        res.status(404).json({
          error: 'Not Found',
          message: `No entity set found for: ${entitySetName}`
        });
        return;
      }

      const toolName = `${baseName}_delete`;

      const params = {
        id: req.params.id,
        etag: req.headers['if-match'] as string
      };

      await executeTool(toolName, params);
      res.status(204).send();
    } catch (error) {
      logger.error(`Error deleting ${req.params.entitySetName}/${req.params.id}`, error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Helper function to execute BC tools
  async function executeTool(toolName: string, params: any): Promise<any> {
    const accessToken = oauthAuth
      ? await oauthAuth.getAccessToken(bcConfig.tenantId)
      : process.env.BC_ACCESS_TOKEN || '';

    const tool = cachedTools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const executor = new ToolExecutor(bcConfig, accessToken);
    const result = await executor.execute({
      toolName,
      arguments: params,
      tool
    });

    if (result.isError) {
      throw new Error(result.content[0].text);
    }

    return JSON.parse(result.content[0].text);
  }

  return router;
}

/**
 * Create a public OpenAPI spec handler (no auth required)
 * For use with Power Platform Custom Connector import
 */
export function createPublicOpenApiSpecHandler() {
  const bcConfig = resolveBCConfig({});

  let oauthAuth: OAuthAuth | undefined;
  const clientId = process.env.BC_CLIENT_ID || process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.BC_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;

  if (clientId && clientSecret && bcConfig.tenantId) {
    try {
      oauthAuth = new OAuthAuth(bcConfig.tenantId, clientId, clientSecret);
    } catch (error) {
      logger.error('OAuth initialization failed for public spec handler', error instanceof Error ? error : undefined);
    }
  }

  let cachedSpec: any = null;
  let cacheInitialized: string | null = null;

  // Get base URL from request or environment
  function getBaseUrl(req?: Request): string {
    if (process.env.OPENAPI_BASE_URL) {
      return process.env.OPENAPI_BASE_URL;
    }

    if (req) {
      const protocol = req.protocol;
      const host = req.get('host');
      return `${protocol}://${host}/api`;
    }

    return 'https://localhost:3005/api';
  }

  // Core Business Central entities (most commonly used)
  const coreEntities = [
    'companies',
    'customers',
    'vendors',
    'items',
    'salesOrders',
    'salesOrderLines',
    'purchaseOrders',
    'purchaseOrderLines',
    'salesInvoices',
    'salesInvoiceLines',
    'purchaseInvoices',
    'purchaseInvoiceLines',
    'generalLedgerEntries',
    'accounts',
    'employees',
    'dimensions',
    'dimensionValues',
    'itemCategories',
    'taxGroups',
    'paymentTerms',
    'shipmentMethods',
    'currencies',
    'countriesRegions',
    'unitsOfMeasure',
    'customerPayments',
    'vendorPayments',
    'salesQuotes',
    'salesCreditMemos',
    'purchaseCreditMemos'
  ];

  async function generateSpec(baseUrl: string, entityFilter?: string[]): Promise<any> {
    const accessToken = oauthAuth
      ? await oauthAuth.getAccessToken(bcConfig.tenantId)
      : process.env.BC_ACCESS_TOKEN || '';

    const metadataParser = new MetadataParser(
      bcConfig,
      accessToken,
      (process.env.METADATA_MODE as any) || 'all'
    );
    const allEntities = await metadataParser.parse();

    // Filter entities if requested
    let entities = allEntities;
    if (entityFilter && entityFilter.length > 0) {
      entities = allEntities.filter(e =>
        entityFilter.some(filter =>
          e.name.toLowerCase().includes(filter.toLowerCase()) ||
          e.entitySetName.toLowerCase().includes(filter.toLowerCase())
        )
      );
    }

    const generator = new OpenApiGenerator();
    return generator.generateSpec(entities, baseUrl);
  }

  return async (req: Request, res: Response) => {
    try {
      const baseUrl = getBaseUrl(req);

      // Support filtering via query parameter: ?mode=core or ?entities=customer,item,salesOrder
      const mode = req.query.mode as string;
      const entitiesParam = req.query.entities as string;

      let entityFilter: string[] | undefined;

      if (mode === 'core') {
        // Use predefined core entities list
        entityFilter = coreEntities;
      } else if (entitiesParam) {
        // Use custom entity filter from query param
        entityFilter = entitiesParam.split(',').map(e => e.trim()).filter(Boolean);
      }

      // Cache based on filter mode
      const cacheKey = mode || entitiesParam || 'full';
      if (!cachedSpec || cacheInitialized !== cacheKey) {
        cachedSpec = await generateSpec(baseUrl, entityFilter);
        cacheInitialized = cacheKey;
      }

      // Add helpful comment in response
      const spec = { ...cachedSpec };
      const pathCount = Object.keys(spec.paths || {}).length;
      const opCount = Object.values(spec.paths || {}).reduce((sum: number, methods: any) => sum + Object.keys(methods).length, 0);

      spec.info = {
        ...spec.info,
        'x-filter-info': {
          mode: mode || (entitiesParam ? 'custom' : 'full'),
          totalPaths: pathCount,
          totalOperations: opCount,
          powerPlatformLimit: 256,
          withinLimit: opCount <= 256,
          usage: mode === 'core' ? 'Core Business Central entities only' : entitiesParam ? `Filtered: ${entitiesParam}` : 'All available entities'
        }
      };

      res.json(spec);
    } catch (error) {
      logger.error('Error generating public OpenAPI spec', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Failed to generate OpenAPI specification',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}
