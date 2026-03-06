# User Stories — Comprehensive Review Findings

Generated from 5-agent comprehensive code review (2026-03-06).
Covers 45 findings across security, code quality, architecture, testing, and CI/CD.

## Story Index

| ID | Title | Priority | Branch | Wave | Status |
|----|-------|----------|--------|------|--------|
| [US-01](US-01-remove-leaked-data.md) | Remove leaked data from published package | P0 | `fix/US01-remove-leaked-data` | 1 | TODO |
| [US-02](US-02-api-path-bug.md) | Fix getBaseApiPath double-prefix bug | P0 | `fix/US02-api-path-bug` | 1 | TODO |
| [US-03](US-03-entity-name-validation.md) | Add entity name validation to tool executor | P0 | `fix/US03-entity-name-validation` | 1 | TODO |
| [US-04](US-04-oauth-hardening.md) | Harden OAuth authentication | P1 | `fix/US04-oauth-hardening` | 1 | TODO |
| [US-05](US-05-copilot-sse-hardening.md) | Fix copilot-sse sessions, validation, security | P1 | `fix/US05-copilot-sse-hardening` | 1 | TODO |
| [US-06](US-06-session-and-dcr-fixes.md) | Fix session memory leak and DCR timing | P1 | `fix/US06-session-and-dcr-fixes` | 1 | TODO |
| [US-07](US-07-structured-logging.md) | Replace console.* with structured logger | P1 | `fix/US07-structured-logging` | 1 | TODO |
| [US-08](US-08-testing-foundation.md) | Set up testing infrastructure and core suites | P0 | `feat/US08-testing-foundation` | 2 | TODO |
| [US-09](US-09-validator-and-coercion-fixes.md) | Fix OData validator false positives and type coercion | P2 | `fix/US09-validator-and-coercion-fixes` | 3 | TODO |
| [US-10](US-10-http-middleware-hardening.md) | Harden HTTP security middleware | P2 | `fix/US10-http-middleware-hardening` | 1 | TODO |
| [US-11](US-11-ci-quality-gates.md) | Add CI quality gates | P2 | `feat/US11-ci-quality-gates` | 3 | TODO |

## Waves (merge order)

```
Wave 1 (parallel, no dependencies):
  US-01, US-02, US-03, US-04, US-05, US-06, US-07, US-10

Wave 2 (after wave 1):
  US-08

Wave 3 (after US-08):
  US-09, US-11
```

## Backlog (Phase 6 — deferred)

| ID | Item | Estimate |
|----|------|----------|
| BL-01 | Consolidate 3 MCP protocol implementations into shared dispatcher | Large |
| BL-02 | Consolidate 8 OAuthAuth instantiations into singleton/factory | Medium |
| BL-03 | Reduce `any` usage (144 instances) — typed tool argument interfaces | Large |
| BL-04 | Extract BCApiClient request helper (eliminate CRUD duplication) | Medium |
| BL-05 | Remove dead code: executor.ts, generator.ts, unused interfaces (~727 lines) | Small |
| BL-06 | Remove unused exports: ToolAnalytics, publicEndpointLimiter | Small |
| BL-07 | Implement or remove 7 unimplemented prompt templates | Medium |
| BL-08 | Add TTL to CompanyManager cache | Small |
| BL-09 | Remove BCApiClient constructor OAuthAuth side effect (use DI) | Medium |
