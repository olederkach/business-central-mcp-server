# Azure AI Foundry - Quick Setup Guide

This guide shows you how to quickly configure your Business Central MCP Server for Azure AI Foundry Agent Service to solve the "No tools available" and "No resources available" problem.

## Problem

When configuring an MCP server in Azure AI Foundry, you see:
- **Inputs**: Optional inputs are available to add
- **Tools**: No tools available
- **Resources**: No resources available

## Solution

Use the `/mcp` endpoint with environment variables for easy configuration.

## Step 1: Configure Environment Variables in Azure Container App

Add these environment variables to your Azure Container App:

```bash
# Required: Business Central Configuration
BC_TENANT_ID=<your-tenant-id>
BC_ENVIRONMENT_NAME=Sandbox
BC_COMPANY_ID=<your-company-id>

# Required: Authentication (one of these)
## Option A: OAuth (Recommended)
AZURE_TENANT_ID=<your-tenant-id>
AZURE_CLIENT_ID=<your-client-id>
AZURE_CLIENT_SECRET=<your-client-secret>

## Option B: API Key
MCP_API_KEYS=<your-api-key>

# Required: BC API Authentication
BC_TENANT_ID=<your-tenant-id>
BC_CLIENT_ID=<your-client-id>
BC_CLIENT_SECRET=<your-bc-client-secret>
```

### How to Add Environment Variables in Azure Portal

1. Open Azure Portal → Container Apps
2. Navigate to your BC MCP Server container app
3. Go to **Settings** → **Environment variables**
4. Click **+ Add** and add each variable above
5. Click **Save**
6. The container app will restart automatically

## Step 2: Configure MCP Server in Azure AI Foundry

### Connection Configuration

1. Open Azure AI Foundry portal
2. Go to your workspace → **Settings** → **Connections**
3. Click **+ New connection**
4. Select **Model Context Protocol (MCP)**

**Connection Settings**:
```yaml
Name: Business Central MCP
Connection Type: MCP Server
Endpoint URL: https://your-container-app.azurecontainerapps.io/mcp
Authentication: Bearer Token
Token: <OAuth-token or leave empty if using API Key>
```

**If using API Key authentication**:
```yaml
Authentication: Custom Header
Header Name: X-API-Key
Header Value: <your-api-key-from-MCP_API_KEYS>
```

**If using OAuth authentication**:
```yaml
Authentication: OAuth 2.0
Token URL: https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token
Client ID: <your-app-registration-client-id>
Client Secret: <your-app-registration-client-secret>
Scope: api://<client-id>/MCP.Access
```

## Step 3: Create Agent and Add Tools

1. In Azure AI Foundry, go to **Agents**
2. Click **+ New Agent**
3. Configure agent name and description
4. Go to **Tools** tab
5. Click **+ Add Tool**
6. Select your "Business Central MCP" connection

**Now you should see**:
- **Inputs**: (none needed - configured via environment variables)
- **Tools**: 14 tools listed (list_companies, set_active_company, list_resources, list_records, create_record, etc.)
- **Resources**: 4 resources listed (Companies List, Entity Categories, API Contexts, Full API Metadata)

## Step 4: Test the Configuration

### Test 1: List Companies
```yaml
Tool: list_companies
Inputs: (none)
Expected Result: Returns all available BC companies
```

### Test 2: List Resources
```yaml
Tool: list_resources
Inputs: (none)
Expected Result: Returns all available entity categories (customers, items, salesOrders, etc.)
```

### Test 3: List Records
```yaml
Tool: list_records
Inputs:
  resource: customers
  top: 10
Expected Result: Returns first 10 customers from active company
```

## Troubleshooting

### Problem: "No tools available"

**Cause**: Azure AI Foundry can't connect to your MCP endpoint

**Solutions**:
1. Verify endpoint URL is correct: `https://your-app.azurecontainerapps.io/mcp/simple`
2. Check authentication is configured correctly
3. Test endpoint manually:
   ```bash
   curl -X POST https://your-app.azurecontainerapps.io/mcp/simple \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
   ```
4. Check Azure Container App logs for errors

### Problem: "No resources available"

**Cause**: Same as above - connection issue or resources/list not working

**Solutions**:
1. Test resources endpoint:
   ```bash
   curl -X POST https://your-app.azurecontainerapps.io/mcp/simple \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"resources/list","params":{}}'
   ```
2. Verify environment variables are set correctly

### Problem: "Missing BC_TENANT_ID environment variable"

**Cause**: Environment variables not configured

**Solution**:
1. Go to Azure Portal → Container Apps → Your app
2. Settings → Environment variables
3. Add BC_TENANT_ID, BC_ENVIRONMENT_NAME, BC_COMPANY_ID
4. Save and wait for restart

### Problem: "OAuth authentication failed"

**Cause**: OAuth configuration incorrect or tokens expired

**Solutions**:
1. Verify AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET are correct
2. Verify BC_TENANT_ID, BC_CLIENT_ID, BC_CLIENT_SECRET are correct
3. Check app registration has correct API permissions:
   - Dynamics 365 Business Central: `Financials.ReadWrite.All` (Delegated)
   - Your API: `MCP.Access` (Delegated) - if using OAuth for MCP endpoint
4. Check Application Insights logs for detailed OAuth errors

### Problem: Tools/Resources show up but don't work

**Cause**: BC API authentication failing

**Solution**:
1. Verify BC_CLIENT_ID and BC_CLIENT_SECRET are correct
2. Test BC API directly:
   ```bash
   # Get OAuth token
   TOKEN=$(curl -X POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token \
     -d "client_id={client_id}" \
     -d "client_secret={secret}" \
     -d "scope=https://api.businesscentral.dynamics.com/.default" \
     -d "grant_type=client_credentials" | jq -r .access_token)

   # Test BC API
   curl -H "Authorization: Bearer $TOKEN" \
     "https://api.businesscentral.dynamics.com/v2.0/{tenant}/{env}/api/v2.0/companies"
   ```

## Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BC_TENANT_ID` | Yes | - | Business Central tenant ID (GUID) |
| `BC_ENVIRONMENT_NAME` | Yes | - | BC environment name (e.g., "Sandbox", "Production") |
| `BC_COMPANY_ID` | Recommended | First company | Default company ID (GUID) |
| `BC_API_VERSION` | No | `v2.0` | BC API version |
| `BC_CLIENT_ID` | Yes | - | App registration client ID for BC API |
| `BC_CLIENT_SECRET` | Yes | - | App registration client secret for BC API |
| `AZURE_TENANT_ID` | If OAuth | - | Azure AD tenant ID (for MCP endpoint OAuth) |
| `AZURE_CLIENT_ID` | If OAuth | - | App registration client ID (for MCP endpoint OAuth) |
| `AZURE_CLIENT_SECRET` | If OAuth | - | App registration client secret (for MCP endpoint OAuth) |
| `MCP_API_KEYS` | If API Key | - | API keys for MCP endpoint (comma-separated, base64-encoded) |

## Why This Works

The `/mcp` endpoint:
- Supports **BOTH** URL-based config AND environment variables
- Tries URL config first, falls back to env vars automatically
- Returns proper MCP protocol responses
- Exposes 14 generic tools
- Exposes discoverable resources
- Works with Azure AI Foundry's expectations
- Caches resources for performance

Configuration options:
```
Mode 1: Environment variables (Recommended)
  Endpoint: https://your-server.azurecontainerapps.io/mcp
  Config: BC_TENANT_ID, BC_ENVIRONMENT_NAME, BC_COMPANY_ID env vars

Mode 2: URL-based (Advanced, multi-tenant)
  Endpoint: https://your-server.azurecontainerapps.io/mcp/{tenantId}/{env}/api/{version}/companies({companyId})
  Config: Everything in URL, no env vars needed
```

## Next Steps

1. Configure environment variables in Azure Container App
2. Add MCP connection in Azure AI Foundry
3. Create agent and add tools
4. Test basic operations (list_companies, list_resources)
5. Build your AI agent workflows!

## See Also

- [AGENT_SERVICE_SETUP.md](./AGENT_SERVICE_SETUP.md) - Detailed Azure AI Foundry integration guide
- [DYNAMIC_INPUT_DISCOVERY.md](./DYNAMIC_INPUT_DISCOVERY.md) - How resource discovery works
- [MCP Client Setup](../MCP_CLIENT_SETUP.md) - General MCP client configuration
