# Deployment Guide - Azure Container Apps

**Complete guide for deploying Business Central MCP Server to Azure**

> This solution is designed as a **cloud-native service**. This guide covers deployment to Azure Container Apps, the recommended production environment.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Azure Resources](#azure-resources)
4. [Deployment Steps](#deployment-steps)
5. [Configuration](#configuration)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### What Gets Deployed

```
Azure Subscription
├── Resource Group (mcp-bc-server-rg)
│   ├── Container Registry (ACR)
│   │   └── Docker Image (business-central-mcp-server)
│   ├── Container Apps Environment
│   │   └── Container App (mcp-bc-server)
│   │       ├── Ingress: HTTPS (public)
│   │       ├── Scaling: 1-10 replicas
│   │       └── Health checks: /health
│   ├── Key Vault (secrets storage)
│   │   ├── MCP API keys
│   │   ├── BC client secret
│   │   └── Other secrets
│   ├── Application Insights (monitoring)
│   │   ├── Request telemetry
│   │   ├── Performance metrics
│   │   └── Error tracking
│   └── Managed Identity
│       └── Access to Key Vault & ACR
```

### Deployment Time

- **Initial deployment:** 15-20 minutes
- **Subsequent deployments:** 5-10 minutes (updates only)

### Monthly Cost Estimate

| Resource | Cost |
|----------|------|
| Container Apps (1-3 replicas avg) | $30-40 |
| Container Registry (Basic tier) | $5 |
| Key Vault (Standard tier) | $1-2 |
| Application Insights | $5-10 |
| Bandwidth (moderate usage) | $5-10 |
| **Total** | **$55-75/month** |

*Based on 100K requests/month*

---

## Prerequisites

### Required Tools

1. **Azure CLI** (version 2.50+)
   ```bash
   # Install Azure CLI
   # Windows: winget install Microsoft.AzureCLI
   # Mac: brew install azure-cli
   # Linux: curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
   
   # Verify installation
   az --version
   ```

2. **Docker** (for local testing - optional)
   ```bash
   docker --version
   ```

3. **Git** (for cloning repository)
   ```bash
   git --version
   ```

### Azure Permissions

You need an Azure subscription with:
- **Contributor** role (or higher) on the subscription
- Ability to create resource groups and resources
- Ability to create Azure AD app registrations

### Business Central Setup

1. **Azure AD App Registration** for BC API access
   - Go to: Azure Portal → Azure Active Directory → App Registrations
   - Click: **New registration**
   - Name: `BC-MCP-Server-API-Access`
   - Supported account types: **Accounts in this organizational directory only**
   - Click: **Register**

2. **Add API Permissions**
   - Go to: API permissions → Add a permission
   - Select: **Dynamics 365 Business Central**
   - Permission type: **Application permissions**
   - Select: **Automation.ReadWrite.All** or **Financials.ReadWrite.All**
   - Click: **Grant admin consent**

3. **Create Client Secret**
   - Go to: Certificates & secrets → New client secret
   - Description: `MCP Server Access`
   - Expires: **24 months** (recommended)
   - Click: **Add**
   - **Copy the secret value** (you'll need this later)

4. **Get Your Business Central Information**
   ```
   Tenant ID: Azure AD tenant ID (GUID)
   Client ID: App registration application ID (GUID)
   Client Secret: Secret value from step 3
   Environment: "Sandbox" or "Production"
   Company ID: BC company ID (GUID) or name
   ```

---

## Azure Resources

### 1. Create Resource Group

```bash
# Login to Azure
az login

# Set your subscription (if you have multiple)
az account set --subscription "Your Subscription Name"

# Create resource group
az group create \
  --name mcp-bc-server-rg \
  --location eastus
```

### 2. Create Container Registry

```bash
# Create ACR
az acr create \
  --resource-group mcp-bc-server-rg \
  --name mcpbcserver \
  --sku Basic \
  --location eastus \
  --admin-enabled true

# Get ACR credentials
az acr credential show \
  --name mcpbcserver \
  --resource-group mcp-bc-server-rg
```

### 3. Create Key Vault

```bash
# Create Key Vault
az keyvault create \
  --name mcp-bc-keyvault \
  --resource-group mcp-bc-server-rg \
  --location eastus \
  --sku standard

# Enable for deployment
az keyvault update \
  --name mcp-bc-keyvault \
  --resource-group mcp-bc-server-rg \
  --enabled-for-deployment true \
  --enabled-for-template-deployment true
```

### 4. Create Application Insights

```bash
# Create App Insights
az monitor app-insights component create \
  --app mcp-bc-insights \
  --location eastus \
  --resource-group mcp-bc-server-rg \
  --application-type web

# Get connection string
az monitor app-insights component show \
  --app mcp-bc-insights \
  --resource-group mcp-bc-server-rg \
  --query connectionString -o tsv
```

---

## Deployment Steps

### Step 1: Clone Repository

```bash
git clone https://github.com/olederkach/business-central-mcp-server.git
cd business-central-mcp-server
```

### Step 2: Build and Push Docker Image

```bash
# Login to ACR
az acr login --name mcpbcserver

# Build image
docker build -t business-central-mcp-server:latest .

# Tag image
docker tag business-central-mcp-server:latest mcpbcserver.azurecr.io/business-central-mcp-server:latest

# Push to ACR
docker push mcpbcserver.azurecr.io/business-central-mcp-server:latest
```

### Step 3: Store Secrets in Key Vault

```bash
# Store BC client secret
az keyvault secret set \
  --vault-name mcp-bc-keyvault \
  --name bc-client-secret \
  --value "YOUR_BC_CLIENT_SECRET"

# Store MCP API keys (comma-separated)
az keyvault secret set \
  --vault-name mcp-bc-keyvault \
  --name mcp-api-keys \
  --value "key1,key2,key3"

# Generate random API key (optional)
# openssl rand -base64 32
```

### Step 4: Create Container Apps Environment

```bash
# Create environment
az containerapp env create \
  --name mcp-bc-env \
  --resource-group mcp-bc-server-rg \
  --location eastus
```

### Step 5: Deploy Container App

```bash
# Create managed identity
az identity create \
  --name mcp-bc-identity \
  --resource-group mcp-bc-server-rg

# Get identity ID
IDENTITY_ID=$(az identity show \
  --name mcp-bc-identity \
  --resource-group mcp-bc-server-rg \
  --query id -o tsv)

# Grant Key Vault access to managed identity
az keyvault set-policy \
  --name mcp-bc-keyvault \
  --object-id $(az identity show --name mcp-bc-identity --resource-group mcp-bc-server-rg --query principalId -o tsv) \
  --secret-permissions get list

# Create container app
az containerapp create \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --environment mcp-bc-env \
  --image mcpbcserver.azurecr.io/business-central-mcp-server:latest \
  --registry-server mcpbcserver.azurecr.io \
  --registry-username $(az acr credential show --name mcpbcserver -g mcp-bc-server-rg --query username -o tsv) \
  --registry-password $(az acr credential show --name mcpbcserver -g mcp-bc-server-rg --query passwords[0].value -o tsv) \
  --target-port 3005 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 10 \
  --cpu 0.5 \
  --memory 1Gi \
  --env-vars \
    "NODE_ENV=production" \
    "PORT=3005" \
    "TOOL_MODE=generic" \
    "AUTH_MODE=api-key" \
    "BC_TENANT_ID=YOUR_TENANT_ID" \
    "BC_ENVIRONMENT_NAME=Sandbox" \
    "BC_COMPANY_ID=YOUR_COMPANY_ID" \
    "BC_CLIENT_ID=YOUR_CLIENT_ID" \
  --secrets \
    "bc-client-secret=$(az keyvault secret show --vault-name mcp-bc-keyvault --name bc-client-secret --query value -o tsv)" \
    "mcp-api-keys=$(az keyvault secret show --vault-name mcp-bc-keyvault --name mcp-api-keys --query value -o tsv)" \
  --secret-refs \
    "BC_CLIENT_SECRET=bc-client-secret" \
    "MCP_API_KEYS=mcp-api-keys"
```

### Step 6: Get Deployment URL

```bash
# Get FQDN
az containerapp show \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --query properties.configuration.ingress.fqdn -o tsv

# Output example: your-app-name.region.azurecontainerapps.io
```

---

## Configuration

### Environment Variables Reference

Set these in the Container App configuration:

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | ✅ | `production` | Environment mode |
| `PORT` | ✅ | `3005` | Server port |
| `TOOL_MODE` | ✅ | `generic` | Tool mode (generic recommended) |
| `AUTH_MODE` | ✅ | `api-key` | Authentication mode |
| `BC_TENANT_ID` | ✅ | `12345678-1234-...` | BC tenant ID |
| `BC_ENVIRONMENT_NAME` | ✅ | `Sandbox` | BC environment |
| `BC_COMPANY_ID` | ✅ | `company-guid` | Default company |
| `BC_CLIENT_ID` | ✅ | `app-guid` | Azure AD app ID |
| `BC_CLIENT_SECRET` | ✅ | *secret* | From Key Vault |
| `MCP_API_KEYS` | ✅ | *keys* | From Key Vault |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | ❌ | *connection-string* | App Insights |
| `LOG_LEVEL` | ❌ | `info` | Logging level |

### Update Configuration

```bash
# Update environment variables
az containerapp update \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --set-env-vars "BC_ENVIRONMENT_NAME=Production"

# Update secrets
az containerapp secret set \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --secrets "mcp-api-keys=new-key-1,new-key-2"
```

---

## Verification

### 1. Health Check

```bash
# Get your server URL
FQDN=$(az containerapp show \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --query properties.configuration.ingress.fqdn -o tsv)

# Test health endpoint
curl "https://$FQDN/health"
```

**Expected response:**
```json
{
  "status": "healthy",
  "version": "2.2.7",
  "timestamp": "2025-10-28T12:00:00.000Z"
}
```

### 2. MCP Protocol Test

```bash
# Test tools/list
curl -X POST "https://$FQDN/mcp" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

**Expected:** JSON with 14 tools

### 3. View Logs

```bash
# Stream logs
az containerapp logs show \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --follow

# Or view in Azure Portal
# Container Apps → mcp-bc-server → Monitoring → Log stream
```

### 4. Check Metrics

```bash
# Get replica count
az containerapp replica list \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg

# View in Application Insights
# Portal → mcp-bc-insights → Live Metrics
```

---

## Troubleshooting

### Container Won't Start

**Check deployment logs:**
```bash
az containerapp logs show \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --tail 100
```

**Common issues:**
- Missing environment variables
- Invalid BC credentials
- Key Vault permissions not set

### "Authentication failed" in logs

**Verify secrets:**
```bash
# List secrets
az containerapp secret list \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg

# Update if needed
az containerapp secret set \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --secrets "bc-client-secret=NEW_VALUE"
```

### High Memory/CPU Usage

**Check resource limits:**
```bash
az containerapp show \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --query properties.template.containers[0].resources
```

**Increase if needed:**
```bash
az containerapp update \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --cpu 1.0 \
  --memory 2Gi
```

### Slow Response Times

**Enable Application Insights:**
```bash
# Get connection string
CONN_STRING=$(az monitor app-insights component show \
  --app mcp-bc-insights \
  --resource-group mcp-bc-server-rg \
  --query connectionString -o tsv)

# Add to container app
az containerapp update \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --set-env-vars "APPLICATIONINSIGHTS_CONNECTION_STRING=$CONN_STRING"
```

### Cannot Connect from MCP Client

**Check ingress settings:**
```bash
az containerapp show \
  --name mcp-bc-server \
  --resource-group mcp-bc-server-rg \
  --query properties.configuration.ingress
```

**Verify:**
- Ingress is set to `external`
- Target port is `3005`
- HTTPS is enabled

---

## Next Steps

1. **Configure MCP Clients**
   - [Copilot Studio Setup](COPILOT_STUDIO_COMPLETE_SETUP.md)
   - [Azure AI Foundry Setup](azure-ai-foundry/QUICK_SETUP.md)
   - [Generic MCP Client Setup](MCP_CLIENT_SETUP.md)

2. **Enable Monitoring**
   - Set up Application Insights dashboards
   - Configure alerts for errors/performance
   - Review Application Insights metrics

3. **Secure Your Deployment**
   - Rotate secrets quarterly
   - Review Key Vault access policies
   - Enable Azure Defender (optional)

4. **Optimize Performance**
   - Enable caching (default: enabled)
   - Adjust scaling rules if needed
   - Monitor with Application Insights

---

## Support

- **Documentation:** [docs/README.md](README.md)
- **Copilot Studio Issues:** [TROUBLESHOOTING_COPILOT_STUDIO.md](TROUBLESHOOTING_COPILOT_STUDIO.md)
- **Issues:** [GitHub Issues](https://github.com/olederkach/business-central-mcp-server/issues)

---

**Deployment complete! 🎉**

Your Business Central MCP Server is now running in the cloud and ready to connect to AI agents.

