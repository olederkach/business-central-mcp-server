# Azure AI Foundry Agent Service Integration

This guide explains how to integrate the Business Central MCP Server with Azure AI Foundry Agent Service, enabling your AI agents to access Business Central data with enhanced discoverability.

## Overview

The Business Central MCP Server now provides **dynamic input discovery** that Azure AI Foundry Agent Service can use to populate dropdown menus and autocomplete fields for:

- **Companies List**: All available Business Central companies with their IDs and names
- **Entity Categories**: All Business Central API entities (customers, items, salesOrders, etc.)
- **API Contexts**: Available API routes (Standard BC API, Microsoft extended APIs, custom ISV APIs)

This makes it much easier for AI agents to work with Business Central data without needing to know exact company IDs or entity names upfront.

## Prerequisites

1. Azure AI Foundry workspace configured
2. Business Central MCP Server deployed to Azure Container Apps
3. OAuth 2.0 authentication configured (recommended) or API Key
4. Business Central environment with API access

## MCP Resources for Agent Service

The MCP Server exposes the following resources that Azure AI Foundry Agent Service can discover:

### 1. Companies List
**Resource URI**: `bc://{tenantId}/{environment}/companies`

Returns all available Business Central companies with:
- `id` (UUID format) - use for `company_id` parameter in tools
- `displayName` - company name
- `name` - company system name
- Other company details

**Use case**: Populate company dropdown for tools that require `company_id` parameter

### 2. Entity Categories
**Resource URI**: `bc://{tenantId}/{environment}/entities`

Returns all available Business Central entities (API categories):
- `name` - entity name (e.g., "customers", "items", "salesOrders")
- `entitySetName` - OData entity set name
- `operations` - available operations (list, create, update, delete)
- `description` - entity description

**Use case**: Populate entity dropdown for tools that require `resource` parameter

### 3. API Contexts
**Resource URI**: `bc://{tenantId}/{environment}/api-contexts`

Returns all available API routes:
- `publisher` - API publisher ("" for standard, "microsoft" for MS extended, or custom)
- `group` - API group ("" for standard, or specific group name)
- `version` - API version (e.g., "v2.0")
- `displayName` - human-readable API name
- `isStandardApi` - true if this is the standard BC API

**Use case**: Populate API context dropdown for `set_active_api` tool parameters

### 4. Full API Metadata
**Resource URI**: `bc://${tenantId}/${environment}/metadata`

Returns complete OData metadata with all entities, properties, and relationships.

**Use case**: Advanced scenarios where full schema information is needed

## Setting Up Agent Service Tool

### Step 1: Create Agent in Azure AI Foundry

1. Open Azure AI Foundry portal
2. Navigate to your workspace
3. Create a new Agent
4. Configure agent name and description

### Step 2: Add Business Central MCP Tool

1. In the Agent configuration, go to **Tools** tab
2. Click **Add Tool**
3. Select **Azure AI Foundry Agent Service**
4. Configure the tool:
   ```
   Name: List Agents (or your tool name)
   Description: List agents
   Tool Type: Azure AI Foundry Agent Service
   Connection: Azure AI Foundry Agent Service
   ```

### Step 3: Configure Tool Inputs with Dynamic Discovery

The Azure AI Foundry Agent Service will automatically discover these inputs from your MCP resources:

#### Example: Configure `list_records` tool

**Input: company_id**
- Type: String
- Fill using: Dynamically fill with AI
- Data Source: MCP Resource
- Resource URI: `bc://{tenantId}/{environment}/companies`
- Value Field: `id`
- Display Field: `displayName`

Result: Agent Service will show dropdown with all companies like:

- "CRONUS USA Inc." → `<company-uuid>`
- "CRONUS Canada Inc." → `abc123...`

**Input: resource**
- Type: String
- Fill using: Dynamically fill with AI
- Data Source: MCP Resource
- Resource URI: `bc://{tenantId}/{environment}/entities`
- Value Field: `name`
- Display Field: `name`

Result: Agent Service will show dropdown with all entities:
- customers
- items
- salesOrders
- vendors
- etc.

### Step 4: Configure Authentication

#### Option A: OAuth 2.0 (Recommended)

Configure OAuth in your Agent Service connection:
```
Authentication Type: OAuth 2.0
Token URL: https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
Client ID: {your-app-registration-client-id}
Client Secret: {your-app-registration-client-secret}
Scope: api://{client-id}/MCP.Access
```

#### Option B: API Key

Configure API Key in your Agent Service connection:
```
Authentication Type: API Key
Header Name: X-API-Key
API Key: {your-api-key}
```

## Tool Configuration Examples

### Example 1: List Companies Tool

**Tool Configuration**:
```yaml
name: list_companies
description: Get all available Business Central companies
inputs: []  # No inputs needed
connection: business-central-mcp-server
endpoint: /mcp/bearer
```

**Agent Service will automatically:**
1. Call `resources/list` to discover available resources
2. Call `resources/read` with URI `bc://.../ companies`
3. Parse the response and cache company list
4. Use this for populating dropdowns in other tools

### Example 2: List Records Tool with Dynamic Inputs

**Tool Configuration**:
```yaml
name: list_records
description: List records from a Business Central entity
inputs:
  - name: resource
    type: string
    required: true
    description: Business Central entity name
    data_source:
      type: mcp_resource
      uri: bc://{tenantId}/{environment}/entities
      value_field: name
      display_field: name
  - name: company_id
    type: string
    required: false
    description: Company ID (optional, uses active company if not specified)
    data_source:
      type: mcp_resource
      uri: bc://{tenantId}/{environment}/companies
      value_field: id
      display_field: displayName
  - name: filter
    type: string
    required: false
    description: OData filter expression
  - name: top
    type: integer
    required: false
    description: Maximum number of records to return
    default: 20
```

**How it works**:
1. Agent Service discovers the `resource` and `company_id` inputs
2. When configuring the tool, dropdowns are populated from MCP resources
3. User selects "customers" from entity dropdown → `resource="customers"`
4. User selects "CRONUS USA Inc." from company dropdown → `company_id="<company-uuid>"`
5. Agent Service calls `list_records` tool with these parameters

### Example 3: Set Active API Tool

**Tool Configuration**:
```yaml
name: set_active_api
description: Set the active API context for Business Central operations
inputs:
  - name: publisher
    type: string
    required: false
    description: API publisher
    data_source:
      type: mcp_resource
      uri: bc://{tenantId}/{environment}/api-contexts
      value_field: publisher
      display_field: displayName
  - name: group
    type: string
    required: false
    description: API group
  - name: version
    type: string
    required: false
    description: API version
    default: "v2.0"
```

## MCP Protocol Flow

Here's how Azure AI Foundry Agent Service interacts with the MCP Server:

1. **Initialization**
   ```json
   POST /mcp/bearer
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "initialize",
     "params": {}
   }
   ```

2. **Discover Resources**
   ```json
   POST /mcp/bearer
   {
     "jsonrpc": "2.0",
     "id": 2,
     "method": "resources/list",
     "params": {}
   }
   ```

   **Response**:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "result": {
       "resources": [
         {
           "uri": "bc://{tenantId}/{env}/companies",
           "name": "Companies List",
           "description": "Available Business Central companies...",
           "mimeType": "application/json"
         },
         {
           "uri": "bc://{tenantId}/{env}/entities",
           "name": "Entity Categories",
           "description": "Available Business Central entity names...",
           "mimeType": "application/json"
         },
         ...
       ]
     }
   }
   ```

3. **Read Resource Data**
   ```json
   POST /mcp/bearer
   {
     "jsonrpc": "2.0",
     "id": 3,
     "method": "resources/read",
     "params": {
       "uri": "bc://{tenantId}/{env}/companies"
     }
   }
   ```

   **Response**:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 3,
     "result": {
       "contents": [{
         "uri": "bc://..../companies",
         "mimeType": "application/json",
         "text": "{\"count\": 2, \"companies\": [{\"id\": \"<uuid>\", \"displayName\": \"CRONUS USA Inc.\"}, ...]}"
       }]
     }
   }
   ```

4. **List Available Tools**
   ```json
   POST /mcp/bearer
   {
     "jsonrpc": "2.0",
     "id": 4,
     "method": "tools/list",
     "params": {}
   }
   ```

5. **Execute Tool**
   ```json
   POST /mcp/bearer
   {
     "jsonrpc": "2.0",
     "id": 5,
     "method": "tools/call",
     "params": {
       "name": "list_records",
       "arguments": {
         "resource": "customers",
         "company_id": "<company-uuid>",
         "top": 20
       }
     }
   }
   ```

## Testing

### Test Resource Discovery

```bash
# Test resources/list endpoint
curl -X POST https://your-mcp-server.azurecontainerapps.io/mcp/bearer \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "resources/list",
    "params": {}
  }'

# Test resources/read for companies
curl -X POST https://your-mcp-server.azurecontainerapps.io/mcp/bearer \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "resources/read",
    "params": {
      "uri": "bc://{tenantId}/{env}/companies"
    }
  }'

# Test resources/read for entities
curl -X POST https://your-mcp-server.azurecontainerapps.io/mcp/bearer \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type": "application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "resources/read",
    "params": {
      "uri": "bc://{tenantId}/{env}/entities"
    }
  }'

# Test resources/read for API contexts
curl -X POST https://your-mcp-server.azurecontainerapps.io/mcp/bearer \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "resources/read",
    "params": {
      "uri": "bc://{tenantId}/{env}/api-contexts"
    }
  }'
```

## Benefits

1. **Better UX**: Agents can discover available options without trial-and-error
2. **Fewer Errors**: Valid company IDs and entity names are pre-populated
3. **Self-Documenting**: Resources expose what's available in your BC environment
4. **Dynamic**: Lists update automatically when companies or APIs change
5. **Standardized**: Uses MCP protocol standard for resource discovery

## Troubleshooting

### Resources Not Showing Up

**Problem**: Azure AI Foundry Agent Service doesn't show resource dropdowns

**Solution**:
1. Verify MCP Server is running and accessible
2. Check OAuth token has correct scopes
3. Test `resources/list` endpoint manually
4. Verify URL path includes tenant/environment configuration

### Empty Resource Lists

**Problem**: Resources return empty arrays

**Solution**:
1. Check BC API authentication (OAuth tokens)
2. Verify BC environment is accessible
3. Check Application Insights logs for errors
4. Test BC API directly: `https://api.businesscentral.dynamics.com/v2.0/{tenantId}/{env}/api/v2.0/companies`

### Performance Issues

**Problem**: Resource discovery is slow

**Solution**:
1. Resources are cached for 1 hour by default
2. Increase `CACHE_TTL_SECONDS` environment variable

## See Also

- [Deployment Guide](../DEPLOYMENT.md) - Azure deployment guide
- [MCP Client Setup](../MCP_CLIENT_SETUP.md) - General client configuration
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/) - Official MCP spec
