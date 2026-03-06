# Deployment Guide - Azure Container Apps

Complete guide for deploying Business Central MCP Server to Azure Container Apps.

---

## Overview

### What Gets Deployed

```text
Azure Subscription
+-- Resource Group (<your-resource-group>)
    +-- Container Registry (<your-acr-name>)
    |   +-- Docker Image (business-central-mcp-server)
    +-- Container Apps Environment
    |   +-- Container App (<your-container-app-name>)
    |       +-- Ingress: HTTPS (public)
    |       +-- Scaling: 1-10 replicas
    |       +-- Health checks: /health
    +-- Key Vault (optional, secrets storage)
    +-- Application Insights (optional, monitoring)
    +-- Managed Identity (optional, for Key Vault / ACR access)
```

### Deployment Time

- **Initial deployment:** 15-20 minutes
- **Subsequent deployments:** 5-10 minutes (image update only)

### Monthly Cost Estimate

| Resource                          | Estimated Cost |
| --------------------------------- | -------------- |
| Container Apps (1-3 replicas avg) | $30-40         |
| Container Registry (Basic tier)   | $5             |
| Key Vault (Standard tier)         | $1-2           |
| Application Insights              | $5-10          |
| Bandwidth (moderate usage)        | $5-10          |
| **Total**                         | **$55-75/month** |

Based on approximately 100K requests/month.

---

## Prerequisites

### Required Tools

1. **Azure CLI** (version 2.50+)

   ```bash
   # Windows
   winget install Microsoft.AzureCLI

   # macOS
   brew install azure-cli

   # Linux
   curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

   # Verify
   az --version
   ```

2. **Docker** (optional, for local builds)

   ```bash
   docker --version
   ```

3. **Git**

   ```bash
   git --version
   ```

### Azure Permissions

You need an Azure subscription with:

- **Contributor** role (or higher) on the subscription or target resource group
- Ability to create Azure AD / Entra ID app registrations
- Ability to grant admin consent for API permissions

---

## Step 1: Azure AD App Registration (Unified)

A single app registration can serve both purposes:

1. **User OAuth** (Authorization Code flow) -- Claude.ai and Copilot Studio users authenticate to the MCP server.
2. **BC API Access** (Client Credentials flow) -- the MCP server authenticates to Business Central.

This unified approach means you maintain one app, one secret, and one set of IDs.

### Create the App Registration

1. Go to **Azure Portal** > **App registrations** > **New registration**.
2. Name: for example, `BC-MCP-Server`.
3. Supported account types: **Accounts in this organizational directory only** (single tenant).
4. Leave Redirect URI blank for now.
5. Click **Register**.

### Add BC API Permission

1. Go to **API permissions** > **Add a permission**.
2. Select **Dynamics 365 Business Central**.
3. Choose **Application permissions**.
4. Select **API.ReadWrite.All**.
5. Click **Add permissions**.
6. Click **Grant admin consent for `<your-tenant>`**.

### Expose an API Scope (for OAuth mode)

This step is only required if you plan to use `AUTH_MODE=oauth` (Claude.ai, Copilot Studio).

1. Go to **Expose an API**.
2. Set **Application ID URI** to `api://<your-client-id>`.
3. Click **Add a scope**:
   - Scope name: `MCP.Access`
   - Who can consent: **Admins only**
   - Admin consent display name: `Access MCP Server`
   - Admin consent description: `Allows access to the Business Central MCP Server`
   - State: **Enabled**
4. This scope is validated when users authenticate via OAuth. The server checks it via the `MCP_OAUTH_REQUIRED_SCOPE` environment variable.

### Create Client Secret

1. Go to **Certificates & secrets** > **New client secret**.
2. Description: `MCP Server`
3. Expires: 24 months (recommended).
4. Click **Add**.
5. **Copy the secret value immediately** -- it is shown only once.

With the unified approach, this single secret is used for both the MCP OAuth flow (`AZURE_CLIENT_SECRET`) and the BC API calls (`BC_CLIENT_SECRET`).

### Register Redirect URIs

Under **Authentication** > **Web** > **Redirect URIs**, add the URIs relevant to your MCP clients:

| Redirect URI                                                                 | Used by                                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `https://claude.ai/api/mcp/auth_callback`                                   | Claude.ai                                                      |
| `https://global.consent.azure-apim.net/redirect/<your-connector-slug>`       | Copilot Studio (exact URI shown in error message if missing)   |
| `https://token.botframework.com/.auth/web/redirect`                          | Copilot Studio (Bot Framework)                                 |
| `https://businesscentral.dynamics.com/OAuthLanding.htm`                      | Business Central                                               |

You only need to add URIs for clients you actually use.

### Collect Values

| Value                    | Where to Find              | Used As                                    |
| ------------------------ | -------------------------- | ------------------------------------------ |
| Application (client) ID | App registration > Overview | `AZURE_CLIENT_ID`, `BC_CLIENT_ID`         |
| Directory (tenant) ID   | App registration > Overview | `AZURE_TENANT_ID`, `BC_TENANT_ID`         |
| Client secret value      | Certificates & secrets     | `AZURE_CLIENT_SECRET`, `BC_CLIENT_SECRET` |

With the unified registration, the AZURE and BC values are identical.

---

## Step 2: Create Azure Resources

### Login

```bash
az login
az account set --subscription "<your-subscription-name-or-id>"
```

### Resource Group

```bash
az group create \
  --name <your-resource-group> \
  --location <your-region>
```

### Container Registry

```bash
az acr create \
  --resource-group <your-resource-group> \
  --name <your-acr-name> \
  --sku Basic \
  --admin-enabled true
```

### Container Apps Environment

```bash
az containerapp env create \
  --name <your-environment-name> \
  --resource-group <your-resource-group> \
  --location <your-region>
```

### (Optional) Key Vault

```bash
az keyvault create \
  --name <your-keyvault-name> \
  --resource-group <your-resource-group> \
  --location <your-region> \
  --sku standard
```

### (Optional) Application Insights

```bash
az monitor app-insights component create \
  --app <your-insights-name> \
  --location <your-region> \
  --resource-group <your-resource-group> \
  --application-type web
```

---

## Step 3: Build and Push Docker Image

Option A -- build remotely using ACR Tasks (no local Docker required):

```bash
az acr build \
  --registry <your-acr-name> \
  --image business-central-mcp-server:latest \
  .
```

Option B -- build locally and push:

```bash
az acr login --name <your-acr-name>

docker build -t <your-acr-name>.azurecr.io/business-central-mcp-server:latest .
docker push <your-acr-name>.azurecr.io/business-central-mcp-server:latest
```

---

## Step 4: Deploy Container App

### Store Secrets

Container Apps has a built-in secrets store. Set your secrets before or during deployment:

```bash
az containerapp secret set \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --secrets \
    bc-client-id="<your-client-id>" \
    bc-client-secret="<your-client-secret>" \
    mcp-api-keys="<your-api-key-1>,<your-api-key-2>"
```

To generate a random API key:

```bash
openssl rand -base64 32
```

### Create the Container App

The `--env-vars` and `--secrets` flags differ depending on your authentication mode.

#### API Key Mode

```bash
az containerapp create \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --environment <your-environment-name> \
  --image <your-acr-name>.azurecr.io/business-central-mcp-server:latest \
  --registry-server <your-acr-name>.azurecr.io \
  --target-port 3005 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 10 \
  --cpu 0.5 \
  --memory 1Gi \
  --secrets \
    bc-client-id="<your-client-id>" \
    bc-client-secret="<your-client-secret>" \
    mcp-api-keys="<your-api-key-1>,<your-api-key-2>" \
  --env-vars \
    NODE_ENV=production \
    PORT=3005 \
    AUTH_MODE=api-key \
    LOG_LEVEL=info \
    METADATA_MODE=all \
    CACHE_TTL_SECONDS=3600 \
    BC_TENANT_ID=<your-tenant-id> \
    BC_ENVIRONMENT_NAME=<Sandbox-or-Production> \
    BC_COMPANY_ID=<your-company-id> \
    BC_CLIENT_ID=secretref:bc-client-id \
    BC_CLIENT_SECRET=secretref:bc-client-secret \
    MCP_API_KEYS=secretref:mcp-api-keys
```

#### OAuth Mode (for Claude.ai and Copilot Studio)

```bash
az containerapp create \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --environment <your-environment-name> \
  --image <your-acr-name>.azurecr.io/business-central-mcp-server:latest \
  --registry-server <your-acr-name>.azurecr.io \
  --target-port 3005 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 10 \
  --cpu 0.5 \
  --memory 1Gi \
  --secrets \
    bc-client-id="<your-client-id>" \
    bc-client-secret="<your-client-secret>" \
    azure-client-secret="<your-client-secret>" \
  --env-vars \
    NODE_ENV=production \
    PORT=3005 \
    AUTH_MODE=oauth \
    LOG_LEVEL=info \
    METADATA_MODE=all \
    CACHE_TTL_SECONDS=3600 \
    AZURE_TENANT_ID=<your-tenant-id> \
    AZURE_CLIENT_ID=<your-client-id> \
    AZURE_CLIENT_SECRET=secretref:azure-client-secret \
    MCP_SERVER_URL=https://<your-container-app-name>.<your-region>.azurecontainerapps.io \
    MCP_OAUTH_REQUIRED_SCOPE=MCP.Access \
    BC_TENANT_ID=<your-tenant-id> \
    BC_ENVIRONMENT_NAME=<Sandbox-or-Production> \
    BC_COMPANY_ID=<your-company-id> \
    BC_CLIENT_ID=secretref:bc-client-id \
    BC_CLIENT_SECRET=secretref:bc-client-secret
```

With the unified app registration, the AZURE and BC credentials are the same values.

Set `MCP_OAUTH_REQUIRED_SCOPE` to an empty string to disable scope validation.

### Get the Deployment URL

```bash
az containerapp show \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --query properties.configuration.ingress.fqdn -o tsv
```

---

## Step 5: GitHub Actions Deployment (CI/CD)

The repository includes a fully parameterized GitHub Actions workflow at `.github/workflows/deploy-azure.yml`. It uses OIDC (federated credentials) to authenticate with Azure -- no long-lived secrets for Azure login.

### Configure GitHub Secrets

Go to your repository **Settings** > **Secrets and variables** > **Actions** and create:

| Secret                    | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `AZURE_CLIENT_ID`        | App registration ID used for OIDC deployment login |
| `AZURE_TENANT_ID`        | Azure AD / Entra ID tenant ID                    |
| `AZURE_SUBSCRIPTION_ID`  | Azure subscription ID                            |
| `BC_CLIENT_ID`           | App registration ID for BC API access            |
| `BC_CLIENT_SECRET`       | App registration client secret                   |
| `MCP_API_KEYS`           | Comma-separated API keys (for api-key mode)      |

With the unified registration, `AZURE_CLIENT_ID` and `BC_CLIENT_ID` hold the same value.

### Workflow Inputs

The workflow is triggered manually (`workflow_dispatch`) and accepts these inputs:

| Input                  | Description                                       | Default        |
| ---------------------- | ------------------------------------------------- | -------------- |
| `environment`          | GitHub environment for secret scoping             | `production`   |
| `image_tag`            | Docker image tag (defaults to git SHA)            | _(git SHA)_    |
| `acr_name`             | Azure Container Registry name                     | _(required)_   |
| `container_app_name`   | Azure Container App name                          | _(required)_   |
| `resource_group`       | Azure Resource Group name                         | _(required)_   |
| `bc_tenant_id`         | BC / Entra ID tenant ID (GUID)                    | _(required)_   |
| `bc_company_id`        | BC company ID (GUID)                              | _(required)_   |
| `bc_environment_name`  | BC environment name                               | `Production`   |
| `auth_mode`            | Authentication mode (`api-key` or `oauth`)        | `api-key`      |
| `log_level`            | Log level (`debug`, `info`, `warn`, `error`)      | `info`         |
| `metadata_mode`        | BC metadata discovery (`all` or `extensions-only`) | `all`         |
| `cache_ttl_seconds`    | Cache TTL in seconds                              | `3600`         |

### What the Workflow Does

1. Validates that all required GitHub Secrets are configured.
2. Logs in to Azure via OIDC (no stored Azure credentials).
3. Builds the Docker image and pushes it to your ACR.
4. Syncs secrets into the Container App's secret store.
5. Deploys the new image with all environment variables.
6. Runs a health check against the deployed app.

### Running the Workflow

Go to **Actions** > **Deploy to Azure Container Apps** > **Run workflow**, fill in the inputs, and click **Run workflow**.

---

## Step 6: Verification

### Health Check

```bash
FQDN=$(az containerapp show \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --query properties.configuration.ingress.fqdn -o tsv)

curl "https://$FQDN/health"
```

Expected response:

```json
{
  "status": "healthy",
  "version": "<current-version>",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

### MCP Protocol Test

```bash
# API key mode
curl -X POST "https://$FQDN/mcp" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

Expected: a JSON response listing 14 tools.

### View Logs

```bash
az containerapp logs show \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --follow
```

Or in the Azure Portal: **Container Apps** > your app > **Monitoring** > **Log stream**.

---

## Environment Variables Reference

### Server Configuration

| Variable             | Required | Default       | Description                                                     |
| -------------------- | -------- | ------------- | --------------------------------------------------------------- |
| `NODE_ENV`           | No       | `development` | Set to `production` for deployed environments                   |
| `PORT`               | No       | `3005`        | HTTP server port                                                |
| `AUTH_MODE`          | No       | `api-key`     | Authentication mode: `api-key` or `oauth`                       |
| `LOG_LEVEL`          | No       | `info`        | Logging level: `debug`, `info`, `warn`, `error`                 |
| `METADATA_MODE`      | No       | `all`         | BC metadata discovery: `all` or `extensions-only`               |
| `CACHE_TTL_SECONDS`  | No       | `3600`        | Metadata cache TTL in seconds                                   |
| `CORS_ORIGINS`       | No       | _(none)_      | Comma-separated allowed origins (do not use `*`)                |
| `MCP_SERVER_URL`     | OAuth    | _(derived)_   | Public base URL of the server (required for OAuth redirect)     |

### Authentication -- API Key Mode

| Variable         | Required | Default  | Description                                             |
| ---------------- | -------- | -------- | ------------------------------------------------------- |
| `MCP_API_KEYS`   | Yes      | _(none)_ | Comma-separated API keys                                |
| `KEY_VAULT_NAME` | No       | _(none)_ | Azure Key Vault name (alternative to `MCP_API_KEYS`)   |

### Authentication -- OAuth Mode

| Variable                    | Required | Default      | Description                                                              |
| --------------------------- | -------- | ------------ | ------------------------------------------------------------------------ |
| `AZURE_TENANT_ID`           | Yes      | _(none)_     | Entra ID tenant ID                                                       |
| `AZURE_CLIENT_ID`           | Yes      | _(none)_     | App registration client ID                                               |
| `AZURE_CLIENT_SECRET`       | Yes      | _(none)_     | App registration client secret                                           |
| `MCP_OAUTH_REQUIRED_SCOPE`  | No       | `MCP.Access` | Required scope in the access token (set to empty string to disable)      |

### Business Central Connection

| Variable               | Required | Default      | Description                                                           |
| ---------------------- | -------- | ------------ | --------------------------------------------------------------------- |
| `BC_TENANT_ID`         | Yes      | _(none)_     | BC / Entra ID tenant ID                                               |
| `BC_CLIENT_ID`         | Yes      | _(none)_     | App registration client ID for BC API access                          |
| `BC_CLIENT_SECRET`     | Yes      | _(none)_     | App registration client secret                                        |
| `BC_ENVIRONMENT_NAME`  | No       | `Production` | BC environment: `Production` or `Sandbox`                             |
| `BC_COMPANY_ID`        | No       | _(none)_     | Default BC company ID (GUID); can be set at runtime via tools         |
| `API_TYPE`             | No       | `standard`   | BC API type: `standard` or `custom`                                   |
| `API_VERSION`          | No       | `v2.0`       | BC API version                                                        |
| `API_PUBLISHER`        | No       | _(none)_     | Required when `API_TYPE=custom`                                       |
| `API_GROUP`            | No       | _(none)_     | Required when `API_TYPE=custom`                                       |

### Monitoring (Optional)

| Variable                                 | Required | Default  | Description                                |
| ---------------------------------------- | -------- | -------- | ------------------------------------------ |
| `APPLICATIONINSIGHTS_CONNECTION_STRING`  | No       | _(none)_ | Azure Application Insights connection string |

---

## Troubleshooting

### Container Fails to Start

Check the deployment logs:

```bash
az containerapp logs show \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --tail 100
```

Common causes:

- Missing required environment variables (`BC_TENANT_ID`, `BC_CLIENT_ID`, etc.)
- Invalid `AUTH_MODE` value
- OAuth mode enabled but `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, or `AZURE_CLIENT_SECRET` not set

### "Authentication failed" Errors

Verify that secrets are correctly stored:

```bash
az containerapp secret list \
  --name <your-container-app-name> \
  --resource-group <your-resource-group>
```

Common causes:

- Client secret has expired in Entra ID
- Admin consent not granted for BC API permissions
- Wrong tenant ID

Update a secret:

```bash
az containerapp secret set \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --secrets "bc-client-secret=<your-new-secret-value>"
```

### OAuth Redirect Errors

If Claude.ai or Copilot Studio returns a redirect URI mismatch error:

- Check that the exact redirect URI is registered in the app registration under **Authentication** > **Redirect URIs**.
- The error message typically includes the expected URI -- add it to the app registration.

### CORS Errors

If browser-based clients receive CORS errors:

- Set `CORS_ORIGINS` to a comma-separated list of allowed origins.
- Do not use `*` -- it is blocked when credentials are enabled.

### High Memory or CPU Usage

Check current resource limits:

```bash
az containerapp show \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --query properties.template.containers[0].resources
```

Increase if needed:

```bash
az containerapp update \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --cpu 1.0 \
  --memory 2Gi
```

### Cannot Connect from MCP Client

Verify ingress configuration:

```bash
az containerapp show \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --query properties.configuration.ingress
```

Check that:

- Ingress is set to `external`
- Target port is `3005`
- HTTPS is enabled

---

## Next Steps

- **Configure MCP Clients:** See [MCP_CLIENT_SETUP.md](MCP_CLIENT_SETUP.md) for connecting Claude.ai, Copilot Studio, Azure AI Foundry, and other clients.
- **Enable Monitoring:** Set up Application Insights dashboards and alerts.
- **Rotate Secrets:** Rotate the client secret in Entra ID periodically and update the Container App secrets accordingly.
