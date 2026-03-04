# OAuth 2.0 Dynamic Client Registration (DCR) - Setup Guide

## Overview

Version 2.2.0 adds support for OAuth 2.0 Dynamic Client Registration (RFC 7591), enabling **"Dynamic discovery"** authentication mode in Microsoft Copilot Studio.

## What is DCR?

Dynamic Client Registration allows OAuth clients (like Copilot Studio) to automatically:
1. Discover your OAuth configuration via `/.well-known/openid-configuration`
2. Register themselves as authorized clients via `/oauth/register`
3. Receive `client_id` and `client_secret` automatically
4. Connect without manual configuration

## Benefits

✅ **Zero manual configuration** - Copilot Studio auto-discovers and registers
✅ **Faster setup** - No need to manually exchange client IDs and secrets
✅ **Standards compliant** - Implements RFC 7591 and OpenID Connect Discovery
✅ **Secure** - Validates redirect URIs, rate limits registration attempts
✅ **Enterprise ready** - Supports client management and revocation

## Architecture

```
┌─────────────────────┐
│ Copilot Studio      │
└──────────┬──────────┘
           │
           │ 1. GET /.well-known/openid-configuration
           ├──────────────────────────────────────────┐
           │                                          │
           │ ◄─── Returns OAuth endpoints             │
           │                                          │
           │ 2. POST /oauth/register                  │
           ├──────────────────────────────────────────┤
           │ {                                        │
           │   "redirect_uris": ["..."],              │
           │   "grant_types": ["authorization_code"]  │
           │ }                                        │
           │                                          │
           │ ◄─── Returns client_id & client_secret   │
           │                                          │
           │ 3. OAuth flow via Azure AD               │
           ├──────────────────────────────────────────┤
           │                                          │
           │ 4. Use MCP server with Bearer token      │
           └──────────────────────────────────────────┘
```

## Configuration

### Environment Variables

DCR uses the same Azure AD configuration as existing OAuth:

```bash
# Required for DCR
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-app-registration-client-id

# Optional
MCP_SERVER_URL=https://mcp-bc-server.yourdomain.com
```

**Note**: `MCP_SERVER_URL` is auto-detected from the request if not specified.

### No Additional App Registration Needed

DCR **reuses your existing Azure AD app registration** used for Business Central API access. No new app registration is required.

## Endpoints

### 1. OpenID Connect Discovery

**Public endpoint** - No authentication required

```http
GET /.well-known/openid-configuration
```

**Response:**
```json
{
  "issuer": "https://mcp-bc-server.yourdomain.com",
  "authorization_endpoint": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
  "token_endpoint": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
  "jwks_uri": "https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys",
  "registration_endpoint": "https://mcp-bc-server.yourdomain.com/oauth/register",
  "scopes_supported": ["openid", "profile", "email", "MCP.Access"],
  "response_types_supported": ["code", "token", "id_token"],
  ...
}
```

### 2. Dynamic Client Registration

**Rate limited** - 5 requests per 15 minutes per IP

```http
POST /oauth/register
Content-Type: application/json

{
  "redirect_uris": [
    "https://copilotstudio.microsoft.com/oauth/callback"
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
  "redirect_uris": ["https://copilotstudio.microsoft.com/oauth/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "client_secret_post"
}
```

### 3. Client Management (Admin)

**Requires authentication** - X-API-Key or Bearer token

```http
# List all registered clients
GET /oauth/clients
Authorization: Bearer {token}

# Delete a registered client
DELETE /oauth/clients/{client_id}
Authorization: Bearer {token}
```

## Security

### Redirect URI Validation

The registration endpoint validates redirect URIs to prevent open redirect attacks:

✅ **Allowed:**
- `https://` URLs (production)
- `http://localhost` or `http://127.0.0.1` (development)
- Custom schemes for native apps (e.g., `com.microsoft.copilot://`)

❌ **Blocked:**
- `http://` URLs (except localhost)
- Invalid URLs
- Relative URLs

### Rate Limiting

- **Registration endpoint**: 5 requests per 15 minutes per IP
- **Discovery endpoint**: 100 requests per 15 minutes per IP (cached)

### Client Secret Expiration

- Default expiration: **1 year** from issue date
- Clients must re-register before expiration
- Expired clients are rejected during token exchange

### Storage Security

- Registered clients stored in `data/registered-clients.json`
- File permissions: Owner read/write only
- Client secrets stored in plain text (consider encrypting for production)

## Using DCR with Copilot Studio

### Step 1: Configure MCP Server in Copilot Studio

1. Open your Copilot Studio agent
2. Click **"Add a Model Context Protocol server"**
3. Choose **"Add existing MCP server"**
4. Enter your MCP server URL:
   ```
   https://your-server.azurecontainerapps.io
   ```

### Step 2: Select Dynamic Discovery Authentication

1. Under **Authentication**, select **"OAuth 2.0"**
2. Choose **"Dynamic discovery"**
3. Copilot Studio will automatically:
   - Fetch `/.well-known/openid-configuration`
   - Register via `/oauth/register`
   - Store the client credentials
   - Connect to your MCP server

### Step 3: Verify Connection

Copilot Studio will show a success message with:
- ✅ Discovery successful
- ✅ Registration successful
- ✅ Tools available: 13

## Testing DCR Locally

### 1. Start the server

```bash
npm run dev
```

### 2. Test Discovery Endpoint

```bash
curl http://localhost:3005/.well-known/openid-configuration | jq
```

**Expected output:** Full OpenID configuration with `registration_endpoint`

### 3. Test Registration Endpoint

```bash
curl -X POST http://localhost:3005/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "redirect_uris": ["https://example.com/callback"],
    "grant_types": ["authorization_code"],
    "client_name": "Test Client"
  }' | jq
```

**Expected output:** HTTP 201 with `client_id` and `client_secret`

### 4. Verify Storage

```bash
cat data/registered-clients.json | jq
```

**Expected output:** Array of registered clients

### 5. Test Client Management

```bash
# List clients
curl http://localhost:3005/oauth/clients \
  -H "X-API-Key: your-api-key" | jq

# Delete client
curl -X DELETE http://localhost:3005/oauth/clients/mcp_abc123 \
  -H "X-API-Key: your-api-key"
```

## Deployment to Azure

### Update Environment Variables

Ensure these are set in Azure Container Apps:

```bash
AZURE_TENANT_ID=<your-tenant-id>
AZURE_CLIENT_ID=<your-client-id>
MCP_SERVER_URL=https://your-server.azurecontainerapps.io
```

### Deploy New Version

```bash
# Build and push Docker image
az acr build --registry <your-acr-name> \
  --image mcp-bc-server:2.2.0 \
  --file Dockerfile .

# Update container app
az containerapp update \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --image <your-acr-name>.azurecr.io/mcp-bc-server:2.2.0
```

### Verify Deployment

```bash
# Test discovery endpoint
curl https://your-server.azurecontainerapps.io/.well-known/openid-configuration

# Check version
curl https://your-server.azurecontainerapps.io/info | jq .version
```

## Troubleshooting

### "registration_endpoint not found in discovery document"

**Cause**: Old version deployed or endpoint not accessible
**Solution**: Verify `/.well-known/openid-configuration` returns `registration_endpoint`

### "Invalid redirect_uri"

**Cause**: Redirect URI doesn't meet security requirements
**Solution**: Use HTTPS URLs or localhost for development

### "Rate limit exceeded"

**Cause**: Too many registration attempts
**Solution**: Wait 15 minutes or increase rate limit in `middleware/rate-limit.ts`

### "AZURE_TENANT_ID or AZURE_CLIENT_ID not set"

**Cause**: Missing environment variables
**Solution**: Set required environment variables in `.env` or Azure Container Apps

### "Failed to persist client registration"

**Cause**: Insufficient permissions on `data/` directory
**Solution**: Ensure write permissions: `chmod 755 data/`

## Migration from Manual OAuth

If you're currently using manual OAuth configuration in Copilot Studio:

### Before (Manual OAuth)
1. Created app registration manually
2. Copied client ID and secret
3. Manually configured redirect URIs
4. Pasted credentials into Copilot Studio

### After (Dynamic Discovery)
1. Copilot Studio auto-discovers configuration
2. Auto-registers and receives credentials
3. No manual copy-paste needed

**Note**: Both approaches work. DCR is optional but provides better UX.

## Security Considerations

### Production Checklist

- [ ] Set `MCP_SERVER_URL` to production URL
- [ ] Enable HTTPS (required for production)
- [ ] Configure rate limiting appropriately
- [ ] Monitor `data/registered-clients.json` for unexpected entries
- [ ] Consider encrypting client secrets at rest
- [ ] Set up client secret rotation policy
- [ ] Enable audit logging for registration events
- [ ] Restrict `/oauth/clients` endpoint to admins only

### Recommended: Encrypt Client Secrets

Future enhancement - encrypt secrets using Azure Key Vault:

```typescript
// Pseudocode
const encryptedSecret = await keyVaultClient.encrypt(clientSecret);
client.client_secret = encryptedSecret;
```

## API Reference

### Discovery Document Schema

See: [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414.html)

### Registration Request Schema

See: [RFC 7591 - OAuth 2.0 Dynamic Client Registration Protocol](https://www.rfc-editor.org/rfc/rfc7591.html)

### Error Codes

| Error Code | Description |
|------------|-------------|
| `invalid_redirect_uri` | Redirect URI validation failed |
| `invalid_client_metadata` | Required field missing or invalid |
| `server_error` | Internal error during registration |

## Related Documentation

- [Copilot Studio Setup](./COPILOT_STUDIO_COMPLETE_SETUP.md) - Copilot Studio integration
- [Architecture](./ARCHITECTURE.md) - System architecture overview
- [Deployment Guide](./DEPLOYMENT.md) - Azure deployment

---

**Version**: 2.2.7
**Last Updated**: 2026-03-04
**RFC Compliance**: RFC 7591 (DCR), RFC 8414 (OAuth Metadata), OpenID Connect Discovery 1.0
