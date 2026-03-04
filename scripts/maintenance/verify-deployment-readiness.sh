#!/bin/bash
# Deployment Readiness Verification Script
# Checks all prerequisites before deploying to production

set -e

echo "╔══════════════════════════════════════════════════════╗"
echo "║  DEPLOYMENT READINESS VERIFICATION                   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

ERRORS=0
WARNINGS=0

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

check_pass() {
  echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
  echo -e "${RED}❌ $1${NC}"
  ERRORS=$((ERRORS + 1))
}

check_warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
  WARNINGS=$((WARNINGS + 1))
}

echo "📋 Phase 1: Prerequisites"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Node.js
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  check_pass "Node.js installed: $NODE_VERSION"
else
  check_fail "Node.js not found (required: >=20.0.0)"
fi

# Check npm
if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm --version)
  check_pass "npm installed: $NPM_VERSION"
else
  check_fail "npm not found"
fi

# Check Azure CLI (for Azure deployments)
if command -v az &> /dev/null; then
  AZ_VERSION=$(az version --query '\"azure-cli\"' -o tsv)
  check_pass "Azure CLI installed: $AZ_VERSION"
else
  check_warn "Azure CLI not found (needed for Azure deployment)"
fi

# Check Docker (optional)
if command -v docker &> /dev/null; then
  DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
  check_pass "Docker installed: $DOCKER_VERSION"
else
  check_warn "Docker not found (optional for local testing)"
fi

echo ""
echo "📋 Phase 2: Project Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check essential files exist
[ -f "package.json" ] && check_pass "package.json exists" || check_fail "package.json missing"
[ -f "tsconfig.json" ] && check_pass "tsconfig.json exists" || check_fail "tsconfig.json missing"
[ -f "Dockerfile" ] && check_pass "Dockerfile exists" || check_fail "Dockerfile missing"
[ -f "env.example" ] && check_pass "env.example exists" || check_fail "env.example missing"
[ -f "deploy-to-azure.sh" ] && check_pass "deploy-to-azure.sh exists" || check_warn "deploy-to-azure.sh missing"

# Check source files
[ -d "src" ] && check_pass "src/ directory exists" || check_fail "src/ directory missing"
[ -f "src/index.ts" ] && check_pass "src/index.ts exists" || check_fail "src/index.ts missing"
[ -f "src/server.ts" ] && check_pass "src/server.ts exists" || check_fail "src/server.ts missing"
[ -f "src/config/validator.ts" ] && check_pass "Environment validator exists" || check_fail "src/config/validator.ts missing"

# Check scripts
[ -f "scripts/emergency-rollback.sh" ] && check_pass "Emergency rollback script exists" || check_warn "Emergency rollback script missing"
[ -f "scripts/rotate-secrets.sh" ] && check_pass "Secrets rotation script exists" || check_warn "Secrets rotation script missing"

echo ""
echo "📋 Phase 3: Dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check node_modules
if [ -d "node_modules" ]; then
  check_pass "Dependencies installed"
else
  check_warn "node_modules not found - run: npm install"
fi

echo ""
echo "📋 Phase 4: Build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if dist exists
if [ -d "dist" ]; then
  check_pass "Build output exists"
  
  # Check key files
  [ -f "dist/index.js" ] && check_pass "dist/index.js exists" || check_warn "dist/index.js missing - run: npm run build"
  [ -f "dist/server.js" ] && check_pass "dist/server.js exists" || check_warn "dist/server.js missing - run: npm run build"
  [ -f "dist/config/validator.js" ] && check_pass "Validator compiled" || check_warn "Validator not compiled"
else
  check_warn "Build not found - run: npm run build"
fi

echo ""
echo "📋 Phase 5: Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check for .env file
if [ -f ".env" ]; then
  check_pass ".env file exists"
  
  # Check for critical variables
  if grep -q "MCP_API_KEYS=" .env 2>/dev/null; then
    check_pass "MCP_API_KEYS configured"
  else
    check_warn "MCP_API_KEYS not set in .env"
  fi
  
  if grep -q "NODE_ENV=" .env 2>/dev/null; then
    check_pass "NODE_ENV configured"
  else
    check_warn "NODE_ENV not set in .env"
  fi
else
  check_warn ".env file missing - copy from env.example"
fi

echo ""
echo "📋 Phase 6: Documentation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check essential documentation
[ -f "docs/v2.0-simplified/DEPLOYMENT_QUICKSTART.md" ] && check_pass "Deployment quick start" || check_warn "Deployment quick start missing"
[ -f "docs/v2.0-simplified/APPLICATION_INSIGHTS_SETUP.md" ] && check_pass "Monitoring guide" || check_warn "Monitoring guide missing"
[ -f "docs/v2.0-simplified/ROLLBACK_STRATEGY.md" ] && check_pass "Rollback strategy" || check_warn "Rollback strategy missing"
[ -f "docs/v2.0-simplified/PRE_DEPLOYMENT_CHECKLIST.md" ] && check_pass "Pre-deployment checklist" || check_warn "Pre-deployment checklist missing"

echo ""
echo "📋 Phase 7: GitHub Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[ -f ".github/workflows/deploy-mcp-server.yml" ] && check_pass "GitHub Actions workflow exists" || check_warn "GitHub Actions workflow missing"

echo ""
echo "══════════════════════════════════════════════════════"
echo "📊 VERIFICATION RESULTS"
echo "══════════════════════════════════════════════════════"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}✅ ALL CHECKS PASSED!${NC}"
  echo ""
  echo "🚀 Ready to deploy to production!"
  echo ""
  echo "Next steps:"
  echo "  1. Review env.example and configure .env"
  echo "  2. Run: npm run build"
  echo "  3. Run: node dist/index.js (validates environment)"
  echo "  4. Deploy: ./deploy-to-azure.sh"
  echo ""
  EXIT_CODE=0
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}⚠️  CHECKS PASSED WITH $WARNINGS WARNING(S)${NC}"
  echo ""
  echo "✅ Safe to proceed, but review warnings above"
  echo ""
  EXIT_CODE=0
else
  echo -e "${RED}❌ VERIFICATION FAILED${NC}"
  echo ""
  echo "Errors: $ERRORS"
  echo "Warnings: $WARNINGS"
  echo ""
  echo "⚠️  Fix errors before deploying to production"
  echo ""
  EXIT_CODE=1
fi

echo "══════════════════════════════════════════════════════"
echo ""

exit $EXIT_CODE
