# Business Central MCP Server

Model Context Protocol server for Microsoft Dynamics 365 Business Central.

> Connect AI agents to Business Central data — from a single `npx` command for developers to a full Azure deployment for enterprise.

[![Version](https://img.shields.io/badge/version-2.2.7-blue)](CHANGELOG.md)
[![MCP Protocol](https://img.shields.io/badge/MCP-2024--11--05-green)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-purple)](LICENSE)

---

## Two Ways to Use

| &nbsp; | npm (Developer) | Azure (Enterprise) |
| --- | --- | --- |
| **Use case** | Local AI assistants, development, prototyping | Production cloud services, multi-tenant |
| **Transport** | stdio (stdin/stdout) | HTTP/SSE |
| **Clients** | Claude Desktop, Claude Code, Cline, Cursor | Copilot Studio, Azure AI Foundry, web apps |
| **Setup time** | 2 minutes | 15 minutes |
| **Infrastructure** | None (runs locally) | Azure Container Apps |

---

## Quick Start: npm (Developer Mode)

### Option A: npx (no install)

```bash
npx business-central-mcp-server --stdio
```

### Option B: Global install

```bash
npm install -g business-central-mcp-server
business-central-mcp-server --stdio
```

### Configure in Claude Desktop

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

### Configure in Claude Code

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

### CLI Arguments

You can pass configuration as CLI arguments instead of environment variables:

```bash
business-central-mcp-server --stdio \
  --tenantId <tenant-id> \
  --clientId <client-id> \
  --clientSecret <client-secret> \
  --environment Sandbox \
  --companyId <company-id>
```

### Getting Your Credentials

1. **Azure AD App Registration** — Register an app in Azure Portal > App registrations
2. **API Permissions** — Add `Dynamics 365 Business Central > API.ReadWrite.All` (Application permission)
3. **Client Secret** — Create under Certificates & secrets
4. **Tenant ID** — Found on the app registration Overview page
5. **Company ID** — Use the `list_companies` tool after connecting, or find it in BC Admin Center

---

## Quick Start: Azure (Enterprise Mode)

For production deployments serving cloud AI clients (Copilot Studio, Azure AI Foundry).

### Prerequisites

- Azure subscription
- Business Central tenant with API access
- Azure AD app registration

### Deploy

```bash
git clone https://github.com/olederkach/business-central-mcp-server.git
cd business-central-mcp-server

# Configure
export RESOURCE_GROUP=mcp-bc-server-rg
export LOCATION=eastus
export BC_TENANT_ID=your-tenant-id
export BC_CLIENT_ID=your-client-id
export BC_CLIENT_SECRET=your-client-secret

# Deploy to Azure Container Apps
chmod +x scripts/deployment/deploy-to-azure.sh
./scripts/deployment/deploy-to-azure.sh
```

What gets deployed:

- Azure Container App (auto-scaling, 1-10 replicas)
- Azure Container Registry
- Azure Key Vault (secrets management)
- Application Insights (telemetry)
- Managed Identity

### Connect Copilot Studio

```
Settings > Knowledge > Add knowledge > Model Context Protocol
  Name: Business Central MCP
  URL: https://your-server.azurecontainerapps.io/mcp
  Authentication: X-API-Key header
  Value: your-api-key
```

### Connect Azure AI Foundry

```
Settings > Connections > + New connection > Model Context Protocol (MCP)
  Endpoint: https://your-server.azurecontainerapps.io/mcp
  Authentication: Bearer Token or API Key
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the complete guide.

---

## Tools (14)

### API Context Management

| Tool | Description | Type |
|------|-------------|------|
| `list_bc_api_contexts` | Discover available API routes | read-only |
| `set_active_api` | Switch publisher/group/version | state change |
| `get_active_api` | Get current API context | read-only |

### Company Management

| Tool | Description | Type |
|------|-------------|------|
| `list_companies` | List all BC companies | read-only |
| `set_active_company` | Switch active company | state change |
| `get_active_company` | Get current company | read-only |

### Resource Discovery

| Tool | Description | Type |
|------|-------------|------|
| `list_resources` | List all entity names | read-only |
| `get_odata_metadata` | Search OData schema | read-only |
| `get_resource_schema` | Get entity fields & types | read-only |

### CRUD Operations

| Tool | Description | Type |
|------|-------------|------|
| `list_records` | Query with OData filter/sort/page | read-only |
| `create_record` | Create new record | destructive |
| `update_record` | Patch existing record (ETag support) | destructive |
| `delete_record` | Permanently remove record | destructive |
| `find_records_by_field` | Search by field value | read-only |

### Example

```
User: "Show me customers in Atlanta"

Tool call: list_records
Arguments: { "resource": "customers", "filter": "city eq 'Atlanta'", "top": 10 }
```

---

## Multi-API Support

Business Central exposes multiple API surfaces. This server supports all of them:

- **Standard BC API v2.0** — customers, vendors, items, salesOrders, etc.
- **Microsoft Extended APIs** — automation, analytics
- **Custom ISV APIs** — third-party extension APIs

Switch at runtime:

```
set_active_api({ publisher: "microsoft", group: "automation", version: "v1.0" })
```

---

## Configuration

### Environment Variables

#### Required (both modes)

| Variable | Description |
|----------|-------------|
| `BC_TENANT_ID` | Azure AD tenant GUID |
| `BC_CLIENT_ID` | App registration client ID |
| `BC_CLIENT_SECRET` | App registration client secret |
| `BC_ENVIRONMENT_NAME` | `Sandbox` or `Production` |

#### Recommended

| Variable | Default | Description |
|----------|---------|-------------|
| `BC_COMPANY_ID` | *(auto-discovered)* | Default company UUID |

#### Enterprise (HTTP mode only)

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_API_KEYS` | — | Comma-separated API keys for client auth |
| `AUTH_MODE` | `api-key` | `api-key` or `oauth` |
| `CORS_ORIGINS` | `*` | Allowed origins |
| `PORT` | `3005` | HTTP port |
| `KEY_VAULT_NAME` | — | Azure Key Vault for secrets |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | — | Monitoring |
| `RATE_LIMIT_ENABLED` | `true` | Enable rate limiting |

See [.env.example](.env.example) for the complete reference.

---

## Architecture

```
                    ┌──────────────────────────────┐
                    │        AI Clients             │
                    │  Claude Desktop/Code (stdio)  │
                    │  Copilot Studio (HTTP)        │
                    │  Azure AI Foundry (HTTP)      │
                    └──────────┬───────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │ stdio          │                │ HTTP/SSE
              ▼                │                ▼
    ┌─────────────────┐        │    ┌─────────────────────────┐
    │  stdio-server    │        │    │  Express + MCP Protocol  │
    │  (npm/npx)       │        │    │  (Azure Container Apps)  │
    │                  │        │    │                          │
    │  14 Generic      │        │    │  API Key / OAuth Auth    │
    │  Tools           │        │    │  Rate Limiting           │
    └────────┬────────┘        │    │  App Insights            │
             │                 │    └───────────┬──────────────┘
             │                 │                │
             └────────────────┼────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  Business Central API         │
                    │  OAuth 2.0 (client_credentials)│
                    │  OData V4.0                   │
                    └──────────────────────────────┘
```

### Key Components

| Component | npm Mode | Enterprise Mode |
|-----------|----------|-----------------|
| Transport | stdio (stdin/stdout) | HTTP + SSE |
| Tools | 14 generic tools | 14 generic + entity-specific |
| Auth (BC) | OAuth client_credentials | OAuth client_credentials |
| Auth (clients) | N/A (local process) | API Key or OAuth |
| State | In-process (session map) | Per-request |
| Monitoring | stderr logs | Application Insights |
| Secrets | env vars / CLI args | Azure Key Vault |

---

## Development

### Local Setup

```bash
git clone https://github.com/olederkach/business-central-mcp-server.git
cd business-central-mcp-server
npm install

# Configure
cp .env.example .env
# Edit .env with your BC credentials

# Development (stdio)
npm run dev:stdio

# Development (HTTP)
npm run dev:http

# Production build
npm run build
npm start
```

### Build & Pack

```bash
npm run build          # Compile TypeScript
npm pack               # Create .tgz for local install
npm link               # Symlink for local development
```

### Project Structure

```
src/
├── index.ts                  # Entry point (stdio/HTTP dispatcher)
├── version.ts                # Centralized version constant
├── config.ts                 # CLI args + env var parsing
├── server.ts                 # Express HTTP server
├── api/                      # API context & company management
├── auth/                     # Authentication (OAuth, API Key, DCR)
├── bc/                       # Business Central client & metadata
├── config/                   # Environment validation
├── errors/                   # Error codes & builders
├── mcp/                      # MCP protocol handler & prompts
├── middleware/                # Express middleware
├── monitoring/               # App Insights & analytics
├── openapi/                  # OpenAPI spec generation
├── tools/                    # Tool definitions & executors
│   ├── generic-tools.ts      # 14 generic tool definitions
│   ├── generic-executor.ts   # Generic tool executor
│   ├── executor.ts           # Entity-specific executor (HTTP mode)
│   └── generator.ts          # Tool generator from metadata
├── transports/               # stdio, SSE, Copilot SSE servers
└── utils/                    # Logger, validators, sanitizer
```

---

## Troubleshooting

### "No tools available" in Copilot Studio UI

Expected with MCP protocol 2024-11-05. Tools work at runtime — test from the chat interface.

### "Authentication failed"

- **npm mode**: Verify `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, and `BC_TENANT_ID`
- **Enterprise**: Also check `MCP_API_KEYS` and `X-API-Key` header

### "Cannot connect to Business Central"

1. Verify Azure AD app registration has `Dynamics 365 Business Central > API.ReadWrite.All`
2. Confirm the app has admin consent granted
3. Test the credentials directly:

   ```bash
   curl -X POST "https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token" \
     -d "client_id=<client-id>&client_secret=<secret>&scope=https://api.businesscentral.dynamics.com/.default&grant_type=client_credentials"
   ```

### "Company not found"

Run `list_companies` first to get available company IDs, then use `set_active_company` or set `BC_COMPANY_ID`.

---

## Documentation

| Document | Description |
|----------|-------------|
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Azure deployment guide |
| [QUICK_START.md](docs/QUICK_START.md) | 5-minute quick start |
| [Copilot Studio Setup](docs/COPILOT_STUDIO_COMPLETE_SETUP.md) | Copilot Studio integration |
| [Azure AI Foundry](docs/azure-ai-foundry/QUICK_SETUP.md) | Azure AI Foundry setup |
| [API Reference](docs/api-reference/README.md) | OData parameters, errors, limits |
| [Architecture](docs/architecture/README.md) | ADRs and design decisions |
| [SECURITY.md](SECURITY.md) | Security policies |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## License

MIT — see [LICENSE](LICENSE)

---

## Links

- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [BC API Documentation](https://learn.microsoft.com/dynamics365/business-central/dev-itpro/api-reference/v2.0/)
- [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/)

---

Built for the Business Central and AI community.
