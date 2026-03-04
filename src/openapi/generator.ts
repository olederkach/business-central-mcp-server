/**
 * Dynamic OpenAPI specification generator from Business Central metadata
 * Aligns with the MCP tools generation paradigm
 */

import { EntityMetadata, PropertyMetadata } from '../bc/metadata.js';
import { VERSION } from '../version.js';

export class OpenApiGenerator {
  /**
   * Generate OpenAPI specification from BC entity definitions
   */
  generateSpec(entities: EntityMetadata[], baseUrl: string): any {
    const paths: any = {};
    const schemas: any = {};

    // Generate paths and schemas for each entity
    for (const entity of entities) {
      const entityName = entity.name;
      const entitySetName = entity.entitySetName;
      const pathName = `/${entitySetName}`;

      // Generate schema for this entity
      schemas[entityName] = this.generateSchema(entity);

      // Generate LIST endpoint
      paths[pathName] = {
        get: {
          summary: `List ${entitySetName}`,
          description: `Get a list of ${entitySetName} from Business Central`,
          operationId: `list_${entitySetName}`,
          tags: [this.getTagForEntity(entityName)],
          parameters: this.generateListParameters(entity),
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
                        items: { $ref: `#/components/schemas/${entityName}` }
                      },
                      '@odata.count': { type: 'integer' },
                      '@odata.nextLink': { type: 'string' }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '500': { $ref: '#/components/responses/InternalError' }
          }
        }
      };

      // Generate GET by ID endpoint
      const idProperty = this.getIdProperty(entity);
      if (idProperty) {
        paths[`${pathName}/{id}`] = {
          get: {
            summary: `Get ${entityName}`,
            description: `Get a specific ${entityName} by ${idProperty.name}`,
            operationId: `get_${entityName}`,
            tags: [this.getTagForEntity(entityName)],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                description: `The ${idProperty.name} of the ${entityName}`,
                schema: { type: 'string' }
              },
              {
                name: '$select',
                in: 'query',
                description: 'Comma-separated list of properties to return',
                schema: { type: 'string' }
              },
              {
                name: '$expand',
                in: 'query',
                description: 'Comma-separated list of related entities to expand',
                schema: { type: 'string' }
              }
            ],
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { $ref: `#/components/schemas/${entityName}` }
                  }
                }
              },
              '404': { $ref: '#/components/responses/NotFound' },
              '401': { $ref: '#/components/responses/Unauthorized' }
            }
          }
        };

        // Generate CREATE endpoint if supported
        if (entity.operations.includes('create')) {
          paths[pathName].post = {
            summary: `Create ${entityName}`,
            description: `Create a new ${entityName} in Business Central`,
            operationId: `create_${entityName}`,
            tags: [this.getTagForEntity(entityName)],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/${entityName}` }
                }
              }
            },
            responses: {
              '201': {
                description: 'Created',
                content: {
                  'application/json': {
                    schema: { $ref: `#/components/schemas/${entityName}` }
                  }
                }
              },
              '400': { $ref: '#/components/responses/BadRequest' },
              '401': { $ref: '#/components/responses/Unauthorized' }
            }
          };
        }

        // Generate UPDATE endpoint if supported
        if (entity.operations.includes('update')) {
          paths[`${pathName}/{id}`].patch = {
            summary: `Update ${entityName}`,
            description: `Update an existing ${entityName}`,
            operationId: `update_${entityName}`,
            tags: [this.getTagForEntity(entityName)],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              },
              {
                name: 'If-Match',
                in: 'header',
                description: 'ETag for optimistic concurrency control',
                schema: { type: 'string' }
              }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/${entityName}` }
                }
              }
            },
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { $ref: `#/components/schemas/${entityName}` }
                  }
                }
              },
              '404': { $ref: '#/components/responses/NotFound' },
              '412': { $ref: '#/components/responses/PreconditionFailed' }
            }
          };
        }

        // DELETE endpoint removed to reduce operation count for Power Platform (256 operation limit)
        // The DELETE endpoint can still be used via the /api routes but is not exposed in OpenAPI spec
        // if (entity.operations.includes('delete')) {
        //   paths[`${pathName}/{id}`].delete = {
        //     summary: `Delete ${entityName}`,
        //     description: `Delete a ${entityName} from Business Central`,
        //     operationId: `delete_${entityName}`,
        //     tags: [this.getTagForEntity(entityName)],
        //     parameters: [
        //       {
        //         name: 'id',
        //         in: 'path',
        //         required: true,
        //         schema: { type: 'string' }
        //       },
        //       {
        //         name: 'If-Match',
        //         in: 'header',
        //         description: 'ETag for optimistic concurrency control',
        //         schema: { type: 'string' }
        //       }
        //     ],
        //     responses: {
        //       '204': { description: 'No Content - Successfully deleted' },
        //       '404': { $ref: '#/components/responses/NotFound' },
        //       '412': { $ref: '#/components/responses/PreconditionFailed' }
        //     }
        //   };
        // }
      }
    }

    // Generate the complete OpenAPI spec
    return {
      openapi: '3.0.0',
      info: {
        title: 'Business Central API',
        version: VERSION,
        description: 'Microsoft Dynamics 365 Business Central integration API - dynamically generated from BC metadata',
        contact: {
          name: 'API Support'
        }
      },
      servers: [
        {
          url: baseUrl,
          description: 'Business Central MCP Server'
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
            description: 'Enter your API key with Bearer prefix'
          }
        },
        schemas: {
          ...schemas,
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
              code: { type: 'string' }
            }
          }
        },
        responses: {
          Unauthorized: {
            description: 'Unauthorized - Invalid or missing authentication',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          NotFound: {
            description: 'Not Found - Resource does not exist',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          BadRequest: {
            description: 'Bad Request - Invalid input',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          InternalError: {
            description: 'Internal Server Error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          PreconditionFailed: {
            description: 'Precondition Failed - ETag mismatch',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      },
      paths,
      tags: this.generateTags(entities)
    };
  }

  private generateSchema(entity: EntityMetadata): any {
    const properties: any = {};
    const required: string[] = [];

    for (const prop of entity.properties) {
      properties[prop.name] = this.mapPropertyToJsonSchema(prop);

      if (!prop.nullable) {
        required.push(prop.name);
      }
    }

    const schema: any = {
      type: 'object',
      properties,
      description: `${entity.name} entity from Business Central`
    };

    if (required.length > 0) {
      schema.required = required;
    }

    return schema;
  }

  private mapPropertyToJsonSchema(prop: PropertyMetadata): any {
    const schema: any = {
      description: prop.name
    };

    // Map EDM types to JSON Schema types
    switch (prop.type) {
      case 'Edm.String':
        schema.type = 'string';
        if (prop.maxLength) {
          schema.maxLength = prop.maxLength;
        }
        break;
      case 'Edm.Int32':
      case 'Edm.Int64':
        schema.type = 'integer';
        break;
      case 'Edm.Decimal':
      case 'Edm.Double':
        schema.type = 'number';
        schema.format = 'double';
        break;
      case 'Edm.Boolean':
        schema.type = 'boolean';
        break;
      case 'Edm.DateTimeOffset':
      case 'Edm.Date':
        schema.type = 'string';
        schema.format = 'date-time';
        break;
      case 'Edm.Guid':
        schema.type = 'string';
        schema.format = 'uuid';
        break;
      default:
        schema.type = 'string';
    }

    if (prop.nullable) {
      schema.nullable = true;
    }

    return schema;
  }

  private generateListParameters(entity: EntityMetadata): any[] {
    const filterableFields = entity.properties
      .filter(p => !p.type.startsWith('Collection'))
      .map(p => p.name)
      .join(', ');

    const selectableFields = entity.properties.map(p => p.name).join(', ');

    return [
      {
        name: '$top',
        in: 'query',
        description: 'Maximum number of records to return (1-1000)',
        schema: { type: 'integer', minimum: 1, maximum: 1000, default: 20 }
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
        description: `OData filter expression. Available fields: ${filterableFields}`,
        schema: { type: 'string' }
      },
      {
        name: '$orderby',
        in: 'query',
        description: 'OData order by expression (e.g., "name asc")',
        schema: { type: 'string' }
      },
      {
        name: '$select',
        in: 'query',
        description: `Comma-separated field names. Available: ${selectableFields}`,
        schema: { type: 'string' }
      },
      {
        name: '$expand',
        in: 'query',
        description: 'Comma-separated related entities to expand',
        schema: { type: 'string' }
      }
    ];
  }

  private getIdProperty(entity: EntityMetadata): PropertyMetadata | undefined {
    // Look for common ID property names
    return entity.properties.find(p =>
      p.name === 'id' ||
      p.name === 'Id' ||
      p.name === `${entity.name}Id` ||
      p.name === 'number' ||
      p.name === 'code'
    );
  }

  private getTagForEntity(entityName: string): string {
    // Categorize entities by common prefixes/patterns
    const lowerName = entityName.toLowerCase();

    if (lowerName.includes('customer')) return 'Customers';
    if (lowerName.includes('vendor') || lowerName.includes('supplier')) return 'Vendors';
    if (lowerName.includes('item') || lowerName.includes('product')) return 'Items';
    if (lowerName.includes('sales') || lowerName.includes('invoice')) return 'Sales';
    if (lowerName.includes('purchase')) return 'Purchasing';
    if (lowerName.includes('company')) return 'Companies';
    if (lowerName.includes('ledger') || lowerName.includes('account')) return 'Finance';
    if (lowerName.includes('dimension')) return 'Dimensions';

    return 'General';
  }

  private generateTags(entities: EntityMetadata[]): any[] {
    const tagSet = new Set<string>();

    for (const entity of entities) {
      tagSet.add(this.getTagForEntity(entity.name));
    }

    return Array.from(tagSet).map(tag => ({
      name: tag,
      description: `${tag} related operations`
    }));
  }
}
