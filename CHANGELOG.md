# Changelog

All notable changes to the Business Central MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.7] - 2026-03-04

### Added
- **npm/npx Support** - Server can now be installed and run as an npm package
  - `npx business-central-mcp-server --stdio` for zero-install usage
  - `npm install -g business-central-mcp-server` for global CLI
  - CLI arguments: `--tenantId`, `--clientId`, `--clientSecret`, `--environment`, `--companyId`
  - Compatible with Claude Desktop, Claude Code, Cline, Cursor via `.mcp.json`
- **Centralized Version** - Single `src/version.ts` reads from `package.json` at runtime
- **OData Validation** - Wired `ODataValidator` into `generic-executor.ts` for input sanitization
- **Graceful Shutdown** - HTTP server drains connections with 10s timeout on SIGTERM/SIGINT

### Changed
- **stdio Transport Rewrite** - Migrated from entity-specific `ToolExecutor` to `GenericToolExecutor` with 14 generic tools
  - Persistent session state (BCApiClient, CompanyManager, ApiContextManager) across tool calls
  - Matches the same architecture as HTTP transport
- **Structured Logging** - Replaced 13 `console.log`/`console.error` calls in protocol.ts with `logger`
- **HTTP State Management** - Added `ManagedSession` with `Map<string, ManagedSession>` keyed by `tenantId:environment`
  - Replaces per-request instantiation of CompanyManager/ApiContextManager/BCApiClient
- **Documentation** - Complete README rewrite covering both npm (developer) and Azure (enterprise) deployment modes

### Fixed
- **bc/client.ts** - Fixed `logApiCall` type error: `logger.error()` expects `(message, Error?, properties?)` signature
- **MCP SDK Compatibility** - Removed `request.params.limit` references (removed from MCP SDK types); cursor-only pagination
- **Protocol Version Negotiation** - Server negotiates MCP protocol version with clients (2024-11-05 for Copilot Studio, 2025-03-26 for newer)

### Removed
- 8 unused modules: `registry.ts`, `batch-operations.ts`, `simple-mcp-endpoint.ts`, `http-simple.ts`, `health-check.ts`, `tool-categorization.ts`, `correlation.ts`, `typescript-generator.ts`

### Security
- **DCR Secret Handling** - Removed logging of client secrets in DCR flow
- **OAuth Validation** - Added token expiry and audience validation
- **Log Sanitization** - Ensured sensitive fields are sanitized in structured logs
- **SECURITY.md** - Removed real credentials from example sections

### Known Issues
- **Copilot Studio UI:** Tools show as "No tools available" in setup UI (protocol 2024-11-05). Tools work at runtime.
- **Prompts:** MCP Prompts require protocol 2025-03-26, not yet supported in Copilot Studio

## [2.2.6] - 2025-10-27

### Added
- **Dual Authentication Support** - Implemented simultaneous API Key and OAuth authentication for Copilot Studio integration
  - API Key authentication for MCP protocol discovery (initialize, tools/list, resources/list, prompts/list)
  - OAuth authentication for user-initiated tool execution with user context and audit logging
  - New `DualAuth` middleware class in `src/auth/dual.ts`
  - Automatic detection of authentication type (X-API-Key, Bearer API Key, or Bearer JWT)
  - Clear error messages listing all supported authentication methods

### Changed
- **Authentication Mode** - When `AUTH_MODE=oauth`, server now uses dual authentication instead of OAuth-only
  - Accepts both API Key and OAuth tokens on the same endpoint
  - Routes requests to appropriate validator (ApiKeyAuth or MCPOAuthAuth)
  - Business Central API authentication unchanged (always uses OAuth client credentials)

### Fixed
- **Copilot Studio Discovery Issue** - Fixed OAuth-only mode blocking API Key requests needed for MCP discovery
  - **Problem:** Server in OAuth-only mode rejected API Key authentication
  - **Impact:** Copilot Studio couldn't discover tools/resources (tools/list calls were blocked)
  - **Solution:** Dual authentication allows API Key for discovery, OAuth for execution
  - **Result:** Copilot Studio can now discover MCP capabilities using API Key

### Security
- User-level audit logging with OAuth tokens (includes user email, name, userId)
- API Key still supported for backward compatibility
- BC API authentication remains OAuth client credentials (no security changes)
- Token validation uses Microsoft public keys (JWKS)

## [2.2.5] - 2025-10-27

### Added
- **MCP Prompts (Inputs) Support** - Implemented 5 prompt templates for Copilot Studio "Inputs" section
  - `query-customers` - Query customers with optional filters
  - `query-sales-orders` - Query sales orders with filters
  - `create-customer` - Create new customer with fields
  - `explore-entities` - Discover available entities and schemas
  - `switch-company` - Switch to different BC company
- **Prompts Endpoints** - Added `prompts/list` and `prompts/get` handlers
- **Dynamic Prompt Generation** - Generates context-specific prompts based on arguments

### Changed
- **MCP Capabilities** - Updated initialize response to advertise prompts support
  - `prompts.listChanged: true` in capabilities
- **Protocol Version** - Ready for MCP protocol 2025-03-26 clients

### Note
- Prompts (Inputs) only available for MCP protocol 2025-03-26+ clients
- Not supported in Copilot Studio (uses protocol 2024-11-05)

## [2.2.4] - 2025-10-27

### Added
- **MCP Resources Support** - Implemented 5 contextual resources for Business Central environment
  - `bc://environment/info` - Current BC environment details (tenant, environment name, API version, company)
  - `bc://api/context` - Active API context (publisher, group, version)
  - `bc://companies/list` - List of all BC companies in current environment
  - `bc://entities/list` - List of all BC entities available in current API context
  - `bc://tools/guide` - Tool usage guide with patterns and examples
- **Resources Endpoints** - Added `resources/list` and `resources/read` handlers
- **Dynamic Resource Content** - Resources return live data from Business Central

### Changed
- **MCP Capabilities** - Updated initialize response to advertise resources support
  - `resources.subscribe: true` and `resources.listChanged: true`
- **Resource URIs** - Using `bc://` protocol for Business Central resources

## [2.1.1] - 2025-01-25

### Changed
- **Tool Rename for Clarity** - Renamed `list_available_apis` to `list_bc_api_contexts` to eliminate confusion with MCP Server's protocol-level tools list
  - MCP Clients were misinterpreting the tool as listing MCP server APIs instead of Business Central API contexts
  - New name explicitly indicates it lists Business Central API contexts (publisher/group/version combinations)
  - Updated all tool descriptions to be more concise and professional (50-140 words vs 150-400 words)
  - All descriptions now clearly distinguish Business Central operations from MCP protocol operations

## [2.0.3] - 2025-01-22

### Added
- **MCP Protocol 2025-03-26 Support** - Upgraded from protocol version `2024-11-05` to `2025-03-26` (March 2025 specification)
- **Tool Safety Annotations** - Added `readOnly` and `destructive` annotations to all 14 generic tools for improved UX in Copilot Studio
  - 9 tools marked as `readOnly` (safe, read-only operations)
  - 5 tools marked as `destructive` (modifies data or global state)
- **Completions Capability** - Declared support for argument autocompletion in MCP protocol
- **API Context Switching** - 3 new tools for dynamic API switching
  - `list_bc_api_contexts` (formerly `list_available_apis`) - Discover standard BC, Microsoft extended, and custom ISV APIs
  - `set_active_api` - Switch between different API contexts
  - `get_active_api` - Get current API context information
- **Enhanced Generic Tools** - Expanded from 7 to 14 tools with new capabilities
  - API context management (3 tools)
  - Company management (3 tools)
  - Resource discovery (3 tools)
  - CRUD operations (5 tools)

### Changed
- **Protocol Version** - Updated MCP protocol version from `2024-11-05` to `2025-03-26`
- **Server Version** - Bumped version from `2.0.2` to `2.0.3`
- **Tool Count** - Increased generic tools from 7 to 14 with API switching capabilities
- **API Support** - Enhanced support for standard BC API, Microsoft extended APIs, and custom ISV APIs

### Fixed
- **get_odata_metadata Tool** - Fixed bug where tool wasn't respecting active API context (was using static config instead of dynamic API context)
- **Tool Count Comment** - Fixed hardcoded "7 tools" comment to use dynamic `${GENERIC_TOOLS.length}`

### Technical Details

**Files Modified:**
- `src/interfaces/index.ts` - Added annotations to MCPTool interface
- `src/tools/generator.ts` - Updated MCPTool interface for tool annotations
- `src/tools/generic-tools.ts` - Added annotations to all 14 tools
- `src/mcp/protocol.ts` - Updated protocol version and added completions capability
- `src/transports/copilot-sse.ts` - Updated protocol version in SSE transport

**MCP 2025-03-26 Enhancements:**
1. **Tool Annotations** - Better UX for destructive operations (Copilot Studio can warn users)
2. **Completions Capability** - Prepares for future argument autocompletion support
3. **Backward Compatible** - All existing functionality preserved

**Benefits:**
- ✅ **Copilot Studio Compatibility** - Should resolve tool visibility issues
- ✅ **Better UX** - Users warned before destructive operations
- ✅ **Latest Protocol** - Compliant with March 2025 MCP specification
- ✅ **Multi-API Support** - Work with standard, Microsoft, and custom ISV APIs

### Migration Notes

**From 2.0.2 to 2.0.3:**
- No breaking changes
- Existing configurations work without modification
- Tool count increased from 7 to 14 (backward compatible)
- New API context tools are optional (defaults to standard BC API v2.0)

## [2.0.2] - 2025-01-20

### Added
- Generic tools mode (7 universal tools)
- Company management with session-based active company
- Dual tool modes (generic vs dynamic)

### Changed
- Refactored to simplified single-service architecture
- Reduced code complexity by 88%

## [2.0.0] - 2025-01-15

### Added
- Initial release of v2.0
- Complete rewrite as single-service architecture
- OAuth 2.0 authentication support
- Azure Container Apps deployment
- Application Insights monitoring

---

**Legend:**
- `Added` - New features
- `Changed` - Changes to existing functionality
- `Deprecated` - Soon-to-be removed features
- `Removed` - Removed features
- `Fixed` - Bug fixes
- `Security` - Security improvements
