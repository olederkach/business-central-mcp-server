# US-01: Remove leaked data from published package

| Field | Value |
|-------|-------|
| **Priority** | P0 — Emergency |
| **Branch** | `fix/US01-remove-leaked-data` |
| **Wave** | 1 (no dependencies) |
| **Effort** | 15 min |
| **Review findings** | C-1, C-2, C-3 (code quality agent); Finding 8 (security agent) |

## User Story

**As a** package consumer,
**I want** no personal information or internal infrastructure URLs in the npm package,
**so that** installing the package doesn't expose the author's identity or production endpoints.

## Context

The published npm package contains:
- Hardcoded developer name `"Oleksandr Derkach"` and company `"Elevaite"` in `copilot-sse.ts`
- Hardcoded Azure Container Apps URL `https://mcp-bc-f940e489.salmonhill-7df6cca4.eastus.azurecontainerapps.io` in `spec.ts` and `routes.ts`

These ship to every `npm install` and expose internal infrastructure details.

## Acceptance Criteria

- [ ] No hardcoded names ("Oleksandr Derkach", "Elevaite") in any source file
- [ ] No hardcoded Azure Container Apps URLs in any source file
- [ ] `grep -r "Oleksandr\|Elevaite\|salmonhill\|f940e489" src/` returns 0 results
- [ ] `npm run build` succeeds

## Tasks

### Task 1: Remove hardcoded PII from copilot-sse.ts
- **File:** `src/transports/copilot-sse.ts` ~lines 443-456
- **Change:** Replace hardcoded tenant name and company name with dynamic values from `bcConfig` / `companyManager`, or generic labels like `'(from config)'`

### Task 2: Remove hardcoded URL from OpenAPI spec
- **File:** `src/openapi/spec.ts` ~line 22
- **Change:** Replace hardcoded Azure URL with `process.env.SERVER_URL || 'http://localhost:3005'`

### Task 3: Remove hardcoded URL from OpenAPI routes
- **File:** `src/openapi/routes.ts` ~line 37
- **Change:** Replace hardcoded URL with dynamic `${req.protocol}://${req.get('host')}/api/openapi.json`

## Files Changed

- `src/transports/copilot-sse.ts`
- `src/openapi/spec.ts`
- `src/openapi/routes.ts`

## Verification

```bash
npm run build
grep -r "Oleksandr\|Elevaite\|salmonhill\|f940e489" src/
# Expected: 0 results
```
