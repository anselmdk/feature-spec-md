# Scenario Test And Evidence Policy

Feature specs can declare how scenarios are expected to be tested and whether screenshot evidence is required.

Use feature frontmatter to set defaults for all scenarios in a feature:

```md
---
id: KANBAN-CARD-AUTHORING
title: Card authoring
test: playwright
screenshots: required
---
```

Use scenario-level overrides directly below a scenario heading when one scenario needs different evidence. The Given / When / Then steps remain inside the fenced scenario block:

````md
### KANBAN-CARD-AUTHORING-S002: Card title is normalized
Test: unit
Screenshots: skip

```
Given the raw card title contains leading whitespace
When the title is normalized
Then the stored title has no leading whitespace
```
````

## `test` values

- `unit`: behavior is expected to be covered by unit tests.
- `integration`: behavior is expected to be covered by integration tests.
- `playwright`: behavior is expected to be covered by Playwright or another UI/browser test.
- `manual`: behavior is intentionally verified manually.
- `skip`: no executable test is expected for this scenario.

## `screenshots` values

- `required`: every scenario step should have screenshot evidence in the report manifest.
- `optional`: screenshot evidence may be included when useful, but missing screenshots do not fail validation.
- `skip`: screenshots are not expected and should not be treated as missing evidence.

`screenshots: none` is accepted as an alias for `screenshots: skip`.

## Defaults

- If `test` is omitted, scenarios default to `unit`.
- If `screenshots` is omitted and `test` resolves to `playwright`, screenshots default to `required`.
- If `screenshots` is omitted and `test` resolves to `unit`, `integration`, `manual`, or `skip`, screenshots default to `skip`.

This lets UI scenarios fail CI when screenshot evidence is missing, while unit-only domain behavior does not need screenshots.

## CI enforcement

Use report evidence enforcement in CI when declared screenshot evidence should block a build:

```bash
npx feature-spec-md report \
  --screenshots "test-results/spec-report/screenshots-*.json" \
  --enforce-evidence \
  --out test-results/spec-report/index.html
```

The gate only fails for scenarios whose resolved screenshot policy is `required`.
