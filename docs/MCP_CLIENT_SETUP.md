# MCP Client Setup

Configure the Business Central MCP Server with any MCP-compatible client.

---

## npm Mode (stdio)

For local AI assistants that communicate over stdin/stdout.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "business-central": {
      "command": "npx",
      "args": ["-y", "business-central-mcp-server", "--stdio"],
      "env": {
        "BC_TENANT_ID": "<your-tenant-id>",
        "BC_CLIENT_ID": "<your-client-id>",
        "BC_CLIENT_SECRET": "<your-client-secret>",
        "BC_ENVIRONMENT_NAME": "Sandbox",
        "BC_COMPANY_ID": "<your-company-id>"
      }
    }
  }
}
```

Config file location:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Claude Code

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "business-central": {
      "command": "npx",
      "args": ["-y", "business-central-mcp-server", "--stdio"],
      "env": {
        "BC_TENANT_ID": "<your-tenant-id>",
        "BC_CLIENT_ID": "<your-client-id>",
        "BC_CLIENT_SECRET": "<your-client-secret>",
        "BC_ENVIRONMENT_NAME": "Sandbox",
        "BC_COMPANY_ID": "<your-company-id>"
      }
    }
  }
}
```

Add `.mcp.json` to your `.gitignore` to protect credentials.

### Cursor

Add to Cursor's MCP settings (Settings > MCP Servers):

```json
{
  "mcpServers": {
    "business-central": {
      "command": "npx",
      "args": ["-y", "business-central-mcp-server", "--stdio"],
      "env": {
        "BC_TENANT_ID": "<your-tenant-id>",
        "BC_CLIENT_ID": "<your-client-id>",
        "BC_CLIENT_SECRET": "<your-client-secret>",
        "BC_ENVIRONMENT_NAME": "Sandbox",
        "BC_COMPANY_ID": "<your-company-id>"
      }
    }
  }
}
```

### Cline (VS Code)

Add to Cline's MCP configuration:

```json
{
  "mcpServers": {
    "business-central": {
      "command": "npx",
      "args": ["-y", "business-central-mcp-server", "--stdio"],
      "env": {
        "BC_TENANT_ID": "<your-tenant-id>",
        "BC_CLIENT_ID": "<your-client-id>",
        "BC_CLIENT_SECRET": "<your-client-secret>",
        "BC_ENVIRONMENT_NAME": "Sandbox",
        "BC_COMPANY_ID": "<your-company-id>"
      }
    }
  }
}
```

### CLI Arguments

You can also pass credentials as CLI arguments instead of environment variables:

```bash
business-central-mcp-server --stdio \
  --tenantId <your-tenant-id> \
  --clientId <your-client-id> \
  --clientSecret <your-client-secret> \
  --environment Sandbox \
  --companyId <your-company-id>
```

---

## HTTP Mode (Enterprise)

For cloud AI clients connecting to a deployed server over HTTP/SSE.

### Connection Parameters

| Parameter | Value |
| --------- | ----- |
| Endpoint URL | `https://your-server.azurecontainerapps.io/mcp` |
| Method | POST |
| Content-Type | application/json |
| Authentication | `X-API-Key` header or Bearer token |

### Copilot Studio

See [COPILOT_STUDIO_COMPLETE_SETUP.md](COPILOT_STUDIO_COMPLETE_SETUP.md) for the complete guide.

### Azure AI Foundry

See [azure-ai-foundry/QUICK_SETUP.md](azure-ai-foundry/QUICK_SETUP.md) for the complete guide.

### Test with cURL

```bash
# 1. Health check
curl https://your-server.azurecontainerapps.io/health

# 2. Initialize MCP
curl -X POST https://your-server.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0"}
    },
    "id": 1
  }'

# 3. List available tools
curl -X POST https://your-server.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# 4. Call a tool (list customers)
curl -X POST https://your-server.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_records",
      "arguments": {
        "resource": "customers",
        "top": 10
      }
    },
    "id": 3
  }'
```

---

## Required Environment Variables

| Variable | Description |
| -------- | ----------- |
| `BC_TENANT_ID` | Azure AD tenant GUID |
| `BC_CLIENT_ID` | App registration client ID |
| `BC_CLIENT_SECRET` | App registration client secret |
| `BC_ENVIRONMENT_NAME` | `Sandbox` or `Production` |
| `BC_COMPANY_ID` | Default company UUID (optional, auto-discovered) |

---

## Troubleshooting

### "Authentication failed"

1. Verify `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, and `BC_TENANT_ID` are correct
2. Confirm the Azure AD app has `Dynamics 365 Business Central > API.ReadWrite.All` permission
3. Ensure admin consent has been granted

### "No tools available"

- **stdio clients**: Restart the client after changing `.mcp.json`
- **Copilot Studio**: This is a known UI issue with MCP protocol 2024-11-05. Tools work at runtime.

### "Company not found"

Run `list_companies` first to discover available companies, then use `set_active_company` or set `BC_COMPANY_ID`.

### Test BC credentials directly

```bash
curl -X POST "https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token" \
  -d "client_id=<client-id>&client_secret=<secret>&scope=https://api.businesscentral.dynamics.com/.default&grant_type=client_credentials"
```
