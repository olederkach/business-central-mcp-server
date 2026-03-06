# Azure Key Vault Migration Guide

This guide explains how to migrate from environment variable secrets to Azure Key Vault with Managed Identity for enhanced security.

## Current State (Less Secure)

Currently, secrets are stored as Container App secrets and exposed as environment variables:

- `BC_CLIENT_SECRET` -- Business Central client secret
- `AZURE_CLIENT_SECRET` -- Azure AD client secret
- `MCP_API_KEYS` -- MCP API keys

**Risk**: If the container is compromised, all secrets are exposed via environment variables.

## Target State (More Secure)

After migration:

- Container App uses **System-Assigned Managed Identity**
- Secrets stored in **Azure Key Vault**
- Application retrieves secrets at runtime using Managed Identity
- No secrets in environment variables

**Benefits**:

- No plaintext secrets in configuration
- Centralized secret management
- Secret access auditing via Key Vault logs
- Automatic secret rotation support
- Per-identity access control

---

## Prerequisites

- Azure CLI installed
- Owner or Contributor permissions on:
  - Resource Group
  - Container App
  - Key Vault (or ability to create one)

---

## Step 1: Create Azure Key Vault (if not exists)

```bash
# Variables -- replace with your values
RESOURCE_GROUP="<your-resource-group>"
LOCATION="<your-region>"
KEY_VAULT_NAME="<your-keyvault-name>"
CONTAINER_APP_NAME="<your-container-app-name>"

# Create Key Vault
az keyvault create \
  --name "$KEY_VAULT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --enable-rbac-authorization true \
  --sku standard
```

---

## Step 2: Enable Managed Identity for Container App

```bash
# Enable System-Assigned Managed Identity
az containerapp identity assign \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --system-assigned

# Get the Managed Identity Principal ID
IDENTITY_PRINCIPAL_ID=$(az containerapp identity show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query principalId \
  --output tsv)
```

---

## Step 3: Grant Key Vault Access to Managed Identity

```bash
# Get Key Vault Resource ID
KEY_VAULT_ID=$(az keyvault show \
  --name "$KEY_VAULT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query id \
  --output tsv)

# Assign "Key Vault Secrets User" role to Managed Identity
az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee "$IDENTITY_PRINCIPAL_ID" \
  --scope "$KEY_VAULT_ID"
```

**Note**: If using Key Vault with Access Policies (not RBAC), use this instead:

```bash
az keyvault set-policy \
  --name "$KEY_VAULT_NAME" \
  --object-id "$IDENTITY_PRINCIPAL_ID" \
  --secret-permissions get list
```

---

## Step 4: Migrate Secrets to Key Vault

```bash
# Get current secrets from Container App
BC_CLIENT_SECRET=$(az containerapp secret show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --secret-name bc-client-secret \
  --query value \
  --output tsv 2>/dev/null || echo "")

MCP_API_KEYS=$(az containerapp secret show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --secret-name mcp-api-keys \
  --query value \
  --output tsv 2>/dev/null || echo "")

# Upload secrets to Key Vault
if [ ! -z "$BC_CLIENT_SECRET" ]; then
  az keyvault secret set \
    --vault-name "$KEY_VAULT_NAME" \
    --name "bc-client-secret" \
    --value "$BC_CLIENT_SECRET"
fi

if [ ! -z "$MCP_API_KEYS" ]; then
  az keyvault secret set \
    --vault-name "$KEY_VAULT_NAME" \
    --name "mcp-api-keys" \
    --value "$MCP_API_KEYS"
fi

# Also store Azure Client Secret (for OAuth proxy / BC API access)
AZURE_CLIENT_SECRET="<your-azure-client-secret>"
az keyvault secret set \
  --vault-name "$KEY_VAULT_NAME" \
  --name "azure-client-secret" \
  --value "$AZURE_CLIENT_SECRET"
```

**Security Note**: Clear these variables from shell history after running:

```bash
history -c
unset BC_CLIENT_SECRET MCP_API_KEYS AZURE_CLIENT_SECRET
```

---

## Step 5: Update Container App to Use Key Vault References

Azure Container Apps supports Key Vault references in environment variables:

```bash
# Get Key Vault URI
KEY_VAULT_URI=$(az keyvault show \
  --name "$KEY_VAULT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.vaultUri \
  --output tsv)

# Update Container App environment variables to use Key Vault references
az containerapp update \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --set-env-vars \
    "BC_CLIENT_SECRET=secretref:${KEY_VAULT_URI}secrets/bc-client-secret" \
    "AZURE_CLIENT_SECRET=secretref:${KEY_VAULT_URI}secrets/azure-client-secret" \
    "MCP_API_KEYS=secretref:${KEY_VAULT_URI}secrets/mcp-api-keys" \
    "KEY_VAULT_NAME=$KEY_VAULT_NAME"
```

**Alternative Method**: Use Container App secret references:

```bash
# Create secrets with Key Vault references
az containerapp secret set \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --secrets \
    "bc-client-secret=keyvaultref:${KEY_VAULT_URI}secrets/bc-client-secret,identityref:system" \
    "azure-client-secret=keyvaultref:${KEY_VAULT_URI}secrets/azure-client-secret,identityref:system" \
    "mcp-api-keys=keyvaultref:${KEY_VAULT_URI}secrets/mcp-api-keys,identityref:system"

# Update environment variables to reference these secrets
az containerapp update \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --set-env-vars \
    "BC_CLIENT_SECRET=secretref:bc-client-secret" \
    "AZURE_CLIENT_SECRET=secretref:azure-client-secret" \
    "MCP_API_KEYS=secretref:mcp-api-keys" \
    "KEY_VAULT_NAME=$KEY_VAULT_NAME"
```

---

## Step 6: Restart Container App

```bash
az containerapp revision copy \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP"
```

---

## Step 7: Verify Migration

```bash
# Check health endpoint
curl https://<your-server>.azurecontainerapps.io/health

# Check logs for Key Vault access
az containerapp logs show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --tail 50 \
  | grep -i "vault\|secret\|identity"
```

Expected: Health check returns 200 OK, no errors in logs.

---

## Step 8: Audit Key Vault Access

```bash
# Enable Key Vault diagnostic logging
WORKSPACE_ID=$(az monitor log-analytics workspace create \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "<your-workspace-name>" \
  --query id \
  --output tsv 2>/dev/null || \
  az monitor log-analytics workspace show \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "<your-workspace-name>" \
  --query id \
  --output tsv)

az monitor diagnostic-settings create \
  --name "kv-audit-logs" \
  --resource "$KEY_VAULT_ID" \
  --workspace "$WORKSPACE_ID" \
  --logs '[{"category":"AuditEvent","enabled":true}]'
```

Query audit logs:

```kusto
AzureDiagnostics
| where ResourceProvider == "MICROSOFT.KEYVAULT"
| where OperationName == "SecretGet"
| where identity_claim_appid_g == "<your-container-app-identity>"
| project TimeGenerated, CallerIPAddress, ResultSignature, ResultDescription
| order by TimeGenerated desc
```

---

## Rollback Procedure

If issues occur, roll back to environment variable secrets:

```bash
# Get secrets from Key Vault
BC_SECRET=$(az keyvault secret show \
  --vault-name "$KEY_VAULT_NAME" \
  --name "bc-client-secret" \
  --query value \
  --output tsv)

AZURE_SECRET=$(az keyvault secret show \
  --vault-name "$KEY_VAULT_NAME" \
  --name "azure-client-secret" \
  --query value \
  --output tsv)

MCP_KEYS=$(az keyvault secret show \
  --vault-name "$KEY_VAULT_NAME" \
  --name "mcp-api-keys" \
  --query value \
  --output tsv)

# Restore as Container App secrets
az containerapp secret set \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --secrets \
    "bc-client-secret=$BC_SECRET" \
    "azure-client-secret=$AZURE_SECRET" \
    "mcp-api-keys=$MCP_KEYS"

# Update environment variables
az containerapp update \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --set-env-vars \
    "BC_CLIENT_SECRET=secretref:bc-client-secret" \
    "AZURE_CLIENT_SECRET=secretref:azure-client-secret" \
    "MCP_API_KEYS=secretref:mcp-api-keys" \
    "KEY_VAULT_NAME="

# Restart
az containerapp revision copy \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP"
```

---

## Secret Rotation

With Key Vault, you can rotate secrets without redeploying:

```bash
# Update secret in Key Vault
az keyvault secret set \
  --vault-name "$KEY_VAULT_NAME" \
  --name "bc-client-secret" \
  --value "<new-secret-value>"

# Application picks up the new value on next secret fetch (cached for 5 minutes)
# Or restart to force immediate update:
az containerapp revision restart \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --revision "$(az containerapp revision list \
    --name "$CONTAINER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query '[0].name' \
    --output tsv)"
```

---

## Monitoring

### Key Vault Metrics

```bash
az monitor metrics list \
  --resource "$KEY_VAULT_ID" \
  --metric "ServiceApiResult" \
  --aggregation Count \
  --start-time $(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ') \
  --end-time $(date -u '+%Y-%m-%dT%H:%M:%SZ')
```

### Application Insights Query

```kusto
traces
| where timestamp > ago(24h)
| where message contains "Key Vault" or message contains "secret"
| project timestamp, message, severityLevel
| order by timestamp desc
```

---

## Security Best Practices

1. **Principle of Least Privilege**: Only grant "Key Vault Secrets User" role, not "Key Vault Secrets Officer"
2. **Audit Access**: Enable diagnostic logging and review regularly
3. **Rotate Secrets**: Implement automatic rotation (90 days recommended)
4. **Separate Environments**: Use different Key Vaults for dev/test/prod
5. **Backup Secrets**: Enable Key Vault soft-delete and purge protection
6. **Monitor Failures**: Alert on failed secret access attempts

---

## Troubleshooting

### Issue: "Access denied" errors

Verify Managed Identity has correct role assignment:

```bash
az role assignment list \
  --assignee "$IDENTITY_PRINCIPAL_ID" \
  --scope "$KEY_VAULT_ID"
```

### Issue: Application not starting after migration

Check Container App logs:

```bash
az containerapp logs show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --tail 100

# Verify Key Vault URI in environment variables
az containerapp show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.template.containers[0].env
```

### Issue: Secrets not updating after rotation

- Wait 5 minutes for cache to expire
- Or restart the container (see Secret Rotation above)

---

## Cost

- Key Vault Standard tier: ~$0.03/10,000 operations
- Expected cost: < $1/month for typical usage
