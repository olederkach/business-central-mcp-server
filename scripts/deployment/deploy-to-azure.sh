#!/bin/bash
# Business Central MCP Server - Azure Deployment Script
# Deploys containerized MCP server to Azure Container Apps

set -e

# Configuration
RESOURCE_GROUP="${RESOURCE_GROUP:-mcp-production-rg}"
LOCATION="${LOCATION:-eastus}"
CONTAINER_APP_ENV="${CONTAINER_APP_ENV:-mcp-environment}"
CONTAINER_APP_NAME="${CONTAINER_APP_NAME:-mcp-bc-server}"
CONTAINER_REGISTRY="${CONTAINER_REGISTRY:-mcpbcregistry}"
KEY_VAULT_NAME="${KEY_VAULT_NAME:-mcp-bc-keyvault}"

echo "🚀 Starting Azure deployment for Business Central MCP Server"
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"

# Create resource group
echo "📦 Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table

# Create container registry
echo "🐳 Creating container registry..."
az acr create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CONTAINER_REGISTRY" \
  --sku Standard \
  --admin-enabled true \
  --output table

# Build and push image
echo "🔨 Building and pushing Docker image..."
az acr build \
  --registry "$CONTAINER_REGISTRY" \
  --image business-central-mcp-server:latest \
  --image business-central-mcp-server:$(date +%Y%m%d-%H%M%S) \
  --file Dockerfile \
  .

# Create Key Vault
echo "🔐 Creating Key Vault..."
az keyvault create \
  --name "$KEY_VAULT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --enable-rbac-authorization false \
  --output table

# Store API keys in Key Vault
echo "🔑 Storing API keys..."
if [ -n "$MCP_API_KEYS" ]; then
  az keyvault secret set \
    --vault-name "$KEY_VAULT_NAME" \
    --name "mcp-api-keys" \
    --value "$MCP_API_KEYS" \
    --output table
else
  echo "⚠️  MCP_API_KEYS not set, skipping Key Vault secret creation"
fi

# Create Container Apps environment
echo "🌐 Creating Container Apps environment..."
az containerapp env create \
  --name "$CONTAINER_APP_ENV" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table

# Get ACR credentials
echo "📝 Getting ACR credentials..."
ACR_USERNAME=$(az acr credential show \
  --name "$CONTAINER_REGISTRY" \
  --query username \
  --output tsv)

ACR_PASSWORD=$(az acr credential show \
  --name "$CONTAINER_REGISTRY" \
  --query passwords[0].value \
  --output tsv)

# Deploy container app
echo "🚢 Deploying Container App..."
az containerapp create \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINER_APP_ENV" \
  --image "$CONTAINER_REGISTRY.azurecr.io/business-central-mcp-server:latest" \
  --registry-server "$CONTAINER_REGISTRY.azurecr.io" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --target-port 3005 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 10 \
  --cpu 1.0 \
  --memory 2.0Gi \
  --env-vars \
    "NODE_ENV=production" \
    "PORT=3005" \
    "KEY_VAULT_NAME=$KEY_VAULT_NAME" \
    "METADATA_MODE=${METADATA_MODE:-all}" \
    "AUTH_MODE=${AUTH_MODE:-api-key}" \
    "LOG_LEVEL=${LOG_LEVEL:-info}" \
    "CACHE_TTL_SECONDS=${CACHE_TTL_SECONDS:-3600}" \
  --output table

# Enable managed identity
echo "🆔 Enabling managed identity..."
az containerapp identity assign \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --system-assigned \
  --output table

# Grant Key Vault access
echo "🔓 Granting Key Vault access..."
PRINCIPAL_ID=$(az containerapp identity show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query principalId \
  --output tsv)

az keyvault set-policy \
  --name "$KEY_VAULT_NAME" \
  --object-id "$PRINCIPAL_ID" \
  --secret-permissions get list \
  --output table

# Get the app URL
APP_URL=$(az containerapp show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn \
  --output tsv)

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Deployment Summary:"
echo "  App URL: https://$APP_URL"
echo "  Health Check: https://$APP_URL/health"
echo "  Info Endpoint: https://$APP_URL/info"
echo ""
echo "🔗 MCP Endpoint Format:"
echo "  Standard API: https://$APP_URL/{tenantId}/{env}/api/v2.0/companies({companyId})"
echo "  Custom API: https://$APP_URL/{tenantId}/{env}/api/{publisher}/{group}/{version}/companies({companyId})"
echo ""
echo "🧪 Test with:"
echo "  curl https://$APP_URL/health"
echo ""
