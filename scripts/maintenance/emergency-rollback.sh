#!/bin/bash
# Emergency Rollback Script for Business Central MCP Server
# Usage: ./emergency-rollback.sh [revision-name]
# 
# If no revision name provided, will rollback to the previous active revision

set -e

REVISION_NAME=${1:-""}
APP_NAME="${MCP_APP_NAME:-mcp-bc-server}"
RESOURCE_GROUP="${MCP_RESOURCE_GROUP:-mcp-production-rg}"

echo "🚨 EMERGENCY ROLLBACK SCRIPT"
echo "=============================="
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI not found. Please install: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in
az account show &> /dev/null || {
    echo "❌ Not logged in to Azure. Run: az login"
    exit 1
}

echo "App Name: $APP_NAME"
echo "Resource Group: $RESOURCE_GROUP"
echo ""

# Get revision name if not provided
if [ -z "$REVISION_NAME" ]; then
  echo "Getting previous active revision..."
  
  REVISION_NAME=$(az containerapp revision list \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[1].name" \
    --output tsv 2>/dev/null)
  
  if [ -z "$REVISION_NAME" ]; then
    echo "❌ No previous revision found. Available revisions:"
    az containerapp revision list \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --output table
    exit 1
  fi
fi

echo "🔄 Will rollback to revision: $REVISION_NAME"
echo ""
echo "⚠️  WARNING: This will:"
echo "  1. Activate revision: $REVISION_NAME"
echo "  2. Deactivate current revision"
echo "  3. Route all traffic to previous revision"
echo ""
echo "Press ENTER to continue or Ctrl+C to cancel..."
read

echo ""
echo "📋 Step 1/4: Getting current revision..."
CURRENT=$(az containerapp revision list \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].name" \
  --output tsv)

echo "Current revision: $CURRENT"

if [ "$CURRENT" == "$REVISION_NAME" ]; then
  echo "⚠️  Already on target revision. Nothing to do."
  exit 0
fi

echo ""
echo "📋 Step 2/4: Activating previous revision..."
az containerapp revision activate \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --revision "$REVISION_NAME" \
  --output none

echo "✅ Revision activated"

echo ""
echo "📋 Step 3/4: Deactivating broken revision..."
az containerapp revision deactivate \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --revision "$CURRENT" \
  --output none

echo "✅ Previous revision deactivated"

echo ""
echo "📋 Step 4/4: Verifying rollback..."
sleep 5

APP_URL=$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv)

if [ -z "$APP_URL" ]; then
  echo "⚠️  Could not get app URL for verification"
else
  echo "Testing health endpoint: https://$APP_URL/health"
  
  if curl -sf "https://$APP_URL/health" > /dev/null; then
    echo "✅ Health check PASSED"
  else
    echo "❌ Health check FAILED"
    echo "Please check logs: az containerapp logs show --name $APP_NAME --resource-group $RESOURCE_GROUP --tail 50"
  fi
fi

echo ""
echo "════════════════════════════════════════"
echo "✅ ROLLBACK COMPLETE!"
echo "════════════════════════════════════════"
echo ""
echo "Active revision: $REVISION_NAME"
echo "Deactivated revision: $CURRENT"
echo ""
echo "Next steps:"
echo "  1. Monitor the application for stability"
echo "  2. Investigate root cause of the issue"
echo "  3. Create incident report"
echo "  4. Fix the issue before next deployment"
echo ""
echo "View logs:"
echo "  az containerapp logs show --name $APP_NAME --resource-group $RESOURCE_GROUP --tail 100"
echo ""

