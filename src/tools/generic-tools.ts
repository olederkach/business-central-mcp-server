/**
 * Generic Tool Definitions
 * Static set of 14 resource-agnostic tools for Business Central
 * Adapted from Python implementation for TypeScript MCP server
 *
 * Tool Categories:
 * - API Context Management (3 tools): list_available_apis, set_active_api, get_active_api
 * - Company Management (3 tools): list_companies, set_active_company, get_active_company
 * - Resource Discovery (3 tools): list_resources, get_odata_metadata, get_resource_schema
 * - CRUD Operations (5 tools): list_records, create_record, update_record, delete_record, find_records_by_field
 */

import { MCPTool } from './generator.js';

/**
 * Generic tools that work with any Business Central entity
 * Instead of generating 450+ entity-specific tools, we use generic tools
 * where the entity name and API context are passed as parameters
 */
export const GENERIC_TOOLS: MCPTool[] = [
  // ========================================
  // API Context Management Tools (3 tools)
  // ========================================
  {
    name: 'list_bc_api_contexts',
    description: 'List available Business Central API contexts (publisher/group/version combinations). Returns Standard BC API v2.0, Microsoft extended APIs (automation, analytics), and custom ISV APIs. Each API context provides access to different sets of Business Central entities. Use this to discover which API contexts are available before setting the active context with set_active_api.',
    inputSchema: {
      type: 'object',
      properties: {
        force_refresh: {
          type: 'boolean',
          description: 'Force refresh from Business Central instead of using cached results. Default: false (use cache for faster response).'
        }
      },
      required: []
    },
    annotations: {
      readOnly: true
    }
  },
  {
    name: 'set_active_api',
    description: 'Set the active Business Central API context (publisher/group/version) for all subsequent data operations. This determines which Business Central API endpoint will be used. Standard BC API uses publisher="", group="", version="v2.0". Microsoft extended APIs use publisher="microsoft" with groups like "automation" or "analytics". Changes affect all tools until reset.',
    inputSchema: {
      type: 'object',
      properties: {
        publisher: {
          type: 'string',
          description: 'API publisher: empty string "" for Standard BC API, "microsoft" for Microsoft APIs, or custom name for ISV APIs. Default: ""',
          default: ''
        },
        group: {
          type: 'string',
          description: 'API group: empty string "" for Standard BC API, "automation"/"analytics"/etc for Microsoft APIs, or custom group for ISV APIs. Default: ""',
          default: ''
        },
        version: {
          type: 'string',
          description: 'API version: "v2.0" (standard), "v1.0", or "beta". Default: "v2.0"',
          default: 'v2.0'
        }
      },
      required: []
    },
    annotations: {
      destructive: true  // Changes global API context affecting all subsequent operations
    }
  },
  {
    name: 'get_active_api',
    description: 'Get the currently active Business Central API context (publisher, group, version, display name). Returns the API context being used for all data operations. If not explicitly set, returns Standard BC API v2.0 (publisher="", group="", version="v2.0"). Use this to verify which Business Central API endpoint is currently active.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    annotations: {
      readOnly: true
    }
  },

  // ========================================
  // Company Management Tools (3 tools)
  // ========================================
  {
    name: 'list_companies',
    description: 'List all companies in the Business Central environment. Returns company IDs (UUID), names, and details. Business Central supports multiple companies representing separate business entities (e.g., different subsidiaries or legal entities). Use this to discover available companies before selecting one with set_active_company. The active company determines which company data is accessed by all data operations.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    annotations: {
      readOnly: true
    }
  },
  {
    name: 'set_active_company',
    description: 'Set the active Business Central company for all subsequent data operations. All CRUD operations will access data from this company until changed. Requires company UUID (not name). Call list_companies first to get available company IDs. This is a global context switch affecting all data tools (list_records, create_record, update_record, delete_record, find_records_by_field).',
    inputSchema: {
      type: 'object',
      properties: {
        company_id: {
          type: 'string',
          description: 'Company UUID in format "269d980d-e4a6-f011-a7af-6045bdc9095d". Get from list_companies id field. Do not use company name.'
        }
      },
      required: ['company_id']
    },
    annotations: {
      destructive: true  // Changes global company context affecting all subsequent operations
    }
  },
  {
    name: 'get_active_company',
    description: 'Get the currently active Business Central company (UUID, name, details). Returns the company being used for all data operations. If not explicitly set, returns the default company (first company or configured in BC_COMPANY_ID). Use this to verify which company context is active before performing data operations.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    annotations: {
      readOnly: true
    }
  },

  // ========================================
  // Resource Discovery Tools (3 tools)
  // ========================================
  {
    name: 'list_resources',
    description: 'List all Business Central entity names available in the current API context (customers, items, salesOrders, vendors, etc.). Business Central has 450+ entities representing business objects. Entity names are case-sensitive. Use this to discover available entities or find the correct entity name. Available entities depend on the current API context (Standard BC API, Microsoft APIs, or ISV APIs).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    annotations: {
      readOnly: true
    }
  },
  {
    name: 'get_odata_metadata',
    description: 'Search Business Central OData metadata for entities, properties, relationships, or enums. Advanced tool for exploring the complete schema when get_resource_schema is insufficient. Search by term and type (entity/property/relationship/enum/all). Returns focused, relevant metadata. Use get_resource_schema for simple entity lookups. Use this for cross-entity searches or complex metadata exploration.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search term: entity name ("customer"), property name ("email"), or enum name ("Status"). If empty, returns summary of all entities.'
        },
        search_type: {
          type: 'string',
          description: 'Metadata type to search: "entity", "property", "relationship", "enum", or "all". Default: "all"',
          enum: ['entity', 'property', 'relationship', 'enum', 'all']
        },
        include_properties: {
          type: 'boolean',
          description: 'Include detailed property info (name, type, nullable, key) for found entities. Default: false'
        },
        include_relationships: {
          type: 'boolean',
          description: 'Include navigation properties/relationships for found entities (for $expand). Default: false'
        }
      },
      required: []
    },
    annotations: {
      readOnly: true
    }
  },
  {
    name: 'get_resource_schema',
    description: 'Get detailed schema for a specific Business Central entity. Returns all properties with names, types (Edm.String, Edm.Int32, Edm.Guid), nullability, read-only status, and key fields. Also returns navigation properties for relationships ($expand). Use this before creating or updating records to understand required fields, data types, and available properties. Case-sensitive entity names.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Entity name (case-sensitive): "customers", "items", "salesOrders", "vendors", "employees", etc. Use list_resources to discover available entities.'
        },
        company_id: {
          type: 'string',
          description: 'Optional company UUID. If not provided, uses active company from get_active_company.'
        }
      },
      required: ['resource']
    },
    annotations: {
      readOnly: true
    }
  },
  {
    name: 'list_records',
    description: 'Query Business Central entity records with OData V4.0 capabilities: filtering, sorting, pagination, field selection, and relationship expansion. Primary tool for retrieving data from any Business Central entity (customers, items, salesOrders, etc.). Supports complex queries including comparisons (eq, ne, gt, lt), logical operators (and, or), and string functions (contains, startswith, endswith). Use filter for conditions, orderby for sorting, top/skip for pagination, select for specific fields, expand for related entities.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Entity name (case-sensitive): "customers", "items", "salesOrders", "vendors", "employees", etc. Use list_resources if unsure.'
        },
        filter: {
          type: 'string',
          description: 'OData V4.0 $filter: "city eq \'Seattle\'", "amount gt 1000 and status eq \'Active\'", "contains(displayName, \'bike\')". GUID fields use guid\'value\' format.'
        },
        top: {
          type: 'number',
          description: 'Max records to return. Recommended: 20. Max: typically 1000. Use with skip for pagination.'
        },
        skip: {
          type: 'number',
          description: 'Records to skip. For pagination: Page 1 skip=0, Page 2 skip=20 (if top=20).'
        },
        orderby: {
          type: 'string',
          description: 'OData V4.0 $orderby: "displayName asc", "createdDate desc", "city asc, displayName asc" (multiple sorts).'
        },
        expand: {
          type: 'string',
          description: 'OData V4.0 $expand to include related entities: "salesOrderLines", "customer,defaultDimensions". See get_resource_schema for navigation properties.'
        },
        select: {
          type: 'string',
          description: 'OData V4.0 $select to limit returned fields: "id,displayName,email". Improves performance. If not specified, returns all properties.'
        },
        company_id: {
          type: 'string',
          description: 'Optional company UUID. If not provided, uses active company.'
        }
      },
      required: ['resource']
    },
    annotations: {
      readOnly: true
    }
  },
  {
    name: 'create_record',
    description: 'Create a new Business Central record. DESTRUCTIVE - creates new data. Returns created record with server-generated fields (id, systemId). IMPORTANT: Call get_resource_schema first to understand required fields and data types. Property names and types must match schema exactly. Required fields must be included; read-only fields (id, systemId, lastModifiedDateTime) should NOT be included. Use expand to return related entities, select to limit returned fields.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Entity name (case-sensitive): "customers", "items", "salesOrders", "vendors", etc. Not all entities are creatable. Use list_resources.'
        },
        data: {
          type: 'object',
          description: 'JSON object with properties for new record. Must match schema. Example: {"displayName": "Contoso Ltd", "email": "contact@contoso.com", "city": "Seattle"}. Call get_resource_schema first to find required fields.'
        },
        expand: {
          type: 'string',
          description: 'Optional OData $expand to include related entities in response: "defaultDimensions", "salesOrderLines". See get_resource_schema for navigation properties.'
        },
        select: {
          type: 'string',
          description: 'Optional OData $select to limit returned fields: "id,displayName,email". Reduces response size.'
        },
        company_id: {
          type: 'string',
          description: 'Optional company UUID. If not provided, creates in active company.'
        }
      },
      required: ['resource', 'data']
    },
    annotations: {
      destructive: true  // Creates new data in Business Central
    }
  },
  {
    name: 'update_record',
    description: 'Update an existing Business Central record. DESTRUCTIVE - modifies existing data. Supports partial updates (only specify changed fields). Returns updated record. Supports optimistic concurrency control with ETag to prevent conflicts. Use list_records or find_records_by_field to get record ID first. Do NOT include read-only fields (id, systemId, lastModifiedDateTime). Property names and types must match schema. ETag best practice: Use for critical updates to prevent data loss.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Entity name (case-sensitive): "customers", "items", "salesOrders", etc. Some entities/fields may be read-only. Use list_resources.'
        },
        record_id: {
          type: 'string',
          description: 'Record UUID (e.g., "5ca6738a-44e3-ea11-bb43-000d3a2feca1"). Get from list_records id or systemId field.'
        },
        data: {
          type: 'object',
          description: 'JSON object with ONLY properties to update. Partial updates supported. Example: {"email": "newemail@contoso.com"} or {"displayName": "Updated Name", "phoneNumber": "+1-555-9999"}. Do NOT include read-only fields.'
        },
        etag: {
          type: 'string',
          description: 'Optional ETag for concurrency control. Get from @odata.etag in list_records response. Update fails with 412 if record was modified. Format: "W/\\"JzQ0O0VnQUFBQUo3QlRrQU1B...\\""'
        },
        expand: {
          type: 'string',
          description: 'Optional OData $expand for related entities in response: "defaultDimensions", "salesOrderLines".'
        },
        select: {
          type: 'string',
          description: 'Optional OData $select to limit returned fields: "id,displayName,email,lastModifiedDateTime".'
        },
        company_id: {
          type: 'string',
          description: 'Optional company UUID. If not provided, uses active company.'
        }
      },
      required: ['resource', 'record_id', 'data']
    },
    annotations: {
      destructive: true  // Modifies existing data in Business Central
    }
  },
  {
    name: 'delete_record',
    description: 'Delete a Business Central record. DESTRUCTIVE - PERMANENTLY deletes data. CANNOT BE UNDONE. Returns no response body (HTTP 204). Supports ETag for concurrency control to prevent accidental deletion of modified records. WARNING: Some entities cannot be deleted if they have related records (e.g., customer with outstanding invoices). IMPORTANT: Always confirm with user before executing. Use list_records/find_records_by_field to get record ID first. ETag BEST PRACTICE: Always use ETags for delete operations.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Entity name (case-sensitive): "customers", "items", "vendors", etc. Some entities cannot be deleted (read-only, system, or with dependencies). Use list_resources.'
        },
        record_id: {
          type: 'string',
          description: 'Record UUID (e.g., "5ca6738a-44e3-ea11-bb43-000d3a2feca1"). VERIFY correct ID - operation cannot be undone. Get from list_records id or systemId.'
        },
        etag: {
          type: 'string',
          description: 'Optional ETag for concurrency control. Get from @odata.etag in list_records. Delete fails with 412 if record was modified. BEST PRACTICE: Always use ETags for deletes.'
        },
        company_id: {
          type: 'string',
          description: 'Optional company UUID. If not provided, deletes from active company.'
        }
      },
      required: ['resource', 'record_id']
    },
    annotations: {
      destructive: true  // Permanently deletes data from Business Central (cannot be undone)
    }
  },
  {
    name: 'find_records_by_field',
    description: 'Find Business Central records by single field value. CONVENIENCE WRAPPER around list_records that automatically builds OData filter with proper formatting (quotes, GUID formatting). Use for simple single-field searches (find customer by email, item by number). For complex multi-condition queries, use list_records with custom filter. Matching is EXACT (eq operator) and case-sensitive. For substring matching, use list_records with contains(). Supports pagination, expansion, selection, ordering like list_records.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Entity name (case-sensitive): "customers", "items", "salesOrders", "vendors", etc. Use list_resources if unsure.'
        },
        field: {
          type: 'string',
          description: 'Property name (case-sensitive): "displayName", "email", "number", "phoneNumber", "city", "id", "systemId". Use get_resource_schema to discover available properties.'
        },
        value: {
          type: 'string',
          description: 'Value to search for. Auto-formatted for OData. "Seattle" → filter="city eq \'Seattle\'". GUID fields auto-formatted as guid\'value\'. Exact match, case-sensitive.'
        },
        top: {
          type: 'number',
          description: 'Max records to return. Recommended: 20. Use with skip for pagination.'
        },
        skip: {
          type: 'number',
          description: 'Records to skip. For pagination: Page 1 skip=0, Page 2 skip=20 (if top=20).'
        },
        orderby: {
          type: 'string',
          description: 'OData $orderby: "displayName asc", "lastModifiedDateTime desc".'
        },
        expand: {
          type: 'string',
          description: 'OData $expand: "salesOrderLines", "defaultDimensions". See get_resource_schema for navigation properties.'
        },
        select: {
          type: 'string',
          description: 'OData $select: "id,displayName,email". Reduces response size.'
        },
        company_id: {
          type: 'string',
          description: 'Optional company UUID. If not provided, uses active company.'
        }
      },
      required: ['resource', 'field', 'value']
    },
    annotations: {
      readOnly: true
    }
  }
];

/**
 * Check if a tool name is a generic tool
 */
export function isGenericTool(toolName: string): boolean {
  return GENERIC_TOOLS.some(tool => tool.name === toolName);
}

/**
 * Get a specific generic tool by name
 */
export function getGenericTool(toolName: string): MCPTool | undefined {
  return GENERIC_TOOLS.find(tool => tool.name === toolName);
}
