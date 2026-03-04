/**
 * OpenAPI-compliant REST API routes for Power Platform Custom Connector
 */

import { Router, Request, Response } from 'express';
import { ToolExecutor } from '../tools/executor.js';
import { resolveBCConfig } from '../config.js';
import { OAuthAuth } from '../auth/oauth.js';
import { logger } from '../utils/logger.js';
import { openApiSpec } from './spec.js';

export function createOpenApiRoutes(): Router {
  const router = Router();
  const bcConfig = resolveBCConfig({});

  let oauthAuth: OAuthAuth | undefined;
  const clientId = process.env.BC_CLIENT_ID || process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.BC_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;

  if (clientId && clientSecret && bcConfig.tenantId) {
    try {
      oauthAuth = new OAuthAuth(bcConfig.tenantId, clientId, clientSecret);
      logger.info('OAuth initialized for OpenAPI routes');
    } catch (error) {
      logger.error('OAuth initialization failed', error instanceof Error ? error : undefined);
    }
  }

  // OpenAPI specification endpoint
  router.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });

  // Swagger UI redirect
  router.get('/docs', (_req: Request, res: Response) => {
    res.redirect('https://petstore.swagger.io/?url=' + encodeURIComponent(
      'https://mcp-bc-f940e489.salmonhill-7df6cca4.eastus.azurecontainerapps.io/api/openapi.json'
    ));
  });

  // Helper function to execute BC tools
  async function executeTool(toolName: string, params: any): Promise<any> {
    const accessToken = oauthAuth
      ? await oauthAuth.getAccessToken(bcConfig.tenantId)
      : process.env.BC_ACCESS_TOKEN || '';

    const executor = new ToolExecutor(bcConfig, accessToken);
    const result = await executor.execute({
      toolName,
      arguments: params
    });

    if (result.isError) {
      throw new Error(result.content[0].text);
    }

    return JSON.parse(result.content[0].text);
  }

  // GET /api/companies
  router.get('/companies', async (req: Request, res: Response) => {
    try {
      const params: any = {};

      if (req.query.$top) params.$top = parseInt(req.query.$top as string);
      if (req.query.$skip) params.$skip = parseInt(req.query.$skip as string);
      if (req.query.$filter) params.$filter = req.query.$filter;
      if (req.query.$select) params.$select = req.query.$select;

      const result = await executeTool('bc_v2_company_list', params);
      res.json(result);
    } catch (error) {
      logger.error('Error listing companies', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/customers
  router.get('/customers', async (req: Request, res: Response) => {
    try {
      const params: any = {};

      if (req.query.$top) params.$top = parseInt(req.query.$top as string);
      if (req.query.$skip) params.$skip = parseInt(req.query.$skip as string);
      if (req.query.$filter) params.$filter = req.query.$filter;
      if (req.query.$select) params.$select = req.query.$select;

      const result = await executeTool('bc_v2_customer_list', params);
      res.json(result);
    } catch (error) {
      logger.error('Error listing customers', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/items
  router.get('/items', async (req: Request, res: Response) => {
    try {
      const params: any = {};

      if (req.query.$top) params.$top = parseInt(req.query.$top as string);
      if (req.query.$skip) params.$skip = parseInt(req.query.$skip as string);
      if (req.query.$filter) params.$filter = req.query.$filter;
      if (req.query.$select) params.$select = req.query.$select;

      const result = await executeTool('bc_v2_item_list', params);
      res.json(result);
    } catch (error) {
      logger.error('Error listing items', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/salesInvoices
  router.get('/salesInvoices', async (req: Request, res: Response) => {
    try {
      const params: any = {};

      if (req.query.$top) params.$top = parseInt(req.query.$top as string);
      if (req.query.$skip) params.$skip = parseInt(req.query.$skip as string);
      if (req.query.$filter) params.$filter = req.query.$filter;
      if (req.query.$select) params.$select = req.query.$select;

      const result = await executeTool('bc_v2_salesInvoice_list', params);
      res.json(result);
    } catch (error) {
      logger.error('Error listing sales invoices', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/vendors
  router.get('/vendors', async (req: Request, res: Response) => {
    try {
      const params: any = {};

      if (req.query.$top) params.$top = parseInt(req.query.$top as string);
      if (req.query.$skip) params.$skip = parseInt(req.query.$skip as string);
      if (req.query.$filter) params.$filter = req.query.$filter;
      if (req.query.$select) params.$select = req.query.$select;

      const result = await executeTool('bc_v2_vendor_list', params);
      res.json(result);
    } catch (error) {
      logger.error('Error listing vendors', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}
