/**
 * Tool Executor
 * Executes MCP tools by calling Business Central APIs
 */

import { BCApiClient } from '../bc/client.js';
import { BCConfig } from '../bc/config.js';
import { MCPTool } from './generator.js';
import { trackToolExecution } from '../monitoring/app-insights.js';
import { ErrorBuilder } from '../errors/error-codes.js';
import { logger } from '../utils/logger.js';
import { ODataValidator } from '../utils/odata-validator.js';

export interface ToolExecution {
  toolName: string;
  arguments: Record<string, any>;
  tool?: MCPTool;
}

export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
  metadata?: {
    count?: number;
    hasMore?: boolean;
    suggestion?: string;
  };
}

export class ToolExecutor {
  private bcClient: BCApiClient;
  private accessToken?: string;
  private bcConfig: BCConfig;

  constructor(bcConfig: BCConfig, accessToken?: string) {
    this.bcConfig = bcConfig;
    this.bcClient = new BCApiClient(bcConfig);
    this.accessToken = accessToken;
  }

  async execute(execution: ToolExecution): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Get entitySetName from tool annotations or derive from tool name
      let entitySetName = execution.tool?.annotations?.entitySetName;
      const { operation } = this.parseToolName(execution.toolName);

      // Fallback: derive entity name from tool name if annotations not available
      // bc_v2_company_list -> companies
      // bc_v2_customer_create -> customers
      if (!entitySetName) {
        const parts = execution.toolName.split('_');
        // Remove prefix (bc_v2 or bc_ext_*) and operation suffix
        const entityPart = parts.slice(2, -1).join('_');

        // Common pluralization rules for Business Central entities
        entitySetName = this.pluralizeEntity(entityPart);
        logger.info(`Derived entitySetName: ${entitySetName} from tool: ${execution.toolName}`);
      }

      let result: any;

      switch (operation) {
        case 'list':
          result = await this.executeList(entitySetName, execution.arguments);
          break;
        case 'get':
          result = await this.executeGet(entitySetName, execution.arguments);
          break;
        case 'create':
          result = await this.executeCreate(entitySetName, execution.arguments);
          break;
        case 'update':
          result = await this.executeUpdate(entitySetName, execution.arguments);
          break;
        case 'delete':
          result = await this.executeDelete(entitySetName, execution.arguments);
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      // Track successful tool execution
      trackToolExecution(execution.toolName, Date.now() - startTime, true, this.bcConfig.tenantId);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      // Track failed tool execution
      trackToolExecution(execution.toolName, Date.now() - startTime, false, this.bcConfig.tenantId);

      // Build context-rich error message
      const { operation } = this.parseToolName(execution.toolName);
      const mcpError = ErrorBuilder.fromBCApiError(error, {
        tool: execution.toolName,
        operation: operation
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: true,
            code: mcpError.code,
            message: mcpError.message,
            details: mcpError.details,
            suggestion: mcpError.suggestion,
            example: mcpError.example,
            tool: execution.toolName
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private parseToolName(toolName: string): { operation: string } {
    const parts = toolName.split('_');
    const operation = parts[parts.length - 1];

    return { operation };
  }

  private pluralizeEntity(singular: string): string {
    // Handle special Business Central entity pluralizations
    const specialCases: Record<string, string> = {
      'company': 'companies',
      'customer': 'customers',
      'vendor': 'vendors',
      'employee': 'employees',
      'item': 'items',
      'salesInvoice': 'salesInvoices',
      'salesOrder': 'salesOrders',
      'purchaseInvoice': 'purchaseInvoices',
      'generalLedgerEntry': 'generalLedgerEntries',
      'account': 'accounts',
      'dimension': 'dimensions',
      'location': 'locations',
      'currency': 'currencies',
      'paymentMethod': 'paymentMethods',
      'paymentTerm': 'paymentTerms',
      'unitOfMeasure': 'unitsOfMeasure',
      'entityMetadata': 'entityDefinitions', // Special case
      'countryRegion': 'countriesRegions',
      'taxArea': 'taxAreas',
      'journal': 'journals',
      'journalLine': 'journalLines'
    };

    // Check special cases first
    if (specialCases[singular]) {
      return specialCases[singular];
    }

    // General pluralization rules
    if (singular.endsWith('y')) {
      return singular.slice(0, -1) + 'ies';
    } else if (singular.endsWith('s') || singular.endsWith('x') || singular.endsWith('ch')) {
      return singular + 'es';
    } else {
      return singular + 's';
    }
  }

  private async executeList(entityName: string, args: Record<string, any>): Promise<any> {
    const odataQuery = this.buildODataQuery(args);
    const result = await this.bcClient.get(entityName, odataQuery, this.accessToken);

    // Add pagination warning for large result sets
    if (result.value && Array.isArray(result.value)) {
      const count = result.value.length;
      const top = args.top ?? args.$top ?? 20; // Default from schema

      if (count >= top && count >= 100) {
        return {
          ...result,
          _pagination: {
            returned: count,
            hasMore: count >= top,
            suggestion: `Returned ${count} records. Use $skip=${count} to get the next page, or use $filter to narrow results.`
          }
        };
      }
    }

    return result;
  }

  private async executeGet(entityName: string, args: Record<string, any>): Promise<any> {
    if (!args.id) {
      throw new Error('Missing required parameter: id');
    }

    return this.bcClient.getById(entityName, args.id, this.accessToken);
  }

  private async executeCreate(entityName: string, args: Record<string, any>): Promise<any> {
    const data = { ...args };
    delete data.id;
    delete data.etag;
    delete data.$select;
    delete data.$expand;

    return this.bcClient.create(entityName, data, this.accessToken);
  }

  private async executeUpdate(entityName: string, args: Record<string, any>): Promise<any> {
    if (!args.id) {
      throw new Error('Missing required parameter: id');
    }

    const data = { ...args };
    const id = data.id;
    const etag = data.etag;
    
    delete data.id;
    delete data.etag;
    delete data.$select;
    delete data.$expand;

    return this.bcClient.update(entityName, id, data, etag, this.accessToken);
  }

  private async executeDelete(entityName: string, args: Record<string, any>): Promise<any> {
    if (!args.id) {
      throw new Error('Missing required parameter: id');
    }

    await this.bcClient.delete(entityName, args.id, args.etag, this.accessToken);
    return { success: true, deleted: args.id };
  }

  /**
   * Build OData query string with SECURITY VALIDATION
   * SECURITY: Uses ODataValidator to prevent injection attacks
   */
  private buildODataQuery(args: Record<string, any>): string {
    const params: string[] = [];

    try {
      // Validate all OData parameters using the security validator
      const validated = ODataValidator.validateODataParams(args);

      // Build query string with validated parameters
      if (validated.top !== undefined) {
        params.push(`$top=${validated.top}`);
      }

      if (validated.skip !== undefined) {
        params.push(`$skip=${validated.skip}`);
      }

      if (validated.filter) {
        // Filter is validated and safe, still encode for URL
        params.push(`$filter=${encodeURIComponent(validated.filter)}`);
      }

      if (validated.orderby) {
        // OrderBy is validated and safe, still encode for URL
        params.push(`$orderby=${encodeURIComponent(validated.orderby)}`);
      }

      if (validated.select) {
        // Select is validated (only safe field names)
        params.push(`$select=${validated.select}`);
      }

      if (validated.expand) {
        // Expand is validated (depth limited, safe field names)
        params.push(`$expand=${validated.expand}`);
      }

      logger.debug('OData query built successfully', {
        paramCount: params.length,
        hasFilter: !!validated.filter,
        hasExpand: !!validated.expand
      });

      return params.join('&');
    } catch (error) {
      // Log security validation failure
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`OData parameter validation failed: ${errorMsg}`, error instanceof Error ? error : undefined);

      // Re-throw with security context
      throw new Error(
        `Invalid OData parameters: ${error instanceof Error ? error.message : 'Validation failed'}`
      );
    }
  }
}
