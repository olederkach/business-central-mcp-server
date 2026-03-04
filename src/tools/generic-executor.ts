/**
 * Generic Tool Executor
 * Executes the 14 generic tools for Business Central operations
 * Adapted from Python implementation
 */

import { BCApiClient } from '../bc/client.js';
import { CompanyManager } from '../api/company-manager.js';
import { ApiContextManager } from '../api/api-context-manager.js';
import { logger } from '../utils/logger.js';
import { ODataValidator } from '../utils/odata-validator.js';
import axios from 'axios';

export interface GenericToolExecution {
  toolName: string;
  arguments: Record<string, any>;
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

/**
 * Executes generic tools that work with any Business Central entity
 */
export class GenericToolExecutor {
  constructor(
    private bcClient: BCApiClient,
    private companyManager: CompanyManager,
    private apiContextManager: ApiContextManager,
    private accessToken: string
  ) {}

  /**
   * Execute a generic tool
   * @param execution Tool execution request
   * @returns Tool execution result
   */
  async execute(execution: GenericToolExecution): Promise<ToolResult> {
    const { toolName, arguments: args } = execution;

    logger.info(`Executing generic tool: ${toolName}`, args);

    try {
      switch (toolName) {
        // API Context Management Tools
        case 'list_bc_api_contexts':
          return await this.executeListAvailableApis(args);

        case 'set_active_api':
          return await this.executeSetActiveApi(args);

        case 'get_active_api':
          return await this.executeGetActiveApi();

        // Company Management Tools
        case 'list_companies':
          return await this.executeListCompanies();

        case 'set_active_company':
          return await this.executeSetActiveCompany(args);

        case 'get_active_company':
          return await this.executeGetActiveCompany();

        // Resource Discovery Tools
        case 'list_resources':
          return await this.executeListResources();

        case 'get_odata_metadata':
          return await this.executeGetODataMetadata(args);

        case 'get_resource_schema':
          return await this.executeGetResourceSchema(args);

        case 'list_records':
          return await this.executeListRecords(args);

        case 'create_record':
          return await this.executeCreateRecord(args);

        case 'update_record':
          return await this.executeUpdateRecord(args);

        case 'delete_record':
          return await this.executeDeleteRecord(args);

        case 'find_records_by_field':
          return await this.executeFindRecordsByField(args);

        default:
          throw new Error(`Unknown generic tool: ${toolName}`);
      }
    } catch (error) {
      logger.error(`Error executing generic tool ${toolName}`, error instanceof Error ? error : undefined);
      return this.createErrorResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // ========================================
  // API Context Management Tool Executions
  // ========================================

  /**
   * Tool: list_bc_api_contexts
   * List available Business Central API contexts (publisher/group/version combinations)
   */
  private async executeListAvailableApis(args: any): Promise<ToolResult> {
    const forceRefresh = args.force_refresh || false;
    const apis = await this.apiContextManager.discoverApis(this.accessToken, forceRefresh);

    // Group APIs by category for better presentation
    const standardApis = apis.filter(api => api.publisher === '' && api.group === '');
    const microsoftApis = apis.filter(api => api.publisher === 'microsoft');
    const customApis = apis.filter(api => api.publisher !== '' && api.publisher !== 'microsoft');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          discovery_method: 'Business Central apicategoryroutes endpoint',
          summary: {
            total_apis: apis.length,
            standard_bc_apis: standardApis.length,
            microsoft_extended_apis: microsoftApis.length,
            custom_isv_apis: customApis.length
          },
          standard_apis: standardApis.map(api => ({
            publisher: api.publisher,
            group: api.group,
            version: api.version,
            displayName: api.displayName
          })),
          microsoft_apis: microsoftApis.map(api => ({
            publisher: api.publisher,
            group: api.group,
            version: api.version,
            displayName: api.displayName
          })),
          custom_apis: customApis.map(api => ({
            publisher: api.publisher,
            group: api.group,
            version: api.version,
            displayName: api.displayName
          })),
          usage_tips: [
            'Use set_active_api to switch between APIs',
            'Standard BC API (publisher="", group="") is the default',
            'Microsoft APIs provide extended automation and integration capabilities',
            'Custom ISV APIs are provided by third-party extensions',
            'All subsequent operations will use the active API context'
          ]
        }, null, 2)
      }],
      metadata: {
        count: apis.length
      }
    };
  }

  /**
   * Tool: set_active_api
   * Set the active API context for subsequent operations
   */
  private async executeSetActiveApi(args: any): Promise<ToolResult> {
    // Apply defaults for optional parameters (Standard BC API v2.0 is default)
    const publisher = args.publisher !== undefined ? args.publisher : '';
    const group = args.group !== undefined ? args.group : '';
    const version = args.version || 'v2.0';

    // Validate that empty strings are allowed (for Standard BC API)
    if (publisher === null || publisher === undefined) {
      throw new Error('Parameter publisher cannot be null/undefined. Use empty string "" for standard BC API.');
    }
    if (group === null || group === undefined) {
      throw new Error('Parameter group cannot be null/undefined. Use empty string "" for standard BC API.');
    }
    if (!version) {
      throw new Error('Missing required parameter: version (e.g., "v2.0")');
    }

    const apiContext = await this.apiContextManager.setActiveApi(
      publisher,
      group,
      version,
      this.accessToken
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: 'API context set successfully',
          active_api: {
            publisher: apiContext.publisher,
            group: apiContext.group,
            version: apiContext.version,
            displayName: apiContext.displayName,
            isStandard: apiContext.isStandard
          },
          note: 'All subsequent operations will use this API context until changed'
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: get_active_api
   * Get information about the currently active API context
   */
  private async executeGetActiveApi(): Promise<ToolResult> {
    const apiContext = await this.apiContextManager.getActiveApiContext();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          active_api: {
            publisher: apiContext.publisher,
            group: apiContext.group,
            version: apiContext.version,
            displayName: apiContext.displayName,
            isStandard: apiContext.isStandard
          },
          usage_tips: [
            'Use set_active_api to switch to a different API',
            'Use list_bc_api_contexts to see all available APIs',
            'Standard BC API (publisher="", group="") is the default'
          ]
        }, null, 2)
      }]
    };
  }

  // ========================================
  // Company Management Tool Executions
  // ========================================

  /**
   * Tool: list_companies
   * Discover all available companies
   */
  private async executeListCompanies(): Promise<ToolResult> {
    const companies = await this.companyManager.discoverCompanies();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          companies: companies.map(c => ({
            id: c.id,
            name: c.name,
            displayName: c.displayName,
            businessProfileId: c.businessProfileId
          })),
          count: companies.length,
          message: `Found ${companies.length} companies`
        }, null, 2)
      }],
      metadata: {
        count: companies.length
      }
    };
  }

  /**
   * Tool: set_active_company
   * Set the active company for subsequent operations
   */
  private async executeSetActiveCompany(args: any): Promise<ToolResult> {
    if (!args.company_id) {
      throw new Error('Missing required parameter: company_id');
    }

    const company = await this.companyManager.setActiveCompany(args.company_id);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: 'Company set successfully',
          company: {
            id: company.id,
            name: company.name,
            displayName: company.displayName,
            businessProfileId: company.businessProfileId
          }
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: get_active_company
   * Get information about the currently active company
   */
  private async executeGetActiveCompany(): Promise<ToolResult> {
    const company = await this.companyManager.getActiveCompany();

    if (!company) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: 'No active company set',
            hint: 'Use set_active_company to select a company, or list_companies to see available companies'
          }, null, 2)
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          active_company: {
            id: company.id,
            name: company.name,
            displayName: company.displayName,
            businessProfileId: company.businessProfileId
          }
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: list_resources
   * List all available Business Central resources/entities
   */
  private async executeListResources(): Promise<ToolResult> {
    try {
      // Use BC's native discovery endpoint (no company context needed)
      const response = await this.bcClient.get('', '', this.accessToken);

      const allResources = (response.value || []).map((item: any) => ({
        name: item.name,
        kind: item.kind,
        url: item.url
      }));

      // Filter EntitySets (the resources users typically want)
      const entitySets = allResources.filter(r => r.kind === 'EntitySet');
      const otherResources = allResources.filter(r => r.kind !== 'EntitySet');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            discovery_method: 'Business Central native API discovery endpoints',
            summary: {
              total_resources: allResources.length,
              entity_sets: entitySets.length,
              other_resources: otherResources.length
            },
            entity_sets: entitySets,
            other_resources: otherResources,
            usage_tips: [
              'All resources listed are available without company context',
              'EntitySets are the main data resources (customers, items, etc.)',
              'Resource names are case-sensitive',
              'Use get_resource_schema to explore fields for any resource',
              'Use get_odata_metadata to retrieve the full OData XML schema'
            ]
          }, null, 2)
        }],
        metadata: {
          count: allResources.length
        }
      };
    } catch (error) {
      logger.error('Error listing resources', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Tool: get_odata_metadata
   * Search and retrieve specific OData metadata information
   */
  private async executeGetODataMetadata(args: any): Promise<ToolResult> {
    const search = args.search;
    const searchType = args.search_type || 'all';
    // Note: include_properties and include_relationships could be used for XML parsing
    // Currently returning raw XML - future enhancement could filter based on these flags

    try {
      // Get the base API path from BC client (respects active API context)
      const baseApiPath = this.bcClient.getBaseApiPath();
      const metadataUrl = `https://api.businesscentral.dynamics.com${baseApiPath}/$metadata`;

      // Make direct HTTP request for XML content
      const response = await axios.get(metadataUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/xml',
          'Content-Type': 'application/xml'
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlContent = response.data;

      // For now, return raw XML (could add XML parsing later if needed)
      const result: any = {
        search_term: search,
        search_type: searchType,
        metadata_format: 'OData EDMX XML',
        usage_tips: [
          'This metadata describes all entities, properties, and relationships',
          'Use get_resource_schema for a simplified view of a specific entity',
          'EntityType elements define entity structures',
          'NavigationProperty elements define relationships',
          'EnumType elements define allowed values'
        ]
      };

      if (!search) {
        result.metadata_summary = 'Full OData metadata returned (see raw XML below)';
        result.hint = 'Provide a search term to filter specific entities, properties, or enums';
      }

      result.raw_metadata = typeof xmlContent === 'string' ?
        xmlContent.substring(0, 5000) + (xmlContent.length > 5000 ? '\n...(truncated)' : '') :
        JSON.stringify(xmlContent).substring(0, 5000);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      logger.error('Error fetching OData metadata', error instanceof Error ? error : undefined);
      throw new Error(`Failed to fetch OData metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Tool: get_resource_schema
   * Get detailed schema and field information for an entity
   */
  private async executeGetResourceSchema(args: any): Promise<ToolResult> {
    if (!args.resource) {
      throw new Error('Missing required parameter: resource');
    }

    const resource = args.resource;
    const companyId = args.company_id || await this.companyManager.getActiveCompanyId();

    if (!companyId) {
      throw new Error('No active company. Use set_active_company or provide company_id parameter');
    }

    try {
      // Get a sample record to determine schema
      const response = await this.bcClient.get(resource, '$top=1', this.accessToken);

      const fields: string[] = [];
      let sampleItem: any = {};

      if (response.value && response.value.length > 0) {
        sampleItem = response.value[0];
        fields.push(...Object.keys(sampleItem));
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            resource: resource,
            available_fields: fields,
            field_count: fields.length,
            sample_item: sampleItem,
            company_id: companyId,
            has_data: fields.length > 0,
            usage_tips: [
              `Use these field names in the 'select' parameter of list_records`,
              `Use these field names in the 'filter' parameter for OData queries`,
              `Use these field names in the 'orderby' parameter for sorting`
            ]
          }, null, 2)
        }],
        metadata: {
          count: fields.length
        }
      };
    } catch (error) {
      logger.error(`Error getting schema for resource ${resource}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Tool: list_records
   * List entity records with filtering, sorting, and pagination
   */
  private async executeListRecords(args: any): Promise<ToolResult> {
    if (!args.resource) {
      throw new Error('Missing required parameter: resource');
    }

    const resource = args.resource;
    const companyId = args.company_id || await this.companyManager.getActiveCompanyId();

    if (!companyId) {
      throw new Error('No active company. Use set_active_company or provide company_id parameter');
    }

    // Validate and build OData query parameters
    const validated = ODataValidator.validateODataParams(args);
    const queryParams: string[] = [];

    if (validated.filter) {
      queryParams.push(`$filter=${encodeURIComponent(validated.filter)}`);
    }
    if (validated.orderby) {
      queryParams.push(`$orderby=${encodeURIComponent(validated.orderby)}`);
    }
    if (validated.select) {
      queryParams.push(`$select=${encodeURIComponent(validated.select)}`);
    }
    if (validated.expand) {
      queryParams.push(`$expand=${encodeURIComponent(validated.expand)}`);
    }
    if (validated.top !== undefined) {
      queryParams.push(`$top=${validated.top}`);
    }
    if (validated.skip !== undefined) {
      queryParams.push(`$skip=${validated.skip}`);
    }

    const odataQuery = queryParams.join('&');

    try {
      const result = await this.bcClient.get(resource, odataQuery, this.accessToken);

      // Add metadata to response
      const enhancedResult: any = {
        ...result,
        _metadata: {
          company_id: companyId,
          request_params: {
            resource: resource,
            filter: args.filter,
            top: args.top,
            skip: args.skip,
            orderby: args.orderby,
            expand: args.expand,
            select: args.select
          },
          record_count: result.value?.length || 0
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(enhancedResult, null, 2)
        }],
        metadata: {
          count: result.value?.length || 0
        }
      };
    } catch (error) {
      logger.error(`Error listing records for resource ${resource}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Tool: create_record
   * Create a new record in a Business Central resource
   */
  private async executeCreateRecord(args: any): Promise<ToolResult> {
    if (!args.resource) {
      throw new Error('Missing required parameter: resource');
    }
    if (!args.data) {
      throw new Error('Missing required parameter: data');
    }

    const resource = args.resource;
    const companyId = args.company_id || await this.companyManager.getActiveCompanyId();

    if (!companyId) {
      throw new Error('No active company. Use set_active_company or provide company_id parameter');
    }

    try {
      // Use BCApiClient's create method
      const result = await this.bcClient.create(resource, args.data, this.accessToken);

      // If expand or select are requested, fetch the created record again with those options
      if (args.expand || args.select) {
        const queryParams: string[] = [];
        if (args.select) {
          queryParams.push(`$select=${encodeURIComponent(args.select)}`);
        }
        if (args.expand) {
          queryParams.push(`$expand=${encodeURIComponent(args.expand)}`);
        }
        const odataQuery = queryParams.join('&');

        // Extract the ID from the created record
        const recordId = result.id || result['@odata.id']?.match(/\(([^)]+)\)/)?.[1];
        if (recordId) {
          const enhancedResult = await this.bcClient.get(`${resource}(${recordId})`, odataQuery, this.accessToken);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                message: 'Record created successfully',
                created_record: enhancedResult,
                _metadata: {
                  company_id: companyId,
                  resource: resource
                }
              }, null, 2)
            }]
          };
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: 'Record created successfully',
            created_record: result,
            _metadata: {
              company_id: companyId,
              resource: resource
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      logger.error(`Error creating record in resource ${resource}`, error instanceof Error ? error : undefined);

      // Check if it's a "method not allowed" error (405)
      if (axios.isAxiosError(error) && error.response?.status === 405) {
        throw new Error(`Create operation not supported for resource '${resource}'. This entity may be read-only or require a different approach. Check the OData metadata using get_odata_metadata tool.`);
      }

      throw error;
    }
  }

  /**
   * Tool: update_record
   * Update an existing record in a Business Central resource
   */
  private async executeUpdateRecord(args: any): Promise<ToolResult> {
    if (!args.resource) {
      throw new Error('Missing required parameter: resource');
    }
    if (!args.record_id) {
      throw new Error('Missing required parameter: record_id');
    }
    if (!args.data) {
      throw new Error('Missing required parameter: data');
    }

    const resource = args.resource;
    const recordId = args.record_id;
    const companyId = args.company_id || await this.companyManager.getActiveCompanyId();

    if (!companyId) {
      throw new Error('No active company. Use set_active_company or provide company_id parameter');
    }

    try {
      // Use BCApiClient's update method
      const result = await this.bcClient.update(resource, recordId, args.data, args.etag, this.accessToken);

      // If expand or select are requested, fetch the updated record again with those options
      if (args.expand || args.select) {
        const queryParams: string[] = [];
        if (args.select) {
          queryParams.push(`$select=${encodeURIComponent(args.select)}`);
        }
        if (args.expand) {
          queryParams.push(`$expand=${encodeURIComponent(args.expand)}`);
        }
        const odataQuery = queryParams.join('&');

        const enhancedResult = await this.bcClient.get(`${resource}(${recordId})`, odataQuery, this.accessToken);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'Record updated successfully',
              updated_record: enhancedResult,
              _metadata: {
                company_id: companyId,
                resource: resource,
                record_id: recordId,
                etag_provided: !!args.etag
              }
            }, null, 2)
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: 'Record updated successfully',
            updated_record: result,
            _metadata: {
              company_id: companyId,
              resource: resource,
              record_id: recordId,
              etag_provided: !!args.etag
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      logger.error(`Error updating record ${recordId} in resource ${resource}`, error instanceof Error ? error : undefined);

      // Provide helpful error message for ETag conflicts
      if (axios.isAxiosError(error) && error.response?.status === 412) {
        throw new Error('Update failed: Record was modified by another process (ETag mismatch). Please retrieve the latest version and try again.');
      }

      // Check if it's a "method not allowed" error (405)
      if (axios.isAxiosError(error) && error.response?.status === 405) {
        throw new Error(`Update operation not supported for resource '${resource}'. This entity may be read-only or require a different approach. Check the OData metadata using get_odata_metadata tool.`);
      }

      throw error;
    }
  }

  /**
   * Tool: delete_record
   * Delete an existing record from a Business Central resource
   */
  private async executeDeleteRecord(args: any): Promise<ToolResult> {
    if (!args.resource) {
      throw new Error('Missing required parameter: resource');
    }
    if (!args.record_id) {
      throw new Error('Missing required parameter: record_id');
    }

    const resource = args.resource;
    const recordId = args.record_id;
    const companyId = args.company_id || await this.companyManager.getActiveCompanyId();

    if (!companyId) {
      throw new Error('No active company. Use set_active_company or provide company_id parameter');
    }

    try {
      // Use BCApiClient's delete method
      await this.bcClient.delete(resource, recordId, args.etag, this.accessToken);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: 'Record deleted successfully',
            _metadata: {
              company_id: companyId,
              resource: resource,
              record_id: recordId,
              etag_provided: !!args.etag
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      logger.error(`Error deleting record ${recordId} from resource ${resource}`, error instanceof Error ? error : undefined);

      // Provide helpful error message for ETag conflicts
      if (axios.isAxiosError(error) && error.response?.status === 412) {
        throw new Error('Delete failed: Record was modified by another process (ETag mismatch). Please retrieve the latest version and try again.');
      }

      // Provide helpful error message for not found
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`Delete failed: Record with ID ${recordId} not found in ${resource}`);
      }

      // Check if it's a "method not allowed" error (405)
      if (axios.isAxiosError(error) && error.response?.status === 405) {
        throw new Error(`Delete operation not supported for resource '${resource}'. This entity may not allow deletion or require a different approach. Check the OData metadata using get_odata_metadata tool.`);
      }

      throw error;
    }
  }

  /**
   * Tool: find_records_by_field
   * Find records where a specific field matches a value (convenience wrapper)
   */
  private async executeFindRecordsByField(args: any): Promise<ToolResult> {
    if (!args.resource) {
      throw new Error('Missing required parameter: resource');
    }
    if (!args.field) {
      throw new Error('Missing required parameter: field');
    }
    if (args.value === undefined || args.value === null) {
      throw new Error('Missing required parameter: value');
    }

    const resource = args.resource;
    const field = args.field;
    const value = args.value;

    try {
      // Build OData filter expression
      // Format value based on type
      let filterValue: string;

      // Check if value looks like a GUID
      const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (guidRegex.test(value)) {
        // GUID format
        filterValue = `guid'${value}'`;
      } else if (typeof value === 'number' || !isNaN(Number(value))) {
        // Numeric value (no quotes)
        filterValue = String(value);
      } else if (value === 'true' || value === 'false') {
        // Boolean value (no quotes)
        filterValue = value;
      } else {
        // String value (with quotes)
        filterValue = `'${value.replace(/'/g, "''")}'`;  // Escape single quotes
      }

      const filter = `${field} eq ${filterValue}`;

      logger.info(`find_records_by_field: Building filter "${filter}" for ${resource}`);

      // Delegate to list_records with the built filter
      return await this.executeListRecords({
        resource,
        filter,
        top: args.top,
        skip: args.skip,
        orderby: args.orderby,
        expand: args.expand,
        select: args.select,
        company_id: args.company_id
      });

    } catch (error) {
      logger.error(`Error in find_records_by_field for resource ${resource}, field ${field}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Create an error result
   */
  private createErrorResult(message: string): ToolResult {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: message
        }, null, 2)
      }],
      isError: true
    };
  }
}
