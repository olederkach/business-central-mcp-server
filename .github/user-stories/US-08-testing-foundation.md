# US-08: Set up testing infrastructure and core test suites

| Field | Value |
|-------|-------|
| **Priority** | P0 — Quality |
| **Branch** | `feat/US08-testing-foundation` |
| **Wave** | 2 (depends on US-02, US-03 merging first) |
| **Effort** | 3-4 hrs |
| **Review findings** | Finding 1, 3 (main report); Findings 1-7 (testing agent) |

## User Story

**As a** developer,
**I want** automated tests for the security-critical validators and core executor,
**so that** changes are verified by CI and regressions are caught before they reach production.

## Context

The project has **zero automated tests** — no test framework, no test files, no test script in `package.json`. For a server that performs CRUD operations against a production ERP system with 14 tools, this is the highest-risk gap. The security-critical validators (`ODataValidator`, `input-validator`) are pure functions that can be tested immediately with 100% branch coverage.

## Dependencies

- **US-02** should merge first so `getBaseApiPath` tests verify the fixed (not buggy) behavior
- **US-03** should merge first so executor tests verify entity name validation is present

## Acceptance Criteria

- [ ] Vitest installed and configured for ESM TypeScript
- [ ] `npm test` script exists and runs successfully
- [ ] `npm run test:coverage` script exists
- [ ] `ODataValidator` test suite at 100% branch coverage
- [ ] `input-validator` test suite covers all exported functions
- [ ] `GenericToolExecutor` test suite covers all 14 tool dispatch branches and error cases
- [ ] Config parsing test suite covers CLI args, URL parsing, env var fallback
- [ ] `BCApiClient.getBaseApiPath` regression test for the double-prefix bug

## Tasks

### Task 1: Install and configure Vitest
- Add devDependencies: `vitest`, `@vitest/coverage-v8`
- Create `vitest.config.ts` with ESM support matching `"type": "module"` in package.json
- Add to `package.json` scripts:
  ```json
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
  ```

### Task 2: ODataValidator test suite
- **New file:** `tests/utils/odata-validator.test.ts`
- Test cases:
  - Valid filters, selects, orderby, expands, top/skip
  - SQL injection patterns (`;`, `--`, `/*`, `UNION SELECT`)
  - XSS patterns (`<script>`, `javascript:`)
  - Path traversal (`../`, `..\\`)
  - Unbalanced parentheses
  - Max boundary values for `$top` (1000) and `$skip` (100000)
  - Invalid field names in `$select` and `$orderby`
  - `$expand` depth limits
- Target: 100% branch coverage

### Task 3: input-validator test suite
- **New file:** `tests/utils/input-validator.test.ts`
- Test cases:
  - All allowed JSON-RPC methods pass; unknown methods fail
  - Valid/invalid tool names (alphanumeric, underscore, hyphen)
  - Valid/invalid resource URIs (protocol://path format)
  - Valid/invalid entity names
  - String params: max length, empty, dangerous patterns
  - Numeric params: min, max, integer, NaN, Infinity
  - Boolean params: true/false, "true"/"false", "1"/"0"
  - Object sanitization: nested depth, dangerous keys

### Task 4: GenericToolExecutor test suite
- **New file:** `tests/tools/generic-executor.test.ts`
- Mock: `BCApiClient`, `CompanyManager`, `ApiContextManager`
- Test cases:
  - All 14 tool dispatch branches return expected structure
  - Missing required params throw appropriate errors
  - HTTP 405/412/404 error discrimination returns helpful messages
  - `find_records_by_field` filter formatting: GUID, numeric, boolean, string
  - Edge cases: value `""`, `"Infinity"`, `"NaN"`, `"0"`, `"true"`

### Task 5: Config parsing test suite
- **New file:** `tests/config.test.ts`
- Test cases:
  - `parseCLIArgs`: flag parsing, case normalization (`--TenantId` -> `tenantid`)
  - `parseCLIArgs`: skip flags without values, skip boolean flags
  - `resolveBCConfig`: URL parsing priority, env var fallback
  - `resolveBCConfig`: missing required fields throw

### Task 6: BCApiClient path test suite
- **New file:** `tests/bc/client.test.ts`
- Test cases:
  - `getBaseApiPath()` for standard API: returns single `/v2.0/{t}/{e}/api/v2.0`
  - `getBaseApiPath()` for custom API: returns `/v2.0/{t}/{e}/api/{pub}/{grp}/{ver}`
  - No doubled `/v2.0/` prefix (regression test)

## Files Changed

- `package.json` (scripts + devDependencies)
- New: `vitest.config.ts`
- New: `tests/utils/odata-validator.test.ts`
- New: `tests/utils/input-validator.test.ts`
- New: `tests/tools/generic-executor.test.ts`
- New: `tests/config.test.ts`
- New: `tests/bc/client.test.ts`

## Verification

```bash
npm test
npm run test:coverage
# ODataValidator and input-validator should show 100% branch coverage
# All 14 tool branches should be covered in generic-executor tests
```
