# Changelog

All notable changes to the Business Central MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-06

### Added

- **OAuth Authentication Mode** -- Full OAuth 2.0 proxy for Claude.ai and Copilot Studio
  - `/authorize` and `/token` proxy endpoints that relay to Azure AD
  - 7 discovery endpoints covering RFC 8414, RFC 9728, and OpenID Connect
  - Dynamic Client Registration (RFC 7591) for Copilot Studio
  - Protected Resource Metadata (RFC 9728) for OAuth client discovery
  - Unified app registration: one Azure AD app for both user OAuth and BC API access
- **MCS Dynamic Discovery** -- Copilot Studio can auto-discover OAuth configuration
  - `/.well-known/oauth-authorization-server` (RFC 8414)
  - `/.well-known/oauth-protected-resource` (RFC 9728)
  - `/.well-known/openid-configuration` (OpenID Connect)
  - Sub-path variants for `/mcp` resource scoping
- **Claude.ai Integration** -- OAuth connection via auto-discovered endpoints

### Changed

- **Rate Limiting** -- Increased auth limiter to 30 failed requests per 15 min (MCS compatibility)
- **DCR Endpoint** -- Made `/oauth/register` public (no auth required) for MCS compatibility
- **Documentation** -- Complete rewrite of all docs for community release
  - Depersonalized all examples with `<your-...>` placeholders
  - Added OAuth as primary enterprise auth alongside API key
  - Rewrote DEPLOYMENT.md with unified app registration setup
  - Rewrote COPILOT_STUDIO_COMPLETE_SETUP.md with Dynamic Discovery
  - Rewrote MCP_CLIENT_SETUP.md covering all 8 client configurations
  - Rewrote DCR_SETUP_GUIDE.md with 7 discovery endpoints
  - Updated QUICK_START.md, README.md, docs index

### Removed

- `SECURITY_TESTING_GUIDE.md` -- Internal testing document with hardcoded infrastructure URLs
- `TROUBLESHOOTING_COPILOT_STUDIO.md` -- Content merged into Copilot Studio guide

### Security

- Removed hardcoded infrastructure URLs and internal identifiers from documentation
- Ensured no credentials in any committed files

## [1.0.1] - 2026-03-04

### Added

- **npm/npx Support** -- Server can be installed and run as an npm package
  - `npx business-central-mcp-server --stdio` for zero-install usage
  - `npm install -g business-central-mcp-server` for global CLI
  - CLI arguments: `--tenantId`, `--clientId`, `--clientSecret`, `--environment`, `--companyId`
  - Compatible with Claude Desktop, Claude Code, Cline, Cursor via `.mcp.json`
- **Centralized Version** -- Single `src/version.ts` reads from `package.json` at runtime
- **OData Validation** -- Wired `ODataValidator` into `generic-executor.ts` for input sanitization
- **Graceful Shutdown** -- HTTP server drains connections with 10s timeout on SIGTERM/SIGINT
- **Testing Infrastructure** -- Vitest with 104 tests covering validators, executor, config, and client
- **CI Quality Gates** -- GitHub Actions workflow for lint, type-check, test, and security audit

### Changed

- **stdio Transport Rewrite** -- Migrated from entity-specific `ToolExecutor` to `GenericToolExecutor` with 14 generic tools
- **Structured Logging** -- Replaced all `console.log`/`console.error` calls with structured logger
- **HTTP State Management** -- Added `ManagedSession` with `Map<string, ManagedSession>` keyed by `tenantId:environment`

### Fixed

- **Double-prefix bug** -- `getBaseApiPath()` no longer produces malformed URLs
- **OData false positives** -- Parentheses inside quoted strings no longer trigger validation errors
- **Type coercion** -- Empty strings and `Infinity` no longer coerced to numeric values
- **Request ID sanitization** -- Invalid `X-Request-ID` headers replaced with generated UUIDs

### Security

- Entity name validation blocks path traversal via `resource` parameter
- CORS wildcard (`*`) now logs a warning and denies (not silently allows all)
- DCR timing-safe secret comparison with buffer padding
- Session memory bounded by LRU cache with TTL

## [1.0.0] - 2026-02-15

### Added

- Initial public release
- 14 generic tools for Business Central API operations
- Dual transport: stdio (developer) and HTTP/SSE (enterprise)
- MCP protocol negotiation (2024-11-05 and 2025-03-26)
- API key and OAuth authentication modes
- Dynamic Client Registration (RFC 7591)
- Multi-API support (standard BC, Microsoft extended, custom ISV)
- Application Insights monitoring
- Azure Key Vault integration
- Rate limiting and request size limits
- OData injection protection
- Tool annotations (readOnlyHint, destructiveHint)

---

**Legend:**

- `Added` -- New features
- `Changed` -- Changes to existing functionality
- `Removed` -- Removed features
- `Fixed` -- Bug fixes
- `Security` -- Security improvements
