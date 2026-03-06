/**
 * OpenAPI/Swagger specification for Business Central MCP Server
 * For Power Platform Custom Connector integration
 */

import { VERSION } from '../version.js';

function getServerUrl(): string {
  const envUrl = process.env.SERVER_URL;
  if (!envUrl) return 'http://localhost:3005';
  try {
    const parsed = new URL(envUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return envUrl;
    }
  } catch { /* invalid URL */ }
  return 'http://localhost:3005';
}

export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Business Central API',
    version: VERSION,
    description: 'Microsoft Dynamics 365 Business Central integration API for accessing companies, customers, items, sales, inventory, and financial data',
    contact: {
      name: 'API Support',
      email: 'support@example.com'
    }
  },
  servers: [
    {
      url: getServerUrl(),
      description: 'API server'
    }
  ],
  security: [
    {
      BearerAuth: []
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your API key with Bearer prefix (e.g., Bearer xK8mP4nL9qR2vB5wE7tY1aS3dF6gH0jK9mN2pQ5rT8uV)'
      }
    },
    schemas: {
      Company: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          displayName: { type: 'string' },
          systemCreatedAt: { type: 'string', format: 'date-time' },
          systemModifiedAt: { type: 'string', format: 'date-time' }
        }
      },
      Customer: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          number: { type: 'string' },
          displayName: { type: 'string' },
          type: { type: 'string', enum: ['Company', 'Person'] },
          email: { type: 'string', format: 'email' },
          phoneNumber: { type: 'string' },
          balance: { type: 'number', format: 'double' }
        }
      },
      Item: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          number: { type: 'string' },
          displayName: { type: 'string' },
          type: { type: 'string', enum: ['Inventory', 'Service', 'Non-Inventory'] },
          inventory: { type: 'number', format: 'double' },
          unitPrice: { type: 'number', format: 'double' },
          unitCost: { type: 'number', format: 'double' }
        }
      },
      SalesInvoice: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          number: { type: 'string' },
          customerNumber: { type: 'string' },
          customerName: { type: 'string' },
          invoiceDate: { type: 'string', format: 'date' },
          dueDate: { type: 'string', format: 'date' },
          totalAmountIncludingTax: { type: 'number', format: 'double' },
          status: { type: 'string', enum: ['Draft', 'In Review', 'Open', 'Paid', 'Canceled', 'Corrective'] }
        }
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          code: { type: 'string' }
        }
      }
    }
  },
  paths: {
    '/api/companies': {
      get: {
        summary: 'List companies',
        description: 'Get a list of all Business Central companies',
        operationId: 'listCompanies',
        tags: ['Companies'],
        parameters: [
          {
            name: '$top',
            in: 'query',
            description: 'Maximum number of records to return',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
          },
          {
            name: '$skip',
            in: 'query',
            description: 'Number of records to skip for pagination',
            schema: { type: 'integer', minimum: 0, default: 0 }
          },
          {
            name: '$filter',
            in: 'query',
            description: 'OData filter expression (e.g., displayName eq \'Cronus\')',
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    value: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Company' }
                    },
                    '@odata.count': { type: 'integer' }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/api/customers': {
      get: {
        summary: 'List customers',
        description: 'Get a list of customers with their balances',
        operationId: 'listCustomers',
        tags: ['Customers'],
        parameters: [
          {
            name: '$top',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
          },
          {
            name: '$skip',
            in: 'query',
            schema: { type: 'integer', minimum: 0, default: 0 }
          },
          {
            name: '$filter',
            in: 'query',
            description: 'Filter expression (e.g., balance gt 1000)',
            schema: { type: 'string' }
          },
          {
            name: '$select',
            in: 'query',
            description: 'Comma-separated field names (e.g., number,displayName,balance)',
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    value: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Customer' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/items': {
      get: {
        summary: 'List items',
        description: 'Get a list of items/products with inventory levels',
        operationId: 'listItems',
        tags: ['Items'],
        parameters: [
          {
            name: '$top',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
          },
          {
            name: '$skip',
            in: 'query',
            schema: { type: 'integer', minimum: 0, default: 0 }
          },
          {
            name: '$filter',
            in: 'query',
            description: 'Filter expression (e.g., inventory lt 10)',
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    value: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Item' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/salesInvoices': {
      get: {
        summary: 'List sales invoices',
        description: 'Get a list of sales invoices',
        operationId: 'listSalesInvoices',
        tags: ['Sales'],
        parameters: [
          {
            name: '$top',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
          },
          {
            name: '$filter',
            in: 'query',
            description: 'Filter expression (e.g., status eq \'Open\')',
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    value: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SalesInvoice' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  tags: [
    { name: 'Companies', description: 'Company management operations' },
    { name: 'Customers', description: 'Customer data and balances' },
    { name: 'Items', description: 'Product/item inventory management' },
    { name: 'Sales', description: 'Sales invoices and orders' }
  ]
};
