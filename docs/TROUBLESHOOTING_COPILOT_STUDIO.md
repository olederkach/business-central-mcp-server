# 🔍 Troubleshooting: Copilot Studio Not Reaching MCP Server

**Issue**: Copilot Studio returns "SystemError" when trying to call MCP tools, but no logs appear in Container App or Application Insights.

**Symptoms**:
- Error: "Sorry, something went wrong. Error code: SystemError"
- No request logs in Application Insights
- No Container App logs for the failed request
- Direct API calls with curl work fine

---

## ✅ Verified Working (via curl)

The MCP server is **healthy and working correctly**:

```bash
# Health check: ✅ Working
curl https://<your-server-url>/health

# MCP initialize: ✅ Working
curl -X POST https://<your-server-url>/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# List vendors: ✅ Working (returns 7 vendors)
curl -X POST https://<your-server-url>/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_records","arguments":{"resource":"vendors","company_id":"<your-company-id>"}}}'
```

---

## ❌ Root Cause Analysis

Since the MCP server works correctly with direct curl requests but **no logs appear** when called from Copilot Studio, the request is **failing on Copilot Studio's side** before reaching the MCP server.

### Possible Causes:

#### 1. **API Key Header Not Configured**

**Check**: In Copilot Studio MCP Server configuration, verify the authentication header is set:

```
Header Name: X-API-Key
Header Value: <your-api-key>
```

**Location**: Copilot Studio → Settings → Generative AI → MCP Servers → Business Central MCP → Authentication

**Note**: The header name is **case-sensitive** - must be exactly `X-API-Key`

#### 2. **Wrong Authentication Method Selected**

**Check**: Verify authentication type in Copilot Studio:
- Should be: **API Key** (not OAuth, not None)
- If using OAuth, it requires different configuration

#### 3. **MCP Server URL Incorrect**

**Check**: Verify the exact URL in Copilot Studio configuration:

```
CORRECT: https://<your-server-url>/mcp
WRONG:   https://<your-server-url>
WRONG:   https://<your-server-url>/
```

**Important**: Must include `/mcp` endpoint

#### 4. **Copilot Studio MCP Integration Bug**

**Symptom**: Microsoft Copilot Studio's MCP integration is still in preview and may have bugs

**Workaround**: Try using **HTTP Action** instead of MCP Server integration:

1. Create a Power Automate Flow
2. Use HTTP action to call the MCP endpoint
3. Parse the JSON response
4. Return results to Copilot Studio

#### 5. **Network/Firewall Issue**

**Check**: Copilot Studio may be blocked from reaching Azure Container Apps

**Test**: Try accessing the health endpoint from Copilot Studio using an HTTP action:
```
GET https://<your-server-url>/health
```

If this fails, there's a network connectivity issue.

---

## 🔧 Step-by-Step Fix

### Option A: Verify Copilot Studio MCP Configuration

1. **Open Copilot Studio**
   - Go to Settings → Generative AI → MCP Servers

2. **Check MCP Server Configuration**
   ```
   Name: Business Central MCP
   URL: https://<your-server-url>/mcp
   ```

3. **Verify Authentication**
   ```
   Type: API Key
   Header Name: X-API-Key
   Header Value: <your-api-key>
   ```

4. **Test Connection**
   - Use Copilot Studio's "Test Connection" button
   - Should return: "Connection successful"

5. **Refresh Tools**
   - Click "Refresh Tools" or "Sync Tools"
   - Should discover 14 tools

### Option B: Use HTTP Action Workaround

If Copilot Studio MCP integration isn't working, use this workaround:

1. **Create Power Automate Flow**:
   ```
   Trigger: When Copilot Studio calls flow

   Action: HTTP Request
   - Method: POST
   - URI: https://<your-server-url>/mcp
   - Headers:
     - Content-Type: application/json
     - X-API-Key: <your-api-key>
   - Body:
     {
       "jsonrpc": "2.0",
       "id": 1,
       "method": "tools/call",
       "params": {
         "name": "@{triggerBody()?['toolName']}",
         "arguments": @{triggerBody()?['arguments']}
       }
     }

   Action: Parse JSON
   - Content: @{body('HTTP_Request')}
   - Schema: (auto-generate from sample)

   Action: Return to Copilot Studio
   - Result: @{body('Parse_JSON')?['result']}
   ```

2. **Call Flow from Copilot Studio**:
   - In your topic, add "Call an action"
   - Select your Power Automate flow
   - Pass tool name and arguments
   - Display the result

---

## 📊 Verification Checklist

Use this checklist to verify the configuration:

### MCP Server (✅ All Working)
- [x] Health endpoint responds: `/health`
- [x] MCP initialize works with API key
- [x] Tools list returns 14 tools
- [x] list_records returns vendors data
- [x] Logs flowing to Application Insights
- [x] Container App is running

### Copilot Studio (❌ Need to Check)
- [ ] MCP Server URL is exact: `https://<your-server-url>/mcp`
- [ ] Authentication type is: `API Key`
- [ ] Header name is: `X-API-Key` (case-sensitive)
- [ ] Header value is: `<your-api-key>`
- [ ] Test Connection succeeds
- [ ] Tools are visible (14 tools)
- [ ] Tool calls reach the MCP server (check logs)

---

## 🔎 Debugging Steps

### 1. Check if ANY request reaches the server

**Run this in Azure CLI:**
```bash
# Watch logs in real-time
az containerapp logs show \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --follow
```

**Then in Copilot Studio**: Try to call any tool

**Expected**: You should see log entries immediately
**Actual**: If NO logs appear, the request never reached the server

### 2. Check Application Insights for HTTP requests

**Run this query:**
```bash
az monitor app-insights query \
  --app mcp-bc-appinsights \
  --resource-group mcp-bc-server-rg \
  --analytics-query "requests | where timestamp > ago(1h) | order by timestamp desc | project timestamp, url, resultCode, success"
```

**Expected**: Should show recent HTTP POST requests to `/mcp`
**Actual**: If empty, requests aren't reaching the server

### 3. Test with Postman/Insomnia

Use a REST client to test the exact same request:

```
POST https://<your-server-url>/mcp

Headers:
Content-Type: application/json
X-API-Key: <your-api-key>

Body:
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_records",
    "arguments": {
      "resource": "vendors",
      "company_id": "<your-company-id>",
      "top": 10
    }
  }
}
```

**Expected**: Should return vendors list
**Result**: ✅ This works (already tested with curl)

---

## 📞 Next Steps

### Immediate Action Required:

1. **Verify Copilot Studio Configuration**
   - Check MCP Server URL (must end with `/mcp`)
   - Check authentication type (must be `API Key`)
   - Check header name (must be `X-API-Key` exactly)
   - Check header value (must match exactly)

2. **Test Connection in Copilot Studio**
   - Use built-in "Test Connection" feature
   - Should return connection successful

3. **Monitor Logs While Testing**
   - Open Azure Portal → Container App → Log Stream
   - Open second window with Copilot Studio
   - Try calling a tool
   - Watch for logs to appear in real-time

### If Still Not Working:

4. **Use HTTP Action Workaround**
   - Create Power Automate flow (see Option B above)
   - Call flow from Copilot Studio instead of MCP direct

5. **Contact Microsoft Support**
   - MCP integration is in preview
   - May need Microsoft support to diagnose Copilot Studio issue

---

## 📋 Configuration Reference

### Working Configuration (Tested with curl)

```
Endpoint: https://<your-server-url>/mcp
Method: POST
Content-Type: application/json
X-API-Key: <your-api-key>

Request Body:
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_records",
    "arguments": {
      "resource": "vendors",
      "company_id": "<your-company-id>"
    }
  }
}
```

### Expected Response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{...vendor data...}"
      }
    ]
  }
}
```

---

## ✅ Summary

**The MCP server is working perfectly** - all direct API calls succeed and return correct data.

**The issue is in Copilot Studio** - requests from Copilot Studio never reach the MCP server (no logs appear).

**Most likely cause**: Authentication header not configured in Copilot Studio MCP Server settings.

**Solution**: Verify and fix the Copilot Studio MCP Server configuration, specifically the API Key authentication header.

---

**Last Updated**: 2025-10-22 15:40 UTC
**Server Status**: ✅ Healthy and responding correctly
**Issue**: Copilot Studio configuration or integration bug
