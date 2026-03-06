# US-05: Fix copilot-sse transport — sessions, validation, and security

| Field | Value |
|-------|-------|
| **Priority** | P1 — Security + Functional bug |
| **Branch** | `fix/US05-copilot-sse-hardening` |
| **Wave** | 1 (no dependencies) |
| **Effort** | 1 hr |
| **Review findings** | Findings 1, 2 (architecture); H-4 (code quality); Finding 20 (security); Finding 12 (architecture) |

## User Story

**As a** Copilot Studio user,
**I want** `set_active_company` and `set_active_api` to persist across tool calls, and input validation to be applied,
**so that** context-switching tools actually work and the SSE transport has the same security posture as the HTTP transport.

## Context

The copilot-sse transport (`src/transports/copilot-sse.ts`, 1041 lines) has three critical issues:

1. **Stateless sessions:** Every `tools/call` creates brand new `BCApiClient`, `CompanyManager`, and `ApiContextManager` objects (~lines 304-311). This means `set_active_company` and `set_active_api` are silently broken — the context is lost after each call. Both `protocol.ts` and `stdio-server.ts` correctly maintain session state.

2. **No input validation:** The transport does NOT import or use `input-validator.ts`. Tool names, resource URIs, and JSON-RPC methods are accepted without validation. The `protocol.ts` transport validates all of these.

3. **Prompt argument injection:** Prompt arguments (e.g., `customerNumber`) are interpolated directly into OData filter strings (~lines 800-810) without escaping, enabling OData filter injection.

## Acceptance Criteria

- [ ] Session objects persist across requests for the same tenant/environment (using LRU cache)
- [ ] `set_active_company` followed by `list_records` uses the previously set company
- [ ] `validateToolName()` called before tool execution
- [ ] `validateResourceUri()` called before resource reading
- [ ] JSON-RPC method validated at request entry point
- [ ] Prompt arguments with single quotes are escaped before OData filter interpolation
- [ ] `npm run build` succeeds

## Tasks

### Task 1: Add session persistence
- **File:** `src/transports/copilot-sse.ts` ~lines 304-311
- **Change:** Import `LRUCache` from `lru-cache`. Add a module-level `sessions` cache keyed by `tenantId:environment` (same pattern as `protocol.ts`). In `tools/call`, look up or create session, reuse `BCApiClient`, `CompanyManager`, `ApiContextManager` across requests.

### Task 2: Add input validation
- **File:** `src/transports/copilot-sse.ts`
- **Change:** Import `validateJsonRpcMethod`, `validateToolName`, `validateResourceUri` from `../utils/input-validator.js`
- Add `validateToolName(toolName)` before tool execution (~line 289)
- Add `validateResourceUri(uri)` before resource reading (~line 409)
- Add method validation at request entry point

### Task 3: Sanitize prompt argument interpolation
- **File:** `src/transports/copilot-sse.ts` ~lines 800-810
- **Change:** Escape single quotes in prompt arguments before interpolating into OData filters. E.g., `customerNumber.replace(/'/g, "''")`

## Files Changed

- `src/transports/copilot-sse.ts`

## Verification

```bash
npm run build
# Manual: set_active_company then list_records — company should persist
# Manual: tool call with invalid tool name should return validation error
# Manual: prompt with customerNumber containing ' should not break the filter
```
