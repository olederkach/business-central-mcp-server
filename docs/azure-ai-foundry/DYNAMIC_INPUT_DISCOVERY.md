# Dynamic Input Discovery - Azure AI Foundry Integration

## Summary

Enhanced the Business Central MCP Server to expose **Business Central API categories (entities) and Companies as MCP Resources** that Azure AI Foundry Agent Service can discover and use to populate dynamic input dropdowns.

This enables Azure AI Foundry agents to:
- Discover available Business Central companies without hardcoding IDs
- Browse available entity types (customers, items, salesOrders, etc.)
- Switch between different API contexts (Standard BC API, Microsoft extended APIs, custom ISV APIs)

## What Was Implemented

### 1. Enhanced MCP Resources (4 new resources)

Modified [src/mcp/protocol.ts](../../src/mcp/protocol.ts) to expose these discoverable resources:

#### Resource 1: Companies List
```
URI: bc://{tenantId}/{environment}/companies
Purpose: List all available BC companies with IDs and names
Use for: Populating company_id dropdowns in tools
```

Example response:
```json
{
  "count": 2,
  "companies": [
    {
      "id": "<company-uuid>",
      "displayName": "CRONUS USA Inc.",
      "name": "CRONUS USA Inc."
    },
    {
      "id": "abc123-...",
      "displayName": "CRONUS Canada Inc.",
      "name": "CRONUS Canada Inc."
    }
  ]
}
```

#### Resource 2: Entity Categories
```
URI: bc://{tenantId}/{environment}/entities
Purpose: List all available BC entity/resource names (API categories)
Use for: Populating resource dropdowns in tools
```

Example response:
```json
{
  "count": 450,
  "entities": [
    {
      "name": "customers",
      "entitySetName": "customers",
      "operations": ["list", "create", "update", "delete"],
      "description": "customer entity with 25 properties"
    },
    {
      "name": "items",
      "entitySetName": "items",
      "operations": ["list", "create", "update"],
      "description": "item entity with 30 properties"
    },
    ...
  ]
}
```

#### Resource 3: API Contexts
```
URI: bc://{tenantId}/{environment}/api-contexts
Purpose: List all available API routes with publisher/group/version
Use for: Populating API context dropdowns in set_active_api tool
```

Example response:
```json
{
  "count": 3,
  "apis": [
    {
      "publisher": "",
      "group": "",
      "version": "v2.0",
      "displayName": "Standard Business Central API v2.0",
      "isStandardApi": true
    },
    {
      "publisher": "microsoft",
      "group": "automation",
      "version": "v2.0",
      "displayName": "Microsoft automation API v2.0",
      "isStandardApi": false
    },
    {
      "publisher": "Contoso",
      "group": "Warehouse",
      "version": "v1.0",
      "displayName": "Contoso Warehouse API v1.0",
      "isStandardApi": false
    }
  ]
}
```

#### Resource 4: Full API Metadata (Enhanced)
```
URI: bc://{tenantId}/{environment}/metadata
Purpose: Complete OData metadata with all entities, properties, and relationships
Use for: Advanced scenarios requiring full schema
```

### 2. Protocol Handler Updates

**File**: [src/mcp/protocol.ts:326-544](../../src/mcp/protocol.ts#L326-L544)

**Changes**:
1. Enhanced `handleResourcesList()` to return 4 resources (was 2)
2. Enhanced `handleResourcesRead()` to handle 4 resource URIs:
   - `/companies` - Uses CompanyManager to fetch companies
   - `/entities` - Uses MetadataParser to fetch entity list
   - `/api-contexts` - Uses ApiContextManager to fetch API routes
   - `/metadata` - Returns full OData metadata (existing)

**Key Features**:
- Works in both `generic` and `dynamic` tool modes
- Caches results for performance (respects `CACHE_TTL_SECONDS`)
- Graceful error handling with fallback defaults
- Supports both OAuth and API Key authentication

### 3. Integration Pattern

Azure AI Foundry Agent Service can now:

1. **Discover Resources** (MCP `resources/list`)
   ```json
   {
     "method": "resources/list",
     "params": {}
   }
   ```

2. **Read Resource Data** (MCP `resources/read`)
   ```json
   {
     "method": "resources/read",
     "params": {
       "uri": "bc://{tenantId}/{env}/companies"
     }
   }
   ```

3. **Configure Tool Inputs** with dynamic data sources
   ```yaml
   inputs:
     - name: company_id
       data_source:
         type: mcp_resource
         uri: bc://.../companies
         value_field: id
         display_field: displayName
   ```

4. **Show Dropdown in UI** with discovered values
   ```
   [Dropdown: Select Company]
   ├─ CRONUS USA Inc. (uuid-...)
   ├─ CRONUS Canada Inc. (abc123-...)
   └─ Fabrikam Inc. (def456-...)
   ```

## Benefits

### For Users
- **No hardcoded IDs**: Company IDs are discovered automatically
- **Self-documenting**: Users see what's available in their BC environment
- **Fewer errors**: Valid entity names and IDs are pre-populated
- **Better UX**: Dropdowns instead of text input for common parameters

### For Developers
- **Standards-based**: Uses MCP protocol's resource discovery
- **Flexible**: Works with any MCP-compatible client (Azure AI Foundry, Claude Desktop, etc.)
- **Cached**: Resources are cached for performance
- **Extensible**: Easy to add more resources in the future

### For AI Agents
- **Context-aware**: Agents know what companies and entities are available
- **Guided**: Valid options reduce trial-and-error
- **Dynamic**: Lists update when BC environment changes
- **Type-safe**: Resources provide structured data with types

## Architecture

```
┌─────────────────────────────────────────────┐
│ Azure AI Foundry Agent Service              │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ Agent Configuration                   │ │
│  │  └─ Tool: list_records                │ │
│  │      └─ Input: company_id             │ │
│  │          └─ Data Source: MCP Resource │ │
│  │              └─ URI: bc://.../companies │
│  └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                    │
                    │ MCP Protocol (JSON-RPC 2.0)
                    ▼
┌─────────────────────────────────────────────┐
│ Business Central MCP Server                 │
│ (Azure Container Apps)                      │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ McpProtocolHandler                    │ │
│  │  ├─ handleResourcesList()             │ │
│  │  │   └─ Returns 4 resources           │ │
│  │  └─ handleResourcesRead()             │ │
│  │      ├─ /companies → CompanyManager   │ │
│  │      ├─ /entities → MetadataParser    │ │
│  │      ├─ /api-contexts → ApiContextMgr │ │
│  │      └─ /metadata → Full schema       │ │
│  └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                    │
                    │ OData API
                    ▼
┌─────────────────────────────────────────────┐
│ Business Central API                        │
│ (api.businesscentral.dynamics.com)          │
└─────────────────────────────────────────────┘
```

## Testing

### Test Resource Discovery

```bash
# 1. List available resources
curl -X POST https://your-mcp-server.azurecontainerapps.io/mcp/bearer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/list","params":{}}'

# 2. Get companies list
curl -X POST https://your-mcp-server.azurecontainerapps.io/mcp/bearer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"bc://<tenant-id>/Sandbox/companies"}}'

# 3. Get entities list
curl -X POST https://your-mcp-server.azurecontainerapps.io/mcp/bearer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"bc://<tenant-id>/Sandbox/entities"}}'

# 4. Get API contexts
curl -X POST https://your-mcp-server.azurecontainerapps.io/mcp/bearer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"bc://<tenant-id>/Sandbox/api-contexts"}}'
```

### Expected Response Structure

All resource reads return:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "contents": [{
      "uri": "bc://...",
      "mimeType": "application/json",
      "text": "{...JSON data...}"
    }]
  }
}
```

## Files Changed

| File | Changes | Lines |
|------|---------|-------|
| [src/mcp/protocol.ts](../../src/mcp/protocol.ts) | Enhanced resource handling | 326-544 |

## Files Created

| File | Purpose |
|------|---------|
| [docs/azure-ai-foundry/AGENT_SERVICE_SETUP.md](./AGENT_SERVICE_SETUP.md) | Complete setup guide for Azure AI Foundry |
| [docs/azure-ai-foundry/DYNAMIC_INPUT_DISCOVERY.md](./DYNAMIC_INPUT_DISCOVERY.md) | This document |

## Next Steps

1. **Test in Azure AI Foundry**: Configure an agent and verify resource discovery
2. **Add More Resources** (optional): Consider exposing:
   - Field schemas for specific entities
   - Dimension values
   - Unit of measure IDs
   - Other lookup values
3. **Performance Tuning**: Monitor resource read latency and adjust caching
4. **User Documentation**: Create end-user guides for using the agent

## Compatibility

- MCP Protocol: 2025-03-26
- Azure AI Foundry Agent Service
- Claude Desktop (MCP resources)
- Any MCP-compatible client
- OAuth 2.0 authentication
- API Key authentication
- 14 generic tools

## See Also

- [AGENT_SERVICE_SETUP.md](./AGENT_SERVICE_SETUP.md) - Complete Azure AI Foundry setup guide
- [MCP Resources Specification](https://spec.modelcontextprotocol.io/specification/resources/) - Official MCP spec
- [MCP Client Setup](../MCP_CLIENT_SETUP.md) - General client configuration
