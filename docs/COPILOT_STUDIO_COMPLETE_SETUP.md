# Microsoft Copilot Studio - Complete Setup Guide

**Version:** 2.2.7+
**Last Updated:** 2025-10-27
**Protocol:** MCP 2024-11-05 (Copilot Studio Compatible)

Complete guide for connecting Business Central MCP Server to Microsoft Copilot Studio with dual authentication (API Key + OAuth).

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication Architecture](#authentication-architecture)
3. [Step-by-Step Setup](#step-by-step-setup)
4. [Known Limitations](#known-limitations)
5. [Testing & Verification](#testing--verification)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Connection Details

| Field | Value |
|-------|-------|
| **Connection Name** | `BC-MCP-Server` (max 30 chars) |
| **URL** | `https://your-server.azurecontainerapps.io/mcp` |
| **Header Name** | `X-API-Key` |
| **Header Value** | `<your-api-key>` |

### 30-Second Setup

1. Open Copilot Studio → Knowledge → **Add knowledge** → **Model Context Protocol (MCP)**
2. Enter connection name: `BC-MCP-Server`
3. Enter URL (above)
4. Add authentication header: `X-API-Key` with value (above)
5. Click **Connect** → Test in chat

✅ **Tools will work immediately** (even if UI shows "No tools available")

---

## Authentication Architecture

### Dual Authentication System (v2.2.6+)

The MCP server supports **two authentication methods simultaneously**:

#### 1. API Key Authentication
**Purpose:** MCP protocol discovery (tools/list, resources/list)
**Used By:** Copilot Studio UI to discover capabilities
**User Context:** None (system-level discovery)

```
X-API-Key: <your-api-key>
```

#### 2. OAuth 2.0 Authentication
**Purpose:** User-initiated tool execution (runtime)
**Used By:** Copilot Studio when users ask questions
**User Context:** Yes (audit logging with user identity)

```
Authorization: Bearer <jwt-token-from-copilot-studio>
```

### How It Works

```
┌─────────────────┐
│ Copilot Studio  │
└────────┬────────┘
         │
         ├─── Discovery (API Key) ──────────┐
         │    • initialize                   │
         │    • tools/list                   │
         │    • resources/list               │
         │                                   │
         └─── Runtime (OAuth Token) ─────┐  │
              • tools/call (list_records)│  │
              • User: john@contoso.com   │  │
              • Audit log enabled        │  │
                                        │  │
                                        ▼  ▼
                                ┌──────────────────┐
                                │   MCP Server     │
                                │  (Dual Auth)     │
                                └────────┬─────────┘
                                         │
                                         │ Always OAuth
                                         │ (Client Credentials)
                                         ▼
                                ┌──────────────────┐
                                │ Business Central │
                                │       API        │
                                └──────────────────┘
```

**Important:** Business Central API authentication is **ALWAYS OAuth** (client credentials), regardless of how users authenticate to the MCP server.

---

## Step-by-Step Setup

### Prerequisites

- Microsoft Copilot Studio access
- Business Central MCP Server deployed (v2.2.6+)
- API Key (provided above)
- Azure AD App Registration (for OAuth - already configured)

### Step 1: Create MCP Connection

1. Navigate to: **Copilot Studio** → **Knowledge** → **Add knowledge**
2. Select: **Model Context Protocol (MCP)**
3. Fill in details:

   ```
   Name: BC-MCP-Server
   URL: https://your-server.azurecontainerapps.io/mcp
   ```

4. Add authentication header:
   - Click **+ Add header**
   - **Name:** `X-API-Key`
   - **Value:** `<your-api-key>`

5. Click **Connect**

### Step 2: Configure OAuth (Optional - for user-level audit logging)

If you need user-level authentication and audit logging:

1. In connection settings, enable **OAuth 2.0**
2. Configure OAuth parameters:

   ```
   Authorization URL: https://login.microsoftonline.com/<your-tenant-id>/oauth2/v2.0/authorize
   Token URL: https://login.microsoftonline.com/<your-tenant-id>/oauth2/v2.0/token
   Client ID: <your-client-id>
   Client Secret: <your-client-secret>
   Scope: api://<your-client-id>/user_impersonation
   ```

### Step 3: Test Connection

1. Open your Copilot/Agent chat
2. Ask: **"List customers from Business Central"**
3. The tool will execute and return data ✅

---

## Known Limitations

### UI Display Issue (Protocol 2024-11-05)

**Issue:** Copilot Studio UI shows "No tools available" and "No resources available" in the connection setup page.

**Why:** Copilot Studio uses MCP protocol `2024-11-05`, which has different capability discovery than newer protocols. The UI doesn't recognize the response format.

**Impact:**
- ❌ Tools/Resources don't appear in setup UI
- ✅ **Tools work perfectly at runtime** (proven with General Ledger query)
- ✅ All 14 tools are functional
- ✅ All 5 resources are accessible

**Workaround:** Test tools from the agent chat interface, not the setup page.

### Protocol Compatibility Matrix

| MCP Protocol | Copilot Studio Support | Tools | Resources | Prompts (Inputs) |
|--------------|------------------------|-------|-----------|------------------|
| **2024-11-05** | ✅ Full Runtime | ✅ 14 tools | ✅ 5 resources | ❌ Not supported |
| **2025-03-26** | ❌ Not supported yet | N/A | N/A | N/A |

**Server Version:** 2.2.7+ automatically negotiates protocol version with Copilot Studio.

### Inputs (Prompts) Not Available

**Why:** The "Inputs" feature (MCP Prompts) was introduced in protocol `2025-03-26`. Copilot Studio uses `2024-11-05`, which doesn't support prompts.

**When Available:** When Copilot Studio upgrades to MCP protocol 2025-03-26 or newer.

---

## Testing & Verification

### Test 1: Health Check

```bash
curl https://your-server.azurecontainerapps.io/health
```

**Expected:**
```json
{"status":"healthy","timestamp":"2025-10-27T20:00:00.000Z"}
```

### Test 2: Server Info

```bash
curl https://your-server.azurecontainerapps.io/info
```

**Expected:**
```json
{
  "name": "Business Central MCP Server",
  "version": "2.2.7",
  "protocol": "MCP 2024-11-05",
  "features": {...}
}
```

### Test 3: MCP Initialize (API Key)

```bash
curl -X POST https://your-server.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

**Expected:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {"listChanged": true},
      "resources": {"subscribe": true, "listChanged": true}
    },
    "serverInfo": {
      "name": "business-central-mcp-server",
      "version": "2.2.7"
    }
  }
}
```

### Test 4: Tools List (API Key)

```bash
curl -X POST https://your-server.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

**Expected:** JSON with 14 tools

### Test 5: In-Chat Execution (OAuth)

In Copilot Studio chat, ask:

```
Please list the top 10 customers from Business Central
```

**Expected:** Copilot returns customer data with names, emails, cities, etc.

**What Happens:**
1. Copilot Studio gets OAuth token for the user
2. Sends `tools/call` with `list_records` tool
3. MCP server validates OAuth token
4. MCP server calls BC API (with BC OAuth)
5. Returns customer data
6. Audit log: User identity recorded

---

## Troubleshooting

### Issue: "No tools available" in UI

**Symptom:** Connection setup page shows "No tools available"

**Solution:** This is expected with protocol 2024-11-05. **Tools still work!** Test from chat instead.

**Verification:**
1. Open agent chat
2. Ask: "List customers"
3. Tool executes successfully ✅

### Issue: "Authentication required"

**Symptom:** Error: "Missing or invalid Authorization header"

**Solution:** Make sure API Key header is set correctly:
- Header name: `X-API-Key` (case-sensitive)
- Header value: Full key including `=` at the end

### Issue: "Connector name too long"

**Symptom:** Error: "Connector name cannot be longer than 30 characters"

**Solution:** Use shorter name: `BC-MCP-Server` (14 characters)

### Issue: OAuth scope error "insufficient_scope"

**Symptom:** Error: "Missing required scope: user_impersonation"

**Solution:** Already fixed in v2.2.7. Redeploy if using older version.

**Verify OAuth scope:**
```bash
az containerapp show --name mcp-bc-server --resource-group mcp-bc-server-rg \
  --query "properties.template.containers[0].env[?name=='MCP_OAUTH_REQUIRED_SCOPE']"
```

**Expected:** `"value": "user_impersonation"`

### Issue: Tools work but show "No resources available"

**Symptom:** Tools execute successfully, but resources section is empty

**Explanation:** Copilot Studio doesn't call `resources/list` for protocol 2024-11-05. Resources are accessible at runtime through tools like `list_resources`.

**Workaround:** Use tools instead:
- Ask: "What entities are available in Business Central?"
- Tool `list_resources` returns all entity names

---

## Available Tools (14 Generic Tools)

1. **list_bc_api_contexts** - List available API contexts
2. **set_active_api** - Switch API context
3. **get_active_api** - Get current API context
4. **list_companies** - List all BC companies
5. **set_active_company** - Switch active company
6. **get_active_company** - Get current company
7. **list_resources** - List all entity names
8. **get_odata_metadata** - Search OData metadata
9. **get_resource_schema** - Get entity schema
10. **list_records** - Query entity records (primary tool)
11. **create_record** - Create new record
12. **update_record** - Update existing record
13. **delete_record** - Delete record
14. **find_records_by_field** - Find records by field value

---

## Available Resources (5 Contextual Resources)

1. **bc://environment/info** - Current environment details
2. **bc://api/context** - Active API context
3. **bc://companies/list** - Available companies
4. **bc://entities/list** - Available entities
5. **bc://tools/guide** - Tool usage guide

---

## Security & Compliance

### Authentication Security

- **API Key:** Stored as Azure Container App secret
- **OAuth Token:** Validated with Microsoft public keys (JWKS)
- **BC API:** Always OAuth client credentials
- **Token Expiry:** 1 hour (auto-refresh by Copilot Studio)
- **Audit Logging:** All tool executions logged with user identity

### Compliance

- ✅ **SOC 2** - User-level audit trails
- ✅ **ISO 27001** - Token validation with public key cryptography
- ✅ **GDPR** - User identity tracked for data access
- ✅ **HIPAA** - Encryption in transit (HTTPS only)

### Network Security

- **Ingress:** HTTPS only (TLS 1.2+)
- **Authentication:** Required for all endpoints
- **Rate Limiting:** Enforced (prevents DoS)
- **Azure Private Link:** Supported (optional)

---

## Version History

### v2.2.7 (2025-10-27)
- ✅ Protocol version negotiation (2024-11-05 for Copilot Studio)
- ✅ Backwards compatibility with older MCP clients
- ✅ Conditional capabilities based on protocol version

### v2.2.6 (2025-10-27)
- ✅ Dual authentication (API Key + OAuth)
- ✅ Copilot Studio MCP discovery support
- ✅ User-level audit logging with OAuth

### v2.2.5 (2025-10-27)
- ✅ MCP Prompts (Inputs) implementation
- ✅ 5 prompt templates for common operations
- ⚠️ Only available with protocol 2025-03-26+

### v2.2.4 (2025-10-27)
- ✅ MCP Resources implementation
- ✅ 5 contextual resources for BC environment

---

## Support & Further Reading

- **Main README:** [../README.md](../README.md)
- **Troubleshooting:** [TROUBLESHOOTING_COPILOT_STUDIO.md](TROUBLESHOOTING_COPILOT_STUDIO.md)
- **DCR Setup (Alternative):** [DCR_SETUP_GUIDE.md](DCR_SETUP_GUIDE.md)
- **MCP Protocol Spec:** https://spec.modelcontextprotocol.io/

---

## Quick Reference Card

```text
┌───────────────────────────────────────────────────────┐
│        COPILOT STUDIO CONNECTION DETAILS               │
├───────────────────────────────────────────────────────┤
│ Name:    BC-MCP-Server                                 │
│ URL:     https://your-server.azurecontainerapps.io/mcp │
│ Header:  X-API-Key                                     │
│ Key:     <your-api-key>                                │
│                                                        │
│ Tools:   14 available (runtime works, UI may not show) │
│ Resources: 5 available                                 │
│ Prompts: Not supported (protocol 2024-11-05)           │
│                                                        │
│ Test:    "List customers from Business Central"        │
└───────────────────────────────────────────────────────┘
```

---

**Status:** ✅ Production Ready | **Version:** 2.2.7+ | **Protocol:** MCP 2024-11-05