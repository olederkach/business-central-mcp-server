/**
 * Dynamic Tool Generator
 * Generates MCP tools from Business Central metadata
 */

import { EntityMetadata } from '../bc/metadata.js';
import { BCConfig } from '../bc/config.js';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  // MCP 2025-03-26: Tool annotations for better UX
  annotations?: {
    entitySetName?: string;        // For dynamic tools only
    readOnly?: boolean;             // Tool only reads data, no modifications
    destructive?: boolean;          // Tool modifies or deletes data (warns user)
  };
}

export interface ToolMetadata {
  entityName: string;
  operation: string;
  category: string;
}

export class ToolGenerator {
  private bcConfig: BCConfig;

  constructor(bcConfig: BCConfig) {
    this.bcConfig = bcConfig;
  }

  generateTools(entities: EntityMetadata[]): MCPTool[] {
    const tools: MCPTool[] = [];
    const allowedOperations = ['list', 'create', 'update'];

    for (const entity of entities) {
      for (const operation of entity.operations) {
        // Only include list, create, and update operations
        if (!allowedOperations.includes(operation)) {
          continue;
        }

        const tool = this.generateTool(entity, operation);
        if (tool) {
          tools.push(tool);
        }
      }
    }

    return tools;
  }

  private generateTool(entity: EntityMetadata, operation: string): MCPTool | null {
    const toolName = this.buildToolName(entity.name, operation);
    
    switch (operation) {
      case 'list':
        return this.generateListTool(toolName, entity);
      case 'get':
        return this.generateGetTool(toolName, entity);
      case 'create':
        return this.generateCreateTool(toolName, entity);
      case 'update':
        return this.generateUpdateTool(toolName, entity);
      case 'delete':
        return this.generateDeleteTool(toolName, entity);
      default:
        return null;
    }
  }

  private buildToolName(entityName: string, operation: string): string {
    const prefix = this.bcConfig.apiType === 'standard' ? 'bc_v2' : 
                   `bc_ext_${this.bcConfig.apiPublisher}_${this.bcConfig.apiGroup}`;
    
    const normalizedName = entityName.charAt(0).toLowerCase() + entityName.slice(1);
    return `${prefix}_${normalizedName}_${operation}`;
  }

  private generateListTool(name: string, entity: EntityMetadata): MCPTool {
    return {
      name,
      description: `List ${entity.name} records from Business Central with filtering and pagination`,
      inputSchema: {
        type: 'object',
        properties: {
          top: {
            type: 'number',
            description: 'Maximum number of records to return (1-1000)',
            minimum: 1,
            maximum: 1000,
            default: 20
          },
          skip: {
            type: 'number',
            description: 'Number of records to skip for pagination',
            minimum: 0,
            default: 0
          },
          filter: {
            type: 'string',
            description: `OData filter expression. Available fields: ${this.getFilterableFields(entity)}`
          },
          orderby: {
            type: 'string',
            description: `OData order by expression. Examples: "${entity.properties[0]?.name} asc"`
          },
          select: {
            type: 'string',
            description: `Comma-separated field names. Available: ${entity.properties.map(p => p.name).join(', ')}`
          },
          expand: {
            type: 'string',
            description: entity.navigationProperties.length > 0 ?
              `Related entities to expand: ${entity.navigationProperties.map(n => n.name).join(', ')}` :
              undefined
          }
        }
      },
      annotations: {
        entitySetName: entity.entitySetName
      }
    };
  }

  private generateGetTool(name: string, entity: EntityMetadata): MCPTool {
    const keyField = entity.key[0] || 'id';

    return {
      name,
      description: `Get a specific ${entity.name} record by ${keyField}`,
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: `${entity.name} ${keyField} (unique identifier)`
          },
          select: {
            type: 'string',
            description: 'Comma-separated field names to retrieve'
          },
          expand: {
            type: 'string',
            description: entity.navigationProperties.length > 0 ?
              `Related entities: ${entity.navigationProperties.map(n => n.name).join(', ')}` :
              undefined
          }
        },
        required: ['id']
      },
      annotations: {
        entitySetName: entity.entitySetName
      }
    };
  }

  private generateCreateTool(name: string, entity: EntityMetadata): MCPTool {
    const requiredFields = entity.properties.filter(p => !p.nullable && !p.isKey);
    const schema = this.buildEntitySchema(entity, requiredFields.map(f => f.name));

    return {
      name,
      description: `Create a new ${entity.name} record in Business Central`,
      inputSchema: schema,
      annotations: {
        entitySetName: entity.entitySetName
      }
    };
  }

  private generateUpdateTool(name: string, entity: EntityMetadata): MCPTool {
    const keyField = entity.key[0] || 'id';
    const schema = this.buildEntitySchema(entity, []);

    schema.properties.id = {
      type: 'string',
      description: `${entity.name} ${keyField} to update`
    };
    schema.properties.etag = {
      type: 'string',
      description: 'ETag for concurrency control (from @odata.etag)'
    };

    schema.required = ['id'];

    return {
      name,
      description: `Update an existing ${entity.name} record`,
      inputSchema: schema,
      annotations: {
        entitySetName: entity.entitySetName
      }
    };
  }

  private generateDeleteTool(name: string, entity: EntityMetadata): MCPTool {
    const keyField = entity.key[0] || 'id';

    return {
      name,
      description: `Delete a ${entity.name} record from Business Central`,
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: `${entity.name} ${keyField} to delete`
          },
          etag: {
            type: 'string',
            description: 'ETag for concurrency control (from @odata.etag)'
          }
        },
        required: ['id']
      },
      annotations: {
        entitySetName: entity.entitySetName
      }
    };
  }

  private buildEntitySchema(entity: EntityMetadata, requiredFields: string[]): any {
    const properties: Record<string, any> = {};

    for (const prop of entity.properties) {
      if (prop.isKey) continue;

      properties[prop.name] = {
        type: prop.type,
        description: `${prop.name} (${prop.nullable ? 'optional' : 'required'})`
      };

      if (prop.maxLength) {
        properties[prop.name].maxLength = parseInt(prop.maxLength);
      }
    }

    return {
      type: 'object',
      properties,
      required: requiredFields.length > 0 ? requiredFields : undefined
    };
  }

  private getFilterableFields(entity: EntityMetadata): string {
    const fields = entity.properties
      .filter(p => ['string', 'integer', 'number', 'boolean'].includes(p.type))
      .map(p => p.name)
      .slice(0, 5);
    
    return fields.join(', ');
  }
}
