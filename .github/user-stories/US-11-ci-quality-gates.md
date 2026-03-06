# US-11: Add CI quality gates

| Field | Value |
|-------|-------|
| **Priority** | P2 — CI/CD |
| **Branch** | `feat/US11-ci-quality-gates` |
| **Wave** | 3 (depends on US-08 for tests to exist) |
| **Effort** | 30 min |
| **Review findings** | Finding 11 (main report); Findings 1-4 (CI/CD agent) |

## User Story

**As a** maintainer,
**I want** every PR to run lint, type-check, tests, and security audit automatically,
**so that** broken or insecure code can't be merged without detection.

## Context

The current CI/CD has significant gaps:
- **Publish workflow** (`publish.yml`) only runs `npm ci` + `npm run build` + `npm publish` — no lint, no type-check, no tests, no security audit
- Both publish steps use `continue-on-error: true`, silently swallowing failures
- No PR-triggered CI workflow exists at all
- ESLint with `eslint-plugin-security` and `eslint-plugin-sonarjs` are installed but never run in CI

## Dependencies

- **US-08** must merge first so the `npm test` step has tests to run

## Acceptance Criteria

- [ ] New `.github/workflows/ci.yml` runs on pushes to main and pull requests
- [ ] CI steps run in order: install -> lint -> type-check -> test -> security audit
- [ ] Publish workflow includes quality gates before publish step
- [ ] `continue-on-error: true` removed from publish steps (or replaced with explicit version-exists handling)
- [ ] CI workflow uses Node.js 20 (matching `engines` in package.json)

## Tasks

### Task 1: Create CI workflow
- **New file:** `.github/workflows/ci.yml`
- **Content:**
  ```yaml
  name: CI
  on:
    push:
      branches: [main]
    pull_request:
      branches: [main]
  jobs:
    quality:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
        - run: npm ci
        - run: npm run lint
        - run: npm run type-check
        - run: npm test
        - run: npm run security:check
  ```

### Task 2: Add quality gates to publish workflow
- **File:** `.github/workflows/publish.yml`
- **Change:** Add these steps before `npm publish` in both jobs:
  ```yaml
  - run: npm run lint
  - run: npm run type-check
  - run: npm test
  ```
- Remove `continue-on-error: true` from publish steps, or replace with explicit version-exists check:
  ```yaml
  - name: Check if version exists
    id: check
    run: npm view business-central-mcp-server@$(node -p "require('./package.json').version") version 2>/dev/null && echo "exists=true" >> $GITHUB_OUTPUT || echo "exists=false" >> $GITHUB_OUTPUT
  - name: Publish to npm
    if: steps.check.outputs.exists == 'false'
    run: npm publish --provenance --access public
  ```

## Files Changed

- New: `.github/workflows/ci.yml`
- Updated: `.github/workflows/publish.yml`

## Verification

```bash
# Push a branch and open a PR — CI workflow should trigger
# Verify all steps run: lint, type-check, test, security:check
# All checks should pass green
```
