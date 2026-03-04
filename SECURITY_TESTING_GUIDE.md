# Security Testing Guide

This guide provides instructions for testing the security fixes deployed on October 25, 2025.

## Deployment Information

- **Deployment Date**: October 25, 2025, 19:02:54 UTC
- **Image**: `mcpbcserver1761139425.azurecr.io/mcp-bc-server:security-fixes-20251025-193346`
- **Revision**: `mcp-bc-server--0000010`
- **FQDN**: `mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io`

## Test 1: JWT Signature Verification

### ✅ Valid Token Test
**Purpose**: Verify legitimate users can authenticate

**Steps**:
1. Obtain a valid OAuth token from Microsoft Entra ID:
   ```bash
   # Use your OAuth client to get a token with scope: user_impersonation
   ```

2. Make a request with the valid token:
   ```bash
   curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
     -H "Authorization: Bearer YOUR_VALID_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}'
   ```

**Expected Result**: ✅ Request succeeds with 200 OK

### ⛔ Invalid Token Test
**Purpose**: Verify forged tokens are rejected

**Steps**:
1. Create a tampered token (modify the signature):
   ```bash
   TAMPERED_TOKEN="eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6Ik1HTHFqOThWTkxvWGFGZnBKQ0JwZ0I0SmFLcyIsImtpZCI6Ik1HTHFqOThWTkxvWGFGZnBKQ0JwZ0I0SmFLcyJ9.INVALID_PAYLOAD.INVALID_SIGNATURE"
   ```

2. Make a request with the tampered token:
   ```bash
   curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
     -H "Authorization: Bearer $TAMPERED_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}'
   ```

**Expected Result**: ⛔ Request fails with 401 Unauthorized
**Expected Log**: JWT signature verification failure

---

## Test 2: OData Injection Protection

### ✅ Valid OData Query Test
**Purpose**: Verify legitimate queries work correctly

**Steps**:
1. Make a request with valid OData parameters:
   ```bash
   curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
     -H "Authorization: Bearer YOUR_VALID_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "jsonrpc":"2.0",
       "id":"1",
       "method":"tools/call",
       "params":{
         "name":"get_customers",
         "arguments":{
           "$top":10,
           "$filter":"displayName eq '\''Contoso'\''",
           "$select":"id,displayName,email"
         }
       }
     }'
   ```

**Expected Result**: ✅ Request succeeds with customer data

### ⛔ OData Injection Attack Test
**Purpose**: Verify injection attempts are blocked

**Test 2a - SQL Injection Attempt**:
```bash
curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
  -H "Authorization: Bearer YOUR_VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":"1",
    "method":"tools/call",
    "params":{
      "name":"get_customers",
      "arguments":{
        "$filter":"displayName eq '\''test'\''; DROP TABLE customers--'\''"
      }
    }
  }'
```

**Expected Result**: ⛔ Request fails with validation error
**Expected Error**: "Filter contains suspicious patterns"

**Test 2b - XSS Injection Attempt**:
```bash
curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
  -H "Authorization: Bearer YOUR_VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":"1",
    "method":"tools/call",
    "params":{
      "name":"get_customers",
      "arguments":{
        "$filter":"displayName eq '\''<script>alert(1)</script>'\''"
      }
    }
  }'
```

**Expected Result**: ⛔ Request fails with validation error
**Expected Error**: "Filter contains suspicious patterns"

**Test 2c - Invalid Field Name**:
```bash
curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
  -H "Authorization: Bearer YOUR_VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":"1",
    "method":"tools/call",
    "params":{
      "name":"get_customers",
      "arguments":{
        "$select":"id,../../passwords"
      }
    }
  }'
```

**Expected Result**: ⛔ Request fails with validation error
**Expected Error**: "Invalid field name in $select"

**Test 2d - Excessive Expand Depth**:
```bash
curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
  -H "Authorization: Bearer YOUR_VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":"1",
    "method":"tools/call",
    "params":{
      "name":"get_sales_orders",
      "arguments":{
        "$expand":"customer($expand=orders($expand=items($expand=product)))"
      }
    }
  }'
```

**Expected Result**: ⛔ Request fails with validation error
**Expected Error**: "$expand depth exceeds maximum of 3"

---

## Test 3: Log Sanitization

### Purpose: Verify sensitive data is not logged

**Steps**:
1. Make a request with sensitive data in parameters:
   ```bash
   curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
     -H "Authorization: Bearer YOUR_VALID_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "jsonrpc":"2.0",
       "id":"1",
       "method":"tools/call",
       "params":{
         "name":"create_customer",
         "arguments":{
           "displayName":"Test Customer",
           "password":"SuperSecret123!",
           "api_key":"sk-1234567890abcdef",
           "credit_card":"4532-1234-5678-9010",
           "ssn":"123-45-6789"
         }
       }
     }'
   ```

2. Check Application Insights logs:
   ```bash
   az monitor app-insights query \
     --app 5be5d638-ffd5-4afd-8027-7d7b0f6e733e \
     --analytics-query "traces | where timestamp > ago(5m) | project timestamp, message"
   ```

**Expected Result**: ✅ Sensitive fields are replaced with `[REDACTED]`
**Logs Should Show**:
```json
{
  "displayName": "Test Customer",
  "password": "[REDACTED]",
  "api_key": "[REDACTED]",
  "credit_card": "[REDACTED]",
  "ssn": "[REDACTED]"
}
```

**Logs Should NOT Show**: Raw passwords, API keys, credit cards, or SSNs

---

## Test 4: Request Size Limits

### ✅ Normal Size Request Test
**Purpose**: Verify normal requests work

**Steps**:
```bash
# Create a 100KB payload (well under 500KB limit)
PAYLOAD=$(python3 -c "import json; print(json.dumps({'data': 'x' * 100000}))")

curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
  -H "Authorization: Bearer YOUR_VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

**Expected Result**: ✅ Request succeeds

### ⛔ Oversized Request Test
**Purpose**: Verify oversized requests are rejected

**Steps**:
```bash
# Create a 600KB payload (exceeds 500KB limit)
PAYLOAD=$(python3 -c "import json; print(json.dumps({'data': 'x' * 600000}))")

curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
  -H "Authorization: Bearer YOUR_VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

**Expected Result**: ⛔ Request fails with 413 Payload Too Large or 400 Bad Request
**Expected Error**: "Request payload too large"

---

## Test 5: Request Timeouts

### Purpose: Verify request timeouts prevent slowloris attacks

**Steps**:
```bash
# Simulate a slow request (send data very slowly)
curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
  -H "Authorization: Bearer YOUR_VALID_TOKEN" \
  -H "Content-Type: application/json" \
  --limit-rate 1K \
  -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}'
```

**Expected Result**: ⛔ Request times out after 30 seconds
**Expected Response**: Connection closed or timeout error

---

## Test 6: Rate Limiting

### Purpose: Verify brute force protection

**Steps**:
1. Make 6 failed authentication attempts rapidly:
   ```bash
   for i in {1..6}; do
     curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
       -H "Authorization: Bearer INVALID_TOKEN_$i" \
       -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}'
     echo "Attempt $i"
   done
   ```

**Expected Result**:
- ✅ First 5 attempts: Return 401 Unauthorized
- ⛔ 6th attempt: Return 429 Too Many Requests
- **Expected Message**: "Too many authentication attempts, please try again later"

2. Wait 15 minutes and try again:
   ```bash
   sleep 900  # Wait 15 minutes
   curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
     -H "Authorization: Bearer INVALID_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}'
   ```

**Expected Result**: ✅ Rate limit reset, request returns 401 (not 429)

---

## Test 7: Timing Attack Protection

### Purpose: Verify API key comparisons are constant-time

**Note**: This test requires specialized timing measurement tools and is difficult to perform manually.

**Conceptual Test**:
```bash
# Time how long invalid API key checks take
for i in {1..100}; do
  time curl -X POST https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io/mcp \
    -H "X-API-Key: wrong_key_$i" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}'
done
```

**Expected Result**: ✅ All requests take approximately the same time regardless of how close the API key is to the real one

---

## Monitoring Security Events

### Application Insights Queries

**1. Failed Authentication Attempts**:
```kusto
traces
| where timestamp > ago(24h)
| where message contains "authentication failed" or message contains "401"
| project timestamp, message, severityLevel
| order by timestamp desc
```

**2. OData Validation Failures**:
```kusto
traces
| where timestamp > ago(24h)
| where message contains "OData" and message contains "validation"
| project timestamp, message, severityLevel
| order by timestamp desc
```

**3. Rate Limit Hits**:
```kusto
traces
| where timestamp > ago(24h)
| where message contains "429" or message contains "Too many"
| project timestamp, message, severityLevel
| order by timestamp desc
```

**4. JWT Verification Failures**:
```kusto
traces
| where timestamp > ago(24h)
| where message contains "JWT" and (message contains "invalid" or message contains "expired")
| project timestamp, message, severityLevel
| order by timestamp desc
```

---

## Security Incident Response

If any test fails unexpectedly or you suspect a security breach:

1. **Immediately notify**: oleksandr.derkach@Oleksandr Derkach.com
2. **Check Application Insights** for anomalous activity
3. **Review container logs**:
   ```bash
   az containerapp logs show --name mcp-bc-server --resource-group mcp-bc-server-rg --tail 1000
   ```
4. **If needed, roll back** to previous revision:
   ```bash
   az containerapp revision activate \
     --name mcp-bc-server \
     --resource-group mcp-bc-server-rg \
     --revision mcp-bc-server--0000009
   ```

---

## Automated Testing Script

You can automate these tests using the following script:

```bash
#!/bin/bash

# Set your valid OAuth token here
VALID_TOKEN="YOUR_VALID_TOKEN"
BASE_URL="https://mcp-bc-server.gentlemushroom-8e0d2b05.eastus.azurecontainerapps.io"

echo "=== Security Tests ==="
echo ""

echo "Test 1: Valid Authentication"
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -X POST "$BASE_URL/mcp" \
  -H "Authorization: Bearer $VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}'

echo ""
echo "Test 2: Invalid Token (should be 401)"
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -X POST "$BASE_URL/mcp" \
  -H "Authorization: Bearer INVALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}'

echo ""
echo "Test 3: OData SQL Injection (should fail)"
curl -s -X POST "$BASE_URL/mcp" \
  -H "Authorization: Bearer $VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"get_customers","arguments":{"$filter":"name eq '"'"'test'"'"'; DROP TABLE--"}}}' \
  | grep -o "error" && echo "✅ Blocked" || echo "⛔ Not blocked"

echo ""
echo "Test 4: Health Check"
curl -s "$BASE_URL/health" | grep -o "healthy" && echo "✅ Healthy" || echo "⛔ Unhealthy"

echo ""
echo "=== Tests Complete ==="
```

Save as `test-security.sh` and run:
```bash
chmod +x test-security.sh
./test-security.sh
```

---

## Success Criteria

All security fixes are working correctly if:

✅ Valid JWT tokens are accepted
✅ Invalid/tampered JWT tokens are rejected
✅ OData injection attempts are blocked
✅ Sensitive data is redacted in logs
✅ Oversized requests are rejected
✅ Slow requests time out
✅ Rate limiting prevents brute force
✅ API key timing is constant

---

**Generated**: 2025-10-25
**Deployment**: mcp-bc-server--0000010
**Security Fixes**: CRITICAL (1), HIGH (3), MEDIUM (2)
