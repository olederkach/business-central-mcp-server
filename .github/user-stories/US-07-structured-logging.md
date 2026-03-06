# US-07: Replace console.* with structured logger

| Field | Value |
|-------|-------|
| **Priority** | P1 — Observability |
| **Branch** | `fix/US07-structured-logging` |
| **Wave** | 1 (no dependencies) |
| **Effort** | 1 hr |
| **Review findings** | Finding 3 (main report); H-4 (architecture); Finding 3 (security); M-1 (code quality) |

## User Story

**As a** DevOps engineer,
**I want** all log output to go through the structured logger,
**so that** logs are JSON-formatted, sanitized of sensitive data, and integrated with Application Insights.

## Context

The project has a well-designed structured logger (`src/utils/logger.ts`) with:
- JSON output for production
- Log level filtering
- Application Insights integration
- Integration point for `LogSanitizer`

However, **71+ occurrences** of raw `console.log`, `console.error`, and `console.warn` bypass all of this. Particularly concerning:
- `auth/oauth-mcp.ts` logs `userId`, `email`, `name`, `scopes` (PII) via raw `console.log`
- `bc/metadata.ts` logs raw metadata URLs and response data to stdout
- `auth/oauth.ts` logs full error objects from OAuth operations

**Exception:** `src/transports/stdio-server.ts` uses `console.error` intentionally — the MCP spec defines stderr as the diagnostic channel for stdio transport. These should NOT be changed.

## Acceptance Criteria

- [ ] No `console.log`, `console.error`, `console.warn` in non-stdio source files
- [ ] `stdio-server.ts` retains `console.error` (MCP spec requirement)
- [ ] `grep -rn "console\.\(log\|error\|warn\)" src/ --include="*.ts" | grep -v stdio-server` returns 0 results
- [ ] PII fields in `oauth-mcp.ts` log calls are sanitized or removed
- [ ] `npm run build` succeeds

## Tasks

### Task 1: Replace console.* in auth modules
- **Files:**
  - `src/auth/oauth.ts` — 5 occurrences (`console.error` for OAuth errors)
  - `src/auth/api-key.ts` — 3 occurrences (`console.warn` for Key Vault, `console.error` for auth errors)
  - `src/auth/oauth-mcp.ts` — 15+ occurrences (audit each for PII — `userId`, `email`, `name` should not be logged or should be sanitized)
- **Change:** Import `logger` from `../utils/logger.js`, replace calls

### Task 2: Replace console.* in BC modules
- **Files:**
  - `src/bc/client.ts` — 1 occurrence (`console.warn` for OAuth not configured)
  - `src/bc/metadata.ts` — 8+ occurrences (`console.log` for metadata URL, response data)
- **Change:** Import `logger`, replace calls

### Task 3: Replace console.* in config/monitoring modules
- **Files:**
  - `src/config.ts` — 6 occurrences (`console.warn` for missing config, `console.error` for URL parse)
  - `src/config/validator.ts` — 8 occurrences
  - `src/monitoring/app-insights.ts` — 3 occurrences
- **Change:** Import `logger`, replace calls

## Files Changed

- `src/auth/oauth.ts`
- `src/auth/api-key.ts`
- `src/auth/oauth-mcp.ts`
- `src/bc/client.ts`
- `src/bc/metadata.ts`
- `src/config.ts`
- `src/config/validator.ts`
- `src/monitoring/app-insights.ts`

## Verification

```bash
npm run build
grep -rn "console\.\(log\|error\|warn\)" src/ --include="*.ts" | grep -v stdio-server
# Expected: 0 results
```
