# Microsoft Copilot Studio - Complete Setup Guide

Complete guide for connecting Business Central MCP Server to Microsoft Copilot Studio. The primary integration method is **OAuth with Dynamic Discovery**.

---

## Table of Contents

1. [Quick Start (OAuth Dynamic Discovery)](#quick-start-oauth-dynamic-discovery)
2. [Azure AD App Registration Requirements](#azure-ad-app-registration-requirements)
3. [How Dynamic Discovery Works](#how-dynamic-discovery-works)
4. [Alternative: Manual OAuth Configuration](#alternative-manual-oauth-configuration)
5. [Alternative: API Key Authentication](#alternative-api-key-authentication)
6. [Server Environment Variables for MCS](#server-environment-variables-for-mcs)
7. [Known Limitations](#known-limitations)
8. [Available Tools (14)](#available-tools-14)
9. [Testing and Verification](#testing-and-verification)
10. [Troubleshooting](#troubleshooting)

---

## Quick Start (OAuth Dynamic Discovery)

### Prerequisites

- Microsoft Copilot Studio access
- Business Central MCP Server deployed with `AUTH_MODE=oauth`
- Azure AD app registration configured (see [requirements below](#azure-ad-app-registration-requirements))

### Steps

1. Open **Copilot Studio** > **Knowledge** > **Add knowledge** > **Model Context Protocol (MCP)**
2. Enter connection details:
   - **Name:** `BC-MCP-Server`
   - **URL:** `https://<your-server>.azurecontainerapps.io/mcp`
3. Select authentication: **OAuth 2.0** > **Dynamic discovery**
4. Enter OAuth credentials:
   - **Client ID:** `<your-azure-client-id>`
   - **Client Secret:** `<your-azure-client-secret>`
   - **Scope:** `api://<your-azure-client-id>/MCP.Access`
5. Click **Connect**
6. Copilot Studio probes the server's discovery endpoints, registers itself via Dynamic Client Registration (DCR), and redirects you to Azure AD for login
7. After successful login, the connection is established

---

## Azure AD App Registration Requirements

For Copilot Studio (MCS) to work with OAuth Dynamic Discovery, the Azure AD app registration must be configured as follows:

### Application Permissions

- **Dynamics 365 Business Central** > `API.ReadWrite.All` (granted with admin consent)

### Delegated Scope

- Expose an API scope on the app registration (e.g., `MCP.Access`)
- The full scope identifier will be `api://<your-azure-client-id>/MCP.Access`

### Redirect URIs

The following redirect URIs must be registered on the app registration. If a URI is missing, Azure AD returns an `AADSTS50011` error that includes the expected URI — copy it from the error and add it.

- `https://global.consent.azure-apim.net/redirect/<your-connector-slug>`
- `https://token.botframework.com/.auth/web/redirect`

**Important:** The connector slug in the `global.consent.azure-apim.net` redirect URI is derived from the **tool name** you assign in Copilot Studio. For example, a tool named `Business Central MCP` produces a slug like `cont-5fbusiness-20central-20mcp-5f<hash>`. If you rename the tool or create a new connection with a different name, the redirect URI changes and must be re-added to the app registration. When this happens, Azure AD returns `AADSTS50011` — copy the exact redirect URI from the error message and add it to the app registration under **Authentication** > **Web** > **Redirect URIs**.

---

## How Dynamic Discovery Works

When Copilot Studio connects to the MCP server using Dynamic Discovery, the following sequence occurs:

1. **Resource metadata** -- MCS fetches `/.well-known/oauth-protected-resource/mcp` (RFC 9728) to learn which authorization server protects the MCP endpoint.
2. **Authorization server metadata** -- MCS fetches `/.well-known/oauth-authorization-server` (RFC 8414) to discover the authorize, token, and registration endpoints.
3. **Dynamic Client Registration** -- MCS calls `POST /oauth/register` (DCR, RFC 7591) to register itself and receive a `client_id`.
4. **Authorization** -- MCS redirects the user to `/authorize`, which proxies the request to Azure AD.
5. **Token exchange** -- MCS exchanges the authorization code at `/token`, which proxies the request to Azure AD.
6. **Authenticated MCP calls** -- MCS uses the resulting Bearer token for all subsequent MCP requests.

The server exposes 7 discovery endpoint paths to cover all probing patterns that MCS may use during this flow.

---

## Alternative: Manual OAuth Configuration

If Dynamic Discovery is not available in your version of Copilot Studio, configure OAuth manually with these values:

| Field | Value |
|-------|-------|
| **Authorization URL** | `https://<your-server>.azurecontainerapps.io/authorize` |
| **Token URL** | `https://<your-server>.azurecontainerapps.io/token` |
| **Client ID** | `<your-azure-client-id>` |
| **Client Secret** | `<your-azure-client-secret>` |
| **Scope** | `api://<your-azure-client-id>/.default openid` |

---

## Alternative: API Key Authentication

For simpler setups where user-level audit logging is not required:

1. Deploy the server with `AUTH_MODE=api-key`
2. In Copilot Studio, add a custom header instead of OAuth:
   - **Header Name:** `X-API-Key`
   - **Header Value:** `<your-mcp-api-key>`

This approach is simpler to configure but does not provide user identity tracking or per-user audit trails.

---

## Server Environment Variables for MCS

The following environment variables must be set on the Azure Container App for OAuth mode:

| Variable | Description | Example |
|----------|-------------|---------|
| `AUTH_MODE` | Authentication mode | `oauth` |
| `AZURE_TENANT_ID` | Azure AD tenant ID | `<your-azure-tenant-id>` |
| `AZURE_CLIENT_ID` | Azure AD app client ID (OAuth proxy) | `<your-azure-client-id>` |
| `AZURE_CLIENT_SECRET` | Azure AD app client secret (OAuth proxy) | `<your-azure-client-secret>` |
| `MCP_SERVER_URL` | Public URL of the MCP server | `https://<your-server>.azurecontainerapps.io` |
| `MCP_OAUTH_REQUIRED_SCOPE` | Required OAuth scope | `MCP.Access` |
| `BC_TENANT_ID` | Business Central tenant ID | `<your-bc-tenant-id>` |
| `BC_CLIENT_ID` | Business Central API client ID | `<your-bc-client-id>` |
| `BC_CLIENT_SECRET` | Business Central API client secret | `<your-bc-client-secret>` |
| `BC_ENVIRONMENT_NAME` | Business Central environment | `<your-bc-environment>` |
| `BC_COMPANY_ID` | Default Business Central company ID | `<your-bc-company-id>` |

**Note:** When using a unified app registration for both the OAuth proxy and Business Central API access, `AZURE_CLIENT_ID` and `BC_CLIENT_ID` will be the same value, and `AZURE_CLIENT_SECRET` and `BC_CLIENT_SECRET` will be the same value.

---

## Known Limitations

### "No tools available" in UI

Copilot Studio UI may show "No tools available" and "No resources available" on the connection setup page. This is expected behavior with MCP protocol `2024-11-05`. Tools work correctly at runtime when invoked from the chat interface.

### Prompts/Inputs Not Available

The "Inputs" feature (MCP Prompts) requires protocol `2025-03-26` or newer. Copilot Studio currently uses protocol `2024-11-05`, which does not support prompts. This will become available when Copilot Studio upgrades its MCP protocol version.

### Protocol Compatibility Matrix

| MCP Protocol | Copilot Studio Support   | Tools                         | Prompts (Inputs) |
|--------------|--------------------------|-------------------------------|------------------|
| `2024-11-05` | Supported (current)      | 14 tools available at runtime | Not supported    |
| `2025-03-26` | Not yet supported by MCS | 14 tools                      | Available        |

The server automatically negotiates the protocol version with the connecting client.

---

## Available Tools (14)

1. **list_bc_api_contexts** -- List available API contexts
2. **set_active_api** -- Switch API context
3. **get_active_api** -- Get current API context
4. **list_companies** -- List all BC companies
5. **set_active_company** -- Switch active company
6. **get_active_company** -- Get current company
7. **list_resources** -- List all entity names
8. **get_odata_metadata** -- Search OData metadata
9. **get_resource_schema** -- Get entity schema
10. **list_records** -- Query entity records (primary tool)
11. **create_record** -- Create new record
12. **update_record** -- Update existing record
13. **delete_record** -- Delete record
14. **find_records_by_field** -- Find records by field value

---

## Testing and Verification

### Health Check

```bash
curl https://<your-server>.azurecontainerapps.io/health
```

Expected response:

```json
{"status": "healthy", "timestamp": "..."}
```

### MCP Initialize

```bash
curl -X POST https://<your-server>.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-oauth-token>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0"}
    }
  }'
```

### Tools List

```bash
curl -X POST https://<your-server>.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-oauth-token>" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}'
```

Expected: JSON response containing all 14 tools.

### In-Chat Test

In the Copilot Studio chat, ask:

```
List the top 10 customers from Business Central
```

The agent should invoke the `list_records` tool and return customer data.

---

## Troubleshooting

### "Could not discover authorization server metadata"

**Cause:** The server's discovery endpoints are not responding correctly.

**Fix:**

- Verify `AUTH_MODE=oauth` is set on the container app
- Verify `MCP_SERVER_URL` is set and matches the public URL of the server
- Confirm the server is running and reachable

### "Failed to login / GetDynamicClientRegistrationResultAsync failed"

**Cause:** The DCR endpoint is not publicly accessible or is returning errors.

**Fix:**

- The `POST /oauth/register` endpoint must be accessible without authentication
- Check server logs for DCR-related errors

### "AADSTS50011 redirect_uri mismatch"

**Cause:** The redirect URI that Copilot Studio sends is not registered in the Azure AD app registration. This happens when you create a new MCP connection or rename an existing tool in Copilot Studio, because the redirect URI includes a slug derived from the tool name (e.g., `cont-5fbusiness-20central-20mcp-5f<hash>`).

**Fix:**

1. Copy the exact redirect URI from the error message (it starts with `https://global.consent.azure-apim.net/redirect/...`)
2. Go to **Azure Portal** > **App registrations** > your app > **Authentication** > **Web** > **Redirect URIs**
3. Add the URI and click **Save**
4. Go back to Copilot Studio and click **Retry**

### "Too Many Failed Authentication Attempts"

**Cause:** The server's rate limiter has locked out the client after repeated failed attempts.

**Fix:**

- Restart the container app, or wait 15 minutes for the lockout to expire

### "Authentication_InvalidCredentials"

**Cause:** The Business Central API credentials are invalid.

**Fix:**

- Verify `BC_CLIENT_ID` and `BC_CLIENT_SECRET` are correct
- Confirm the app registration has the required BC API permissions

### "No tools available"

**Cause:** Expected behavior with MCP protocol `2024-11-05`.

**Fix:**

- This is not a real error. Test from the Copilot Studio chat interface instead of the connection setup page.
- Ask a question like "List customers from Business Central" to confirm tools are working.
