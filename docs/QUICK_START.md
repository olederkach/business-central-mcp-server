# Quick Start Guide

Get connected to Business Central in under 5 minutes.

---

## Option A: npm (Developer Mode)

For local AI assistants — Claude Desktop, Claude Code, Cursor, Cline.

### 1. Run with npx (no install)

```bash
npx business-central-mcp-server --stdio
```

Or install globally:

```bash
npm install -g business-central-mcp-server
business-central-mcp-server --stdio
```

### 2. Configure your MCP client

**Claude Desktop** — add to `claude_desktop_config.json`:

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

**Claude Code** — create `.mcp.json` in your project root:

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

### 3. Test it

Ask your AI assistant:

```text
List the top 10 customers from Business Central
```

The assistant will use the `list_records` tool to fetch customer data.

See [MCP Client Setup](MCP_CLIENT_SETUP.md) for Cursor, Cline, and other clients.

---

## Option B: Azure (Enterprise Mode)

For cloud AI clients — Claude.ai, Copilot Studio, Azure AI Foundry.

### 1. Deploy to Azure

```bash
git clone https://github.com/olederkach/business-central-mcp-server.git
cd business-central-mcp-server
```

See [Deployment Guide](DEPLOYMENT.md) for the full walkthrough, including:

- Azure AD app registration (unified for OAuth and BC API access)
- Azure Container Apps deployment
- GitHub Actions CI/CD workflow

### 2. Connect your AI client

**Claude.ai (OAuth):**

```text
Claude.ai > Settings > MCP Servers > Add Custom
  Name: Business Central
  URL: https://<your-server>.azurecontainerapps.io/mcp
  Client ID: <your-azure-client-id>
  Client Secret: <your-azure-client-secret>
```

Claude.ai auto-discovers OAuth endpoints and redirects you to sign in.

**Copilot Studio (OAuth Dynamic Discovery):**

```text
Copilot Studio > Knowledge > Add knowledge > MCP
  Name: BC-MCP-Server
  URL: https://<your-server>.azurecontainerapps.io/mcp
  Authentication: OAuth 2.0 > Dynamic discovery
  Client ID: <your-azure-client-id>
  Client Secret: <your-azure-client-secret>
  Scope: api://<your-azure-client-id>/MCP.Access
```

See [Copilot Studio Setup](COPILOT_STUDIO_COMPLETE_SETUP.md) for the complete guide.

**Azure AI Foundry (API Key):**

```text
Settings > Connections > + New connection > MCP
  Endpoint: https://<your-server>.azurecontainerapps.io/mcp
  Authentication: API Key (X-API-Key header)
```

See [Azure AI Foundry Setup](azure-ai-foundry/QUICK_SETUP.md) for the complete guide.

### 3. Verify

Open your AI client's chat and ask:

```text
List the top 10 customers from Business Central
```

---

## Getting Your Credentials

1. **Azure AD App Registration** -- Register an app in Azure Portal > App registrations
2. **API Permissions** -- Add `Dynamics 365 Business Central > API.ReadWrite.All` (Application permission)
3. **Admin Consent** -- Grant admin consent for the permission
4. **Client Secret** -- Create under Certificates & secrets
5. **Tenant ID** -- Found on the app registration Overview page
6. **Company ID** -- Use the `list_companies` tool after connecting, or find it in BC Admin Center

For OAuth mode (Claude.ai, Copilot Studio), you also need to expose an API scope (`MCP.Access` under Expose an API) and register redirect URIs for your MCP clients. See [Deployment Guide](DEPLOYMENT.md) for details.

---

## Available Tools (14)

### API Context Management

```text
list_bc_api_contexts  - List available API contexts
set_active_api        - Switch API context
get_active_api        - Get current API context
```

### Company Management

```text
list_companies        - List all BC companies
set_active_company    - Switch active company
get_active_company    - Get current company
```

### Resource Discovery

```text
list_resources        - List all entity names
get_odata_metadata    - Search OData schema
get_resource_schema   - Get entity fields & types
```

### CRUD Operations

```text
list_records          - Query records (filtering, sorting, pagination)
create_record         - Create new record
update_record         - Update existing record
delete_record         - Delete record
find_records_by_field - Find records by field value
```

---

## Common OData Filters

Use these with `list_records`:

```text
city eq 'Seattle'
city eq 'Seattle' or city eq 'Portland'
totalSalesAmount gt 10000
orderDate ge 2025-01-01
startswith(displayName, 'John')
contains(displayName, 'Smith')
city eq 'Seattle' and totalSalesAmount gt 10000
```

See [OData Parameters](api-reference/odata-parameters.md) for the full reference.

---

## Troubleshooting

### "Authentication failed"

- **npm mode**: Verify `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, and `BC_TENANT_ID`
- **Enterprise (API Key)**: Also check `MCP_API_KEYS` and `X-API-Key` header
- **Enterprise (OAuth)**: Verify `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and redirect URIs

### "Company not found"

Run `list_companies` to get available company IDs, then use `set_active_company` or set `BC_COMPANY_ID`.

### "No tools available" in Copilot Studio UI

Expected with MCP protocol 2024-11-05. Tools work at runtime -- test from the chat interface.

### "Could not discover authorization server metadata"

Verify the server is running with `AUTH_MODE=oauth` and `MCP_SERVER_URL` is set correctly.

---

## Next Steps

- [MCP Client Setup](MCP_CLIENT_SETUP.md) -- Configure additional MCP clients
- [Deployment Guide](DEPLOYMENT.md) -- Azure deployment and app registration
- [Copilot Studio Setup](COPILOT_STUDIO_COMPLETE_SETUP.md) -- Copilot Studio integration
- [API Reference](api-reference/README.md) -- OData parameters, errors, limits
- [Architecture](ARCHITECTURE.md) -- Technical design and decisions
