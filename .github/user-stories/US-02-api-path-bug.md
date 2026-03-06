# US-02: Fix getBaseApiPath double-prefix bug and stale tool count

| Field | Value |
|-------|-------|
| **Priority** | P0 — Functional bug |
| **Branch** | `fix/US02-api-path-bug` |
| **Wave** | 1 (no dependencies) |
| **Effort** | 5 min |
| **Review findings** | Finding 7 (main report); M-5 (code quality); Finding 8 (architecture) |

## User Story

**As a** user of the `get_odata_metadata` tool,
**I want** the metadata URL to be correctly constructed,
**so that** OData metadata requests don't fail with a malformed path.

## Context

`BCApiClient.getBaseApiPath()` at `src/bc/client.ts:531-534` produces a doubled URL path:
```
/v2.0/{tenant}/{env}/v2.0/{tenant}/{env}/api/v2.0
```

This is because `buildBaseApiPath()` already returns `/v2.0/{tenant}/{env}/api/{version}`, but `getBaseApiPath()` wraps it with another `/v2.0/{tenant}/{env}` prefix. The `get_odata_metadata` tool uses this method to construct metadata URLs, so metadata requests are broken.

Additionally, `protocol.ts:290` says "13 tools" but the system has 14 generic tools.

## Acceptance Criteria

- [ ] `getBaseApiPath()` returns `/v2.0/{tenant}/{env}/api/{version}` (single prefix, no duplication)
- [ ] Error message references correct tool count (14, not 13)
- [ ] `npm run build` succeeds

## Tasks

### Task 1: Fix getBaseApiPath()
- **File:** `src/bc/client.ts` lines 531-534
- **Change:** Replace method body with:
  ```typescript
  getBaseApiPath(): string {
    return this.buildBaseApiPath(this.getEffectiveConfig());
  }
  ```

### Task 2: Fix stale tool count
- **File:** `src/mcp/protocol.ts` line 290
- **Change:** Replace hardcoded `"Only generic tools (13 tools) are supported"` with:
  ```typescript
  `Tool not found: ${toolName}. Only generic tools (${GENERIC_TOOLS.length} tools) are supported.`
  ```

## Files Changed

- `src/bc/client.ts`
- `src/mcp/protocol.ts`

## Verification

```bash
npm run build
# Manual: verify getBaseApiPath() output for standard and custom API configs
```
