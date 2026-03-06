# US-10: Harden HTTP security middleware

| Field | Value |
|-------|-------|
| **Priority** | P2 — Security |
| **Branch** | `fix/US10-http-middleware-hardening` |
| **Wave** | 1 (no dependencies) |
| **Effort** | 30 min |
| **Review findings** | Finding 8 (main report); Findings 11, 17 (security agent); Finding 31 (consolidated report) |

## User Story

**As a** server operator,
**I want** CORS wildcard with credentials blocked, request IDs sanitized, and dead config removed,
**so that** cross-origin attacks are prevented and log injection via headers is blocked.

## Context

Three related HTTP middleware issues:

1. **CORS wildcard + credentials:** When `CORS_ORIGINS=*`, the origin callback returns the requesting origin (not literal `*`), bypassing the browser's protection against `Access-Control-Allow-Origin: *` with `credentials: true`. This effectively allows any website to make authenticated requests.

2. **Unsanitized request ID:** `X-Request-ID` header is accepted as-is and echoed in responses and logs. A crafted header with newlines or control characters could enable log injection.

3. **Dead CORS config:** `config.ts` populates `corsOrigins` in `ServerConfig`, but `server.ts` reads `CORS_ORIGINS` directly from `process.env` — the config value is never used.

## Acceptance Criteria

- [ ] Setting `CORS_ORIGINS=*` logs a warning and denies cross-origin requests (does not silently allow all)
- [ ] `X-Request-ID` validated: alphanumeric + hyphens/underscores, max 128 chars
- [ ] Invalid `X-Request-ID` values replaced with a generated UUID
- [ ] `corsOrigins` removed from `ServerConfig` interface and `loadConfig()`
- [ ] `npm run build` succeeds

## Tasks

### Task 1: Block CORS wildcard with credentials
- **File:** `src/server.ts` line 84
- **Change:** Remove `allowedOrigins.includes('*')` check. If `*` is in the origins list, log a warning via `logger.warn('CORS_ORIGINS=* is not allowed with credentials; treating as no origins')` and treat as empty (deny all cross-origin).

### Task 2: Sanitize X-Request-ID header
- **File:** `src/middleware/request-id.ts` line 28
- **Change:** Add validation before accepting the header:
  ```typescript
  const incoming = req.headers['x-request-id'] as string;
  const isValid = incoming && /^[a-zA-Z0-9_-]{1,128}$/.test(incoming);
  const requestId = isValid ? incoming : randomUUID();
  ```

### Task 3: Remove dead corsOrigins config
- **File:** `src/config.ts`
- **Change:** Remove `corsOrigins: string[]` from `ServerConfig` interface and the `corsOrigins` line from `loadConfig()` return value

## Files Changed

- `src/server.ts`
- `src/middleware/request-id.ts`
- `src/config.ts`

## Verification

```bash
npm run build
# Manual: Set CORS_ORIGINS=* and verify warning is logged + cross-origin denied
# Manual: Send X-Request-ID with special chars, verify it's replaced with UUID
```
