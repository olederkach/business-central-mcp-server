# MCP Client Setup

Configure the Business Central MCP Server with any MCP-compatible client.

---

## Prerequisites

- **Azure AD App Registration** with `Dynamics 365 Business Central > API.ReadWrite.All` permission and admin consent granted. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup instructions.
- **Business Central environment** with API access enabled (Sandbox or Production).

---

## npm Mode (stdio) -- Developer

For local AI assistants that communicate over stdin/stdout. No server deployment needed -- the MCP server runs as a child process on your machine.

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
        "BC_ENVIRONMENT_NAME": "<your-environment-name>",
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
        "BC_ENVIRONMENT_NAME": "<your-environment-name>",
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
        "BC_ENVIRONMENT_NAME": "<your-environment-name>",
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
        "BC_ENVIRONMENT_NAME": "<your-environment-name>",
        "BC_COMPANY_ID": "<your-company-id>"
      }
    }
  }
}
```

### CLI Arguments

You can pass credentials as CLI arguments instead of environment variables:

```bash
npx -y business-central-mcp-server --stdio \
  --tenantId <your-tenant-id> \
  --clientId <your-client-id> \
  --clientSecret <your-client-secret> \
  --environment <your-environment-name> \
  --companyId <your-company-id>
```

---

## HTTP Mode (Enterprise) -- Cloud AI Clients

For cloud AI clients connecting to a deployed MCP server over HTTP/SSE. The server must be deployed first (see [DEPLOYMENT.md](DEPLOYMENT.md)).

### Claude.ai (OAuth)

Claude.ai connects to remote MCP servers via OAuth 2.0. The server must be running with `AUTH_MODE=oauth`.

1. Go to **Claude.ai > Settings > MCP Servers > Add Custom**.
2. Fill in the connection details:
   - **Name**: `Business Central`
   - **URL**: `https://<your-server>.azurecontainerapps.io/mcp`
   - **Client ID**: `<your-azure-client-id>`
   - **Client Secret**: `<your-azure-client-secret>`
3. Claude.ai auto-discovers the OAuth endpoints via `/.well-known/openid-configuration` on the server.
4. Click **Connect**. You will be redirected to the Microsoft login page.
5. After sign-in, Claude.ai has access to all 14 tools.

**Requirements:**

- The server must be running with `AUTH_MODE=oauth`.
- The Azure AD app registration must have the redirect URI for Claude.ai configured.

### Microsoft Copilot Studio (OAuth -- Dynamic Discovery)

This is the primary connection method for Copilot Studio. The server must be running with `AUTH_MODE=oauth`.

1. Open **Copilot Studio > Agent > Knowledge > Add knowledge > MCP**.
2. Fill in:
   - **Name**: `BC-MCP-Server` (max 30 characters)
   - **URL**: `https://<your-server>.azurecontainerapps.io/mcp`
3. Under **Authentication**, select **OAuth 2.0** and choose **Dynamic discovery**.
4. Enter the credentials:
   - **Client ID**: `<your-azure-client-id>`
   - **Client Secret**: `<your-azure-client-secret>`
   - **Scope**: `api://<your-azure-client-id>/.default openid`
5. Copilot Studio auto-discovers the authorization and token endpoints via RFC 8414 / RFC 9728 discovery.
6. Copilot Studio calls the DCR (Dynamic Client Registration) endpoint to register itself.
7. The user signs in via an Azure AD popup.
8. The connection is established.

**Important notes:**

- The Copilot Studio redirect URI `https://global.consent.azure-apim.net/redirect/<your-connector-slug>` must be registered in the Azure AD app registration under **Authentication > Redirect URIs**.
- If you see "Could not discover authorization server metadata", verify that `AUTH_MODE=oauth` is set on the server.
- "No tools available" in the Copilot Studio UI is expected behavior with MCP protocol 2024-11-05. Tools are discovered and work correctly at runtime.

### Microsoft Copilot Studio (OAuth -- Manual)

Fallback method if Dynamic Discovery is not available in your Copilot Studio environment.

1. Follow the same steps as Dynamic Discovery above, but select **Manual** instead of **Dynamic discovery**.
2. Provide the endpoints explicitly:
   - **Authorization endpoint**: `https://<your-server>.azurecontainerapps.io/authorize`
   - **Token endpoint**: `https://<your-server>.azurecontainerapps.io/token`
3. Enter the same Client ID, Client Secret, and Scope as above.

### Microsoft Copilot Studio (API Key -- Legacy)

Simple API key authentication. The server must be running with `AUTH_MODE=api-key`.

1. Open **Copilot Studio > Agent > Knowledge > Add knowledge > MCP**.
2. Fill in:
   - **Name**: `BC-MCP-Server`
   - **URL**: `https://<your-server>.azurecontainerapps.io/mcp`
3. Under **Authentication**, select **API Key**.
4. Enter:
   - **Header name**: `X-API-Key`
   - **Value**: `<your-mcp-api-key>`

### Azure AI Foundry

See [azure-ai-foundry/QUICK_SETUP.md](azure-ai-foundry/QUICK_SETUP.md) for the complete setup guide.

---

## Authentication Modes Summary

| Client | Auth Method | Server `AUTH_MODE` | Protocol |
| ------ | ----------- | ------------------ | -------- |
| Claude Desktop | N/A (stdio, local) | N/A | 2025-03-26 |
| Claude Code | N/A (stdio, local) | N/A | 2025-03-26 |
| Claude.ai | OAuth 2.0 | `oauth` | 2025-11-25 |
| Copilot Studio | OAuth Dynamic Discovery | `oauth` | 2024-11-05 |
| Copilot Studio | API Key | `api-key` | 2024-11-05 |
| Azure AI Foundry | API Key or Bearer | `api-key` | 2025-03-26 |

---

## Architecture

```text
Client (Claude.ai / Copilot Studio)
  |  OAuth 2.0 (Authorization Code)
  v
MCP Server (/authorize, /token proxy)
  |  Client Credentials
  v
Business Central API
```

In **stdio mode**, the client spawns the MCP server as a child process and communicates directly over stdin/stdout. No OAuth flow is involved -- the server authenticates to Business Central using client credentials from environment variables.

In **HTTP mode**, the cloud client authenticates the user via OAuth 2.0. The MCP server proxies the authorization flow to Azure AD, then uses client credentials to call the Business Central API on behalf of the authenticated user.

---

## Required Environment Variables

These are configured on the server (HTTP mode) or passed to the child process (stdio mode).

| Variable | Description | Required |
| -------- | ----------- | -------- |
| `BC_TENANT_ID` | Azure AD tenant GUID | Yes |
| `BC_CLIENT_ID` | App registration client ID | Yes |
| `BC_CLIENT_SECRET` | App registration client secret | Yes |
| `BC_ENVIRONMENT_NAME` | Business Central environment (`Sandbox` or `Production`) | Yes |
| `BC_COMPANY_ID` | Default company UUID (auto-discovered if omitted) | No |
| `AUTH_MODE` | `oauth` or `api-key` (HTTP mode only) | HTTP only |
| `MCP_API_KEY` | API key value (when `AUTH_MODE=api-key`) | When api-key |

---

## Test with cURL

These examples use API key authentication. Replace the URL and key with your values.

```bash
# 1. Health check (no auth required)
curl https://<your-server>.azurecontainerapps.io/health
```

```bash
# 2. Initialize MCP session
curl -X POST https://<your-server>.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-mcp-api-key>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "curl-test", "version": "1.0"}
    },
    "id": 1
  }'
```

```bash
# 3. List available tools
curl -X POST https://<your-server>.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-mcp-api-key>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

```bash
# 4. Call a tool (list customers)
curl -X POST https://<your-server>.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-mcp-api-key>" \
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

## Troubleshooting

### "Authentication failed"

1. Verify `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, and `BC_TENANT_ID` are correct.
2. Confirm the Azure AD app has `Dynamics 365 Business Central > API.ReadWrite.All` permission.
3. Ensure admin consent has been granted for the permission.
4. Test credentials directly:

```bash
curl -X POST "https://login.microsoftonline.com/<your-tenant-id>/oauth2/v2.0/token" \
  -d "client_id=<your-client-id>&client_secret=<your-client-secret>&scope=https://api.businesscentral.dynamics.com/.default&grant_type=client_credentials"
```

### "No tools available"

- **stdio clients** (Claude Desktop, Claude Code, Cursor): Restart the client after changing configuration files.
- **Copilot Studio**: This is a known UI issue with MCP protocol 2024-11-05. The tools are not displayed in the Copilot Studio interface, but they are discovered and work correctly at runtime.

### "Company not found"

1. Run the `list_companies` tool first to discover available company names and IDs.
2. Use `set_active_company` to switch to the correct company, or set `BC_COMPANY_ID` in your environment variables.

### "Could not discover authorization server metadata"

This error occurs in Copilot Studio when it cannot reach the OAuth discovery endpoints.

1. Verify the server is running and accessible at the configured URL.
2. Confirm `AUTH_MODE=oauth` is set on the server.
3. Check that `https://<your-server>.azurecontainerapps.io/.well-known/oauth-authorization-server` returns a valid JSON response.

### "Rate limit exceeded"

Business Central API has rate limits. If you hit them:

1. Reduce the number of concurrent requests.
2. Add delays between bulk operations.
3. Use `$top` and `$filter` parameters to reduce result set sizes.
