# US-04: Harden OAuth authentication

| Field | Value |
|-------|-------|
| **Priority** | P1 — Security |
| **Branch** | `fix/US04-oauth-hardening` |
| **Wave** | 1 (no dependencies) |
| **Effort** | 45 min |
| **Review findings** | Finding 6 (main report); Findings 1, 2, 19 (security agent); Finding 6 (security - dual auth) |

## User Story

**As a** server operator,
**I want** the OAuth flow to validate JWT audience, include CSRF protection, and correctly distinguish JWTs from API keys,
**so that** tokens from other Azure AD apps are rejected, the OAuth flow is CSRF-safe, and auth routing is reliable.

## Context

Three related OAuth/auth weaknesses:

1. **Missing audience validation:** `jwt.verify()` in `oauth.ts` checks issuer but not `audience`. A valid Azure AD token issued for a *different* application would be accepted.

2. **Missing CSRF state:** The OAuth authorization flow (`initiateFlow` / `handleCallback`) doesn't use the `state` parameter required by RFC 6749 Section 10.12 to prevent CSRF attacks.

3. **Fragile JWT detection:** `dual.ts` uses `token.includes('.')` to distinguish JWTs from API keys. API keys containing dots (common in base64) would be incorrectly routed to OAuth validation.

## Acceptance Criteria

- [ ] `jwt.verify()` includes `audience` option matching the app's client ID
- [ ] `initiateFlow` generates and stores a cryptographic `state` parameter
- [ ] `handleCallback` validates `state` before exchanging the authorization code
- [ ] Dual auth uses `token.split('.').length === 3` for JWT detection
- [ ] `npm run build` succeeds

## Tasks

### Task 1: Add JWT audience validation
- **File:** `src/auth/oauth.ts` lines 194-200
- **Change:** Add `audience` to the `jwt.verify` options:
  ```typescript
  jwt.verify(token, signingKey, {
    issuer: [...],
    audience: process.env.AZURE_CLIENT_ID || process.env.BC_CLIENT_ID,
    clockTolerance: 30
  });
  ```

### Task 2: Add CSRF state parameter to OAuth flow
- **File:** `src/auth/oauth.ts`
- **Change in `initiateFlow`:** Generate `const state = crypto.randomUUID()`, store in a `Map<string, number>` (value = timestamp) with cleanup of entries older than 10 minutes, add `state` to `authUrlRequest`
- **Change in `handleCallback`:** Read `req.query.state`, validate it exists in the state map, delete after use. Return 400 if missing or invalid.

### Task 3: Improve JWT detection heuristic
- **File:** `src/auth/dual.ts` line 47
- **Change:** Replace `token.includes('.')` with `token.split('.').length === 3`

## Files Changed

- `src/auth/oauth.ts`
- `src/auth/dual.ts`

## Verification

```bash
npm run build
# Manual: JWT without matching audience should be rejected
# Manual: OAuth callback without valid state should return 400
# Manual: API key with dots (e.g., "abc.def") should not route to JWT validation
```
