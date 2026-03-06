# US-06: Fix session memory leak and DCR timing vulnerability

| Field | Value |
|-------|-------|
| **Priority** | P1 — Security |
| **Branch** | `fix/US06-session-and-dcr-fixes` |
| **Wave** | 1 (no dependencies) |
| **Effort** | 30 min |
| **Review findings** | Finding 4 (main report); Finding 4 (security); Finding 9 (architecture); Finding 15 (security); M-8 (code quality) |

## User Story

**As a** server operator running in Azure,
**I want** sessions to be bounded and evicted, and secret comparison to be timing-safe,
**so that** the server doesn't exhaust memory under multi-tenant load and secret lengths aren't leaked via timing side-channels.

## Context

**Session leak:** `McpProtocolHandler.sessions` is an unbounded `Map<string, ManagedSession>` that grows indefinitely as new tenant/environment combinations connect. Each session holds a `BCApiClient`, `CompanyManager`, and `ApiContextManager`. In a multi-tenant Azure deployment, this creates an unbounded memory growth vector. The `lru-cache` package is already a dependency.

**DCR timing leak:** `auth/dcr.ts:validateClient` returns `false` immediately when buffer lengths differ, leaking the secret length via timing. The `api-key.ts:constantTimeCompare` method correctly handles this by padding buffers to equal length.

## Acceptance Criteria

- [ ] `McpProtocolHandler.sessions` uses `LRUCache` with `max: 100` and `ttl: 30 * 60 * 1000` (30 min)
- [ ] DCR `validateClient` pads buffers to equal length before `timingSafeEqual` (no early return on length mismatch)
- [ ] `npm run build` succeeds

## Tasks

### Task 1: Replace sessions Map with LRU cache
- **File:** `src/mcp/protocol.ts` line 62
- **Change:** Replace `private sessions = new Map<string, ManagedSession>()` with:
  ```typescript
  import { LRUCache } from 'lru-cache';
  // ...
  private sessions = new LRUCache<string, ManagedSession>({ max: 100, ttl: 30 * 60 * 1000 });
  ```
- Update `invalidateCache()` to call `this.sessions.clear()` (LRUCache supports this)
- Update `getCacheStats()` to report `this.sessions.size`

### Task 2: Fix DCR timing-unsafe comparison
- **File:** `src/auth/dcr.ts` lines 192-200
- **Change:** Replace early return on length mismatch with padding approach:
  ```typescript
  const maxLen = Math.max(secretBuf.length, expectedBuf.length);
  const paddedSecret = Buffer.alloc(maxLen);
  const paddedExpected = Buffer.alloc(maxLen);
  secretBuf.copy(paddedSecret);
  expectedBuf.copy(paddedExpected);
  return crypto.timingSafeEqual(paddedSecret, paddedExpected);
  ```

## Files Changed

- `src/mcp/protocol.ts`
- `src/auth/dcr.ts`

## Verification

```bash
npm run build
# Verify: sessions map is bounded (check LRUCache constructor args)
# Verify: DCR validateClient has no early return on length mismatch
```
