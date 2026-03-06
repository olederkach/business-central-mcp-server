# OAuth 2.0 Dynamic Client Registration (DCR)

## Overview

The MCP server supports OAuth 2.0 Dynamic Client Registration (RFC 7591), enabling **Dynamic Discovery** authentication in Microsoft Copilot Studio and other OAuth clients. DCR allows clients to automatically discover OAuth configuration and register themselves without manual credential exchange.

---

## How It Works

When an OAuth client (such as Copilot Studio) connects using Dynamic Discovery, this sequence occurs:

1. **Protected Resource Metadata** -- The client fetches `/.well-known/oauth-protected-resource` (RFC 9728) to learn which authorization server protects the MCP endpoint.
2. **Authorization Server Metadata** -- The client fetches `/.well-known/oauth-authorization-server` (RFC 8414) to discover the authorize, token, and registration endpoints.
3. **Dynamic Client Registration** -- The client calls `POST /oauth/register` (RFC 7591) to register itself and receive a `client_id` and `client_secret`.
4. **Authorization** -- The client redirects the user to `/authorize`, which proxies the request to Azure AD.
5. **Token Exchange** -- The client exchanges the authorization code at `/token`, which proxies the request to Azure AD.
6. **Authenticated MCP Calls** -- The client uses the resulting Bearer token for all subsequent MCP requests.

```
Client (e.g., Copilot Studio)
  |
  |  1. GET /.well-known/oauth-protected-resource
  |     --> learns authorization server URL
  |
  |  2. GET /.well-known/oauth-authorization-server
  |     --> learns /authorize, /token, /oauth/register endpoints
  |
  |  3. POST /oauth/register (public, no auth required)
  |     --> receives client_id & client_secret
  |
  |  4. Redirect to /authorize --> proxied to Azure AD
  |     --> user signs in
  |
  |  5. POST /token (code exchange) --> proxied to Azure AD
  |     --> receives access token
  |
  |  6. POST /mcp with Bearer token
  |     --> authenticated MCP calls
  v
MCP Server --> Business Central API
```

---

## Discovery Endpoints

The server exposes 7 discovery endpoint paths to cover all probing patterns used by different MCP clients:

| Endpoint | Standard | Purpose |
| -------- | -------- | ------- |
| `/.well-known/oauth-authorization-server` | RFC 8414 | Authorization server metadata |
| `/.well-known/oauth-authorization-server/mcp` | RFC 8414 | Same, scoped to `/mcp` resource |
| `/.well-known/openid-configuration` | OpenID Connect | OpenID Connect discovery |
| `/.well-known/openid-configuration/mcp` | OpenID Connect | Same, scoped to `/mcp` resource |
| `/mcp/.well-known/openid-configuration` | OpenID Connect | Same, sub-path variant |
| `/.well-known/oauth-protected-resource` | RFC 9728 | Protected resource metadata |
| `/.well-known/oauth-protected-resource/mcp` | RFC 9728 | Same, scoped to `/mcp` resource |

All discovery endpoints are public (no authentication required) and rate-limited.

### Authorization Server Metadata Response

The authorization server metadata document points to the server's own OAuth proxy endpoints (not directly to Azure AD):

```json
{
  "issuer": "https://<your-server>.azurecontainerapps.io",
  "authorization_endpoint": "https://<your-server>.azurecontainerapps.io/authorize",
  "token_endpoint": "https://<your-server>.azurecontainerapps.io/token",
  "registration_endpoint": "https://<your-server>.azurecontainerapps.io/oauth/register",
  "jwks_uri": "https://login.microsoftonline.com/<your-tenant-id>/discovery/v2.0/keys",
  "scopes_supported": ["openid", "profile", "email", "MCP.Access"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["client_secret_post"]
}
```

The `/authorize` and `/token` endpoints proxy requests to Azure AD, adding the server's own client credentials. This allows the MCP server to act as an OAuth intermediary.

### Protected Resource Metadata Response

```json
{
  "resource": "https://<your-server>.azurecontainerapps.io/mcp",
  "authorization_servers": ["https://<your-server>.azurecontainerapps.io"],
  "scopes_supported": ["api://<your-client-id>/.default", "openid"],
  "bearer_methods_supported": ["header"]
}
```

---

## Registration Endpoint

### `POST /oauth/register`

**Public endpoint** -- no authentication required. Rate-limited to 30 requests per 15 minutes per IP.

```http
POST /oauth/register
Content-Type: application/json

{
  "redirect_uris": [
    "https://global.consent.azure-apim.net/redirect/<your-connector-slug>"
  ],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "client_name": "Copilot Studio Agent",
  "scope": "openid profile email MCP.Access"
}
```

**Response (HTTP 201):**

```json
{
  "client_id": "mcp_a1b2c3d4e5f6...",
  "client_secret": "base64url-encoded-secret",
  "client_id_issued_at": 1234567890,
  "client_secret_expires_at": 1266187890,
  "redirect_uris": ["https://global.consent.azure-apim.net/redirect/<your-connector-slug>"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "client_secret_post"
}
```

### Redirect URI Validation

The registration endpoint validates redirect URIs:

- **Allowed:** `https://` URLs, `http://localhost` or `http://127.0.0.1` (development), custom schemes for native apps
- **Blocked:** `http://` URLs (except localhost), invalid URLs, relative URLs

### Client Secret Expiration

- Default expiration: 1 year from issue date
- Clients must re-register before expiration
- Expired clients are rejected during token exchange

---

## Client Management (Admin)

Authenticated endpoints for managing registered clients:

```bash
# List all registered clients
curl https://<your-server>.azurecontainerapps.io/oauth/clients \
  -H "Authorization: Bearer <your-token>"

# Delete a registered client
curl -X DELETE https://<your-server>.azurecontainerapps.io/oauth/clients/<client-id> \
  -H "Authorization: Bearer <your-token>"
```

---

## Configuration

DCR uses the same environment variables as OAuth mode. No additional configuration is needed beyond what is described in the [Deployment Guide](DEPLOYMENT.md).

Key variables:

| Variable | Description |
| -------- | ----------- |
| `AUTH_MODE` | Must be `oauth` |
| `AZURE_TENANT_ID` | Entra ID tenant ID |
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration client secret |
| `MCP_SERVER_URL` | Public URL of the server (used in discovery documents) |
| `MCP_OAUTH_REQUIRED_SCOPE` | Required scope in access tokens (default: `MCP.Access`) |

DCR reuses your existing Azure AD app registration. No separate app registration is needed for DCR.

---

## Testing

### Test Discovery

```bash
# Authorization server metadata
curl https://<your-server>.azurecontainerapps.io/.well-known/oauth-authorization-server | jq

# Protected resource metadata
curl https://<your-server>.azurecontainerapps.io/.well-known/oauth-protected-resource | jq
```

### Test Registration

```bash
curl -X POST https://<your-server>.azurecontainerapps.io/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "redirect_uris": ["https://example.com/callback"],
    "grant_types": ["authorization_code"],
    "client_name": "Test Client"
  }' | jq
```

Expected: HTTP 201 with `client_id` and `client_secret`.

---

## Troubleshooting

### "Could not discover authorization server metadata"

- Verify `AUTH_MODE=oauth` is set on the server
- Verify `MCP_SERVER_URL` matches the public URL of the server
- Confirm the server is running and reachable

### "GetDynamicClientRegistrationResultAsync failed"

- The `POST /oauth/register` endpoint must be accessible without authentication
- Check server logs for DCR-related errors

### "Rate limit exceeded"

- The registration endpoint allows 30 failed requests per 15 minutes per IP
- Wait for the window to expire or restart the container app

### "Invalid redirect_uri"

- Redirect URIs must use HTTPS (except localhost for development)
- Check that the URI format is valid

---

## Related Documentation

- [Copilot Studio Setup](COPILOT_STUDIO_COMPLETE_SETUP.md) -- Primary consumer of DCR
- [Deployment Guide](DEPLOYMENT.md) -- Azure deployment and OAuth configuration
- [MCP Client Setup](MCP_CLIENT_SETUP.md) -- All MCP client configurations

---

**RFC Compliance:** RFC 7591 (DCR), RFC 8414 (OAuth Authorization Server Metadata), RFC 9728 (OAuth Protected Resource Metadata), OpenID Connect Discovery 1.0
