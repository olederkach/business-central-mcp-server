# US-09: Fix OData validator false positives and type coercion bugs

| Field | Value |
|-------|-------|
| **Priority** | P2 — Code quality |
| **Branch** | `fix/US09-validator-and-coercion-fixes` |
| **Wave** | 3 (depends on US-08 for test verification) |
| **Effort** | 1 hr |
| **Review findings** | Findings 19, 20 (main report); Finding 12 (main); Finding 3 (testing agent); Finding 12 (testing agent) |

## User Story

**As a** BC user with entity fields containing words like "Update" or parentheses in values,
**I want** OData filters to not be falsely rejected,
**so that** legitimate queries against Business Central work correctly.

## Context

The OData validator has several false-positive issues discovered during code review:

1. **Parenthesis counting in filters:** `validateFilter` counts raw `(` characters, so a filter like `name eq 'a(b'` (parenthesis inside a string literal) triggers "unbalanced parentheses" error.

2. **Parenthesis counting in expand:** `validateExpand` counts `(` for depth, so `$expand=lines($filter=type eq 'y(z)')` overcounts nesting depth.

3. **Type coercion in find_records_by_field:** Empty string `""` converts to `Number("") === 0` (not NaN), so it's treated as numeric. `"Infinity"` passes `!isNaN(Number("Infinity"))`, producing an invalid OData literal.

4. **Invalid stdio cursor:** `parseInt("abc")` returns `NaN`, causing `GENERIC_TOOLS.slice(NaN, NaN)` to return an empty array silently.

## Dependencies

- **US-08** must merge first so we can add tests verifying each fix

## Acceptance Criteria

- [ ] `validateFilter("name eq 'a(b'")` does NOT throw "unbalanced parentheses"
- [ ] `validateExpand("lines($filter=type eq 'y(z)')")` counts depth correctly
- [ ] `find_records_by_field` with value `""` does NOT produce numeric filter `0`
- [ ] `find_records_by_field` with value `"Infinity"` does NOT produce literal `Infinity`
- [ ] Invalid stdio cursor returns full tools list, not empty array
- [ ] All existing tests still pass
- [ ] New test cases added for each fix

## Tasks

### Task 1: Fix validateFilter parenthesis counting
- **File:** `src/utils/odata-validator.ts` `validateFilter` method
- **Change:** Replace raw `(filter.match(/\(/g) || []).length` with a function that skips characters inside single-quoted strings when counting parentheses

### Task 2: Fix validateExpand depth counting
- **File:** `src/utils/odata-validator.ts` `validateExpand` method
- **Change:** Same approach — skip `(` characters inside single-quoted strings when counting nesting depth

### Task 3: Fix find_records_by_field type coercion
- **File:** `src/tools/generic-executor.ts` ~line 839
- **Change:** Tighten numeric detection:
  ```typescript
  if (typeof value === 'number') {
    filterValue = String(value);
  } else if (typeof value === 'string' && value !== '' && isFinite(Number(value))) {
    filterValue = value;  // Keep the original string representation
  }
  ```

### Task 4: Fix stdio pagination with invalid cursor
- **File:** `src/transports/stdio-server.ts` ~line 100
- **Change:** Validate cursor before using:
  ```typescript
  const startIndex = parseInt(request.params.cursor, 10);
  if (isNaN(startIndex) || startIndex < 0) {
    return { tools: GENERIC_TOOLS };
  }
  ```

### Task 5: Add test cases
- Update `tests/utils/odata-validator.test.ts` with parenthesis-in-string cases
- Update `tests/tools/generic-executor.test.ts` with type coercion edge cases

## Files Changed

- `src/utils/odata-validator.ts`
- `src/tools/generic-executor.ts`
- `src/transports/stdio-server.ts`
- `tests/utils/odata-validator.test.ts` (update)
- `tests/tools/generic-executor.test.ts` (update)

## Verification

```bash
npm test
# All tests pass including new edge case tests
```
