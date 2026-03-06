# US-03: Add entity name validation to tool executor

| Field | Value |
|-------|-------|
| **Priority** | P0 — Security |
| **Branch** | `fix/US03-entity-name-validation` |
| **Wave** | 1 (no dependencies) |
| **Effort** | 15 min |
| **Review findings** | Finding 2 (main report); M-10 (code quality); Finding 10 (security); Finding 9 (security) |

## User Story

**As a** server operator,
**I want** resource/entity names validated before they reach URL construction,
**so that** path traversal or injection via the `resource` parameter is blocked.

## Context

The `GenericToolExecutor` validates OData query parameters (`$filter`, `$select`, etc.) via `ODataValidator`, but the **entity name itself** (`args.resource`) is passed directly to `bcClient.get(resource, ...)` without any validation. The `validateEntityName()` function exists in `input-validator.ts` but is never called for the resource parameter.

A malicious or confused AI agent could pass resource names like:
- `../../admin` (path traversal)
- `customers(guid'xxx')/sensitiveNav` (OData path traversal)
- `customers;DROP` (injection attempt)

While BC's API would likely reject these, defense-in-depth requires validating at every boundary.

## Acceptance Criteria

- [ ] All CRUD methods in `GenericToolExecutor` validate `args.resource` via `validateEntityName()`
- [ ] `list_records({ resource: "../../admin" })` throws `ValidationError`
- [ ] `list_records({ resource: "customers" })` still works correctly
- [ ] `npm run build` succeeds

## Tasks

### Task 1: Add validateEntityName to GenericToolExecutor
- **File:** `src/tools/generic-executor.ts`
- **Change:** Import `validateEntityName` from `../utils/input-validator.js`
- Add `validateEntityName(args.resource)` call at the beginning of these methods:
  - `executeListRecords` (~line 510)
  - `executeCreateRecord` (~line 587)
  - `executeUpdateRecord` (~line 666)
  - `executeDeleteRecord` (~line 754)
  - `executeGetResourceSchema` (~line 455)
  - `executeFindRecordsByField` (~line 814)

## Files Changed

- `src/tools/generic-executor.ts`

## Verification

```bash
npm run build
# Verify: resource names matching /^[a-zA-Z][a-zA-Z0-9_]*$/ pass
# Verify: resource names with ../ ; < > etc. are rejected with ValidationError
```
