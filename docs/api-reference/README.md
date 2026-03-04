# API Reference

Business Central MCP Server API documentation.

---

## MCP Protocol

The server implements the [Model Context Protocol](https://modelcontextprotocol.io) (JSON-RPC 2.0 over stdio or HTTP).

### Endpoints

| Mode | Transport | Endpoint |
| ---- | --------- | -------- |
| npm/stdio | stdin/stdout | N/A (pipe) |
| HTTP | POST | `/mcp` |
| SSE | GET/POST | `/sse`, `/messages` |
| Health | GET | `/health` |

### Authentication

**stdio mode:** No client auth needed (local process). BC API uses OAuth client credentials from env vars.

**HTTP mode:**

```http
X-API-Key: <your-api-key>
```

or

```http
Authorization: Bearer <jwt-token>
```

### MCP Methods

```text
initialize          - Protocol handshake
tools/list          - List available tools
tools/call          - Execute a tool
resources/list      - List available resources
resources/read      - Read a resource
prompts/list        - List available prompts (protocol 2025-03-26+)
prompts/get         - Get a prompt template (protocol 2025-03-26+)
```

### Example: Initialize

```bash
curl -X POST https://your-server.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0"}
    }
  }'
```

### Example: Call a Tool

```bash
curl -X POST https://your-server.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "list_records",
      "arguments": {
        "resource": "customers",
        "filter": "city eq '\''Seattle'\''",
        "top": 10
      }
    }
  }'
```

---

## Tools (14)

### API Context Management

| Tool | Description | Type |
| ---- | ----------- | ---- |
| `list_bc_api_contexts` | Discover available API routes (publisher/group/version) | read-only |
| `set_active_api` | Switch API context | state change |
| `get_active_api` | Get current API context | read-only |

### Company Management

| Tool | Description | Type |
| ---- | ----------- | ---- |
| `list_companies` | List all BC companies | read-only |
| `set_active_company` | Switch active company (requires UUID) | state change |
| `get_active_company` | Get current active company | read-only |

### Resource Discovery

| Tool | Description | Type |
| ---- | ----------- | ---- |
| `list_resources` | List all entity names in current API context | read-only |
| `get_odata_metadata` | Search OData metadata (entities, properties, relationships) | read-only |
| `get_resource_schema` | Get detailed entity schema (fields, types, keys) | read-only |

### CRUD Operations

| Tool | Description | Type |
| ---- | ----------- | ---- |
| `list_records` | Query records with OData filter/sort/page/expand | read-only |
| `create_record` | Create a new record | destructive |
| `update_record` | Update an existing record (ETag support) | destructive |
| `delete_record` | Permanently delete a record | destructive |
| `find_records_by_field` | Find records by exact field value match | read-only |

---

## OData Query Parameters

Used with `list_records` tool. See [odata-parameters.md](odata-parameters.md) for full reference.

| Parameter | Example | Description |
| --------- | ------- | ----------- |
| `filter` | `city eq 'Seattle'` | Filter conditions |
| `select` | `id,displayName,email` | Fields to return |
| `orderby` | `displayName asc` | Sort order |
| `top` | `20` | Max records |
| `skip` | `40` | Records to skip (pagination) |
| `expand` | `salesOrderLines` | Include related entities |

### Filter Examples

```text
city eq 'Seattle'
totalSalesAmount gt 10000
orderDate ge 2025-01-01
contains(displayName, 'Smith')
city eq 'Seattle' and blocked eq false
startswith(number, 'C00')
```

---

## Error Responses

MCP errors use JSON-RPC error format:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "details": "Required parameter 'resource' is missing"
    }
  }
}
```

Tool execution errors return `isError: true`:

```json
{
  "content": [{
    "type": "text",
    "text": "{\"error\": true, \"code\": \"BC_AUTH_ERROR\", \"message\": \"...\", \"suggestion\": \"...\"}"
  }],
  "isError": true
}
```

See [error-catalog.md](error-catalog.md) for the complete error code reference.

---

## Health Check

```bash
curl https://your-server.azurecontainerapps.io/health
```

```json
{
  "status": "healthy",
  "timestamp": "2026-03-04T12:00:00.000Z"
}
```

---

## Protocol Versions

| Version | Clients | Features |
| ------- | ------- | -------- |
| `2024-11-05` | Copilot Studio | Tools, Resources |
| `2025-03-26` | Claude Desktop, Claude Code, Azure AI Foundry | Tools, Resources, Prompts, Completions |

The server auto-negotiates protocol version with clients.

---

## Related Documentation

- [OData Parameters](odata-parameters.md) - Full query parameter reference
- [Error Catalog](error-catalog.md) - Error codes and troubleshooting
- [MCP Client Setup](../MCP_CLIENT_SETUP.md) - Client configuration guide
- [MCP Protocol Specification](https://modelcontextprotocol.io) - Official spec
