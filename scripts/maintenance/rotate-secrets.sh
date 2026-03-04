#!/bin/bash
# Secrets Rotation Script for Business Central MCP Server
# Usage: ./rotate-secrets.sh [api-keys|bc-secret|cleanup-old-keys|all]

set -e

KEY_VAULT_NAME="${KEY_VAULT_NAME:-mcp-bc-keyvault}"
ROTATION_TYPE=${1:-"api-keys"}

echo "🔐 SECRETS ROTATION SCRIPT"
echo "=========================="
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

echo "Key Vault: $KEY_VAULT_NAME"
echo "Rotation Type: $ROTATION_TYPE"
echo ""

rotate_api_keys() {
  echo "🔑 Rotating MCP API Keys..."
  echo ""
  
  # Generate new keys
  echo "Generating new API keys..."
  NEW_KEY_1=$(openssl rand -base64 32)
  NEW_KEY_2=$(openssl rand -base64 32)
  NEW_KEY_3=$(openssl rand -base64 32)
  
  echo "✅ New keys generated"
  
  # Get current keys
  echo "Retrieving current keys from Key Vault..."
  CURRENT_KEYS=$(az keyvault secret show \
    --vault-name "$KEY_VAULT_NAME" \
    --name mcp-api-keys \
    --query value \
    --output tsv 2>/dev/null) || {
    echo "⚠️  No existing keys found. Creating new set..."
    CURRENT_KEYS=""
  }
  
  # Add new keys
  if [ -z "$CURRENT_KEYS" ]; then
    NEW_KEYS="$NEW_KEY_1,$NEW_KEY_2,$NEW_KEY_3"
  else
    NEW_KEYS="$CURRENT_KEYS,$NEW_KEY_1,$NEW_KEY_2,$NEW_KEY_3"
  fi
  
  echo "Adding new keys to Key Vault..."
  az keyvault secret set \
    --vault-name "$KEY_VAULT_NAME" \
    --name mcp-api-keys \
    --value "$NEW_KEYS" \
    --output none
  
  echo "✅ New API keys added to Key Vault"
  echo ""
  echo "════════════════════════════════════════"
  echo "📋 NEW API KEYS (distribute to clients):"
  echo "════════════════════════════════════════"
  echo ""
  echo "Key 1: $NEW_KEY_1"
  echo "Key 2: $NEW_KEY_2"
  echo "Key 3: $NEW_KEY_3"
  echo ""
  echo "⚠️  IMPORTANT:"
  echo "  1. Distribute these keys to all API consumers"
  echo "  2. Old keys will remain active for 30 days"
  echo "  3. Run './rotate-secrets.sh cleanup-old-keys' after 30 days"
  echo ""
  echo "📧 Email template for API consumers:"
  echo "────────────────────────────────────────"
  echo "Subject: MCP API Key Rotation - Action Required"
  echo ""
  echo "New MCP API keys are available. Please update your applications"
  echo "within 30 days. Old keys will be deactivated on [DATE + 30 days]."
  echo ""
  echo "New Keys (use any one):"
  echo "  $NEW_KEY_1"
  echo "  $NEW_KEY_2"
  echo "  $NEW_KEY_3"
  echo ""
  echo "Update in Copilot Studio:"
  echo "  1. Go to Copilot Studio → Connectors"
  echo "  2. Edit MCP connector"
  echo "  3. Update X-API-Key header value"
  echo "  4. Test and save"
  echo "────────────────────────────────────────"
  echo ""
}

rotate_bc_secret() {
  echo "🔑 Rotating BC Client Secret..."
  echo ""
  echo "⚠️  Manual steps required:"
  echo ""
  echo "1. Create new client secret in Azure AD:"
  echo "   - Go to Azure AD → App registrations → Your BC App"
  echo "   - Click 'Certificates & secrets'"
  echo "   - Click '+ New client secret'"
  echo "   - Description: 'MCP Server $(date +%Y)'"
  echo "   - Expires: 12 months"
  echo "   - Click 'Add' and copy the VALUE"
  echo ""
  echo "2. Update Key Vault with new secret:"
  echo "   az keyvault secret set \\"
  echo "     --vault-name $KEY_VAULT_NAME \\"
  echo "     --name bc-client-secret \\"
  echo "     --value <NEW_SECRET_VALUE>"
  echo ""
  echo "3. Restart the MCP server:"
  echo "   az containerapp restart \\"
  echo "     --name mcp-bc-server \\"
  echo "     --resource-group mcp-production-rg"
  echo ""
  echo "4. Verify BC connectivity:"
  echo "   curl https://<your-url>/health"
  echo ""
  echo "5. After 7 days, remove old secret from Azure AD"
  echo ""
}

cleanup_old_keys() {
  echo "🧹 Removing old API keys..."
  echo ""
  
  # Get current keys
  echo "Retrieving current keys..."
  CURRENT_KEYS=$(az keyvault secret show \
    --vault-name "$KEY_VAULT_NAME" \
    --name mcp-api-keys \
    --query value \
    --output tsv)
  
  # Split by comma and count
  IFS=',' read -ra KEYS <<< "$CURRENT_KEYS"
  TOTAL=${#KEYS[@]}
  
  echo "Current number of keys: $TOTAL"
  
  if [ "$TOTAL" -le 3 ]; then
    echo "✅ Only 3 or fewer keys present. Nothing to clean up."
    exit 0
  fi
  
  # Keep last 3 keys
  START=$((TOTAL - 3))
  NEW_KEYS="${KEYS[$START]},${KEYS[$START+1]},${KEYS[$START+2]}"
  
  echo ""
  echo "Will remove $START old key(s) and keep the 3 newest"
  echo ""
  echo "⚠️  WARNING: This will invalidate old API keys!"
  echo "Make sure all clients have updated to new keys."
  echo ""
  echo "Press ENTER to continue or Ctrl+C to cancel..."
  read
  
  echo ""
  echo "Updating Key Vault..."
  az keyvault secret set \
    --vault-name "$KEY_VAULT_NAME" \
    --name mcp-api-keys \
    --value "$NEW_KEYS" \
    --output none
  
  echo "✅ Old keys removed"
  echo ""
  echo "⚠️  Next step: Restart MCP server to apply changes"
  echo "   az containerapp restart --name mcp-bc-server --resource-group mcp-production-rg"
  echo ""
}

case $ROTATION_TYPE in
  "api-keys")
    rotate_api_keys
    ;;
  "bc-secret")
    rotate_bc_secret
    ;;
  "cleanup-old-keys")
    cleanup_old_keys
    ;;
  "all")
    rotate_api_keys
    echo ""
    echo "════════════════════════════════════════"
    echo ""
    rotate_bc_secret
    ;;
  *)
    echo "Usage: $0 [api-keys|bc-secret|cleanup-old-keys|all]"
    echo ""
    echo "Commands:"
    echo "  api-keys          - Add new MCP API keys (quarterly)"
    echo "  bc-secret         - Instructions for BC secret rotation (annually)"
    echo "  cleanup-old-keys  - Remove old API keys after 30 days"
    echo "  all               - Run api-keys and bc-secret"
    echo ""
    exit 1
    ;;
esac

echo "════════════════════════════════════════"
echo "✅ Rotation complete!"
echo "════════════════════════════════════════"
echo ""

