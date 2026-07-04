# Feature Spec Markdown Format

Feature Spec Markdown is a lightweight format for testable specs.

It uses ordinary Markdown plus stable IDs so an AI can write clear product specs, another AI pass can write executable tests from those specs, and tooling can verify that the tests still cover the documented behavior.

## Document Set

A spec set can contain four document types:

```txt
*.model.md
*.feature.md
*.stack.md
*.design.md
```

- `*.model.md` defines shared domain vocabulary and global domain rules.
- `*.feature.md` defines user-facing behavior with rules and scenarios.
- `*.stack.md` defines technical platform choices and their rationale.
- `*.design.md` defines product, UI, layout, visual, and interaction direction.

For larger products, each document type can also use the optional extension sections described below. These sections are designed for API-first products, SaaS authorization models, stateful domain objects, and e2e test environments without adding new required document suffixes.

## Frontmatter

Every file starts with YAML-like frontmatter:

```md
---
id: KANBAN-CARD-AUTHORING
title: Card authoring
status: draft
model: KANBAN
---
```

Required fields:

- `id`
- `title`

Optional fields:

- `status`: `draft`, `active`, or `deprecated`
- `owner`
- `model`: a single referenced model id, for feature and design files
- `models`: comma-separated referenced model ids, for feature and design files
- `test`: default scenario test type for feature files
- `screenshots`: default screenshot evidence policy for feature files

IDs use uppercase words separated by hyphens. IDs are the contract between specs, tests, reports, and implementation work.

## Purpose

Every model, feature, stack, and design file MUST include a short `## Purpose` section.

Purpose explains the document boundary and intent. It SHOULD be one or two short paragraphs and SHOULD NOT contain rules, scenarios, implementation details, or roadmap notes.

## Model Files

Model files use the `.model.md` suffix.

Required sections:

```md
# Kanban model

## Purpose

## Model
```

Optional sections:

```md
## Rules
```

Model items use stable `-M001` IDs:

```md
### KANBAN-M001: Card

A card represents one work item on the board.
```

Model rules use stable `-R001` IDs and describe global invariants for the domain vocabulary:

```md
- KANBAN-R001: A card MUST have one current workflow state.
```

## Feature Files

Feature files use the `.feature.md` suffix.

Required sections:

```md
# Card authoring

## Purpose

## Rules

## Scenarios
```

Rules use stable `-R001` IDs:

```md
- KANBAN-CARD-AUTHORING-R001: A new card MUST start in the To do column.
```

Scenarios use stable `-S001` IDs and Given / When / Then steps:

```md
### KANBAN-CARD-AUTHORING-S001: User creates a card

Given the user is on the board
When they create a card with the title "Write release notes"
Then the card "Write release notes" is visible in the To do column
```

Allowed step keywords are `Given`, `When`, `Then`, `And`, and `But`.

Rules state durable product truths. Scenarios show concrete examples that executable tests can implement.

### Scenario Test And Evidence Policy

Feature specs can declare how scenarios are expected to be tested and whether screenshot evidence is required.

Feature-level frontmatter sets defaults for all scenarios in a feature:

```md
---
id: KANBAN-CARD-AUTHORING
title: Card authoring
test: playwright
screenshots: required
---
```

Scenario-level overrides go directly below a scenario heading:

```md
### KANBAN-CARD-AUTHORING-S002: Card title is normalized
Test: unit
Screenshots: skip

Given the raw card title contains leading whitespace
When the title is normalized
Then the stored title has no leading whitespace
```

Supported `test` values are `unit`, `integration`, `playwright`, `manual`, and `skip`.

Supported `screenshots` values are `required`, `optional`, and `skip`. `screenshots: none` is accepted as an alias for `screenshots: skip`.

Defaults:

- If `test` is omitted, scenarios default to `unit`.
- If `screenshots` is omitted and `test` resolves to `playwright`, screenshots default to `required`.
- If `screenshots` is omitted and `test` resolves to `unit`, `integration`, `manual`, or `skip`, screenshots default to `skip`.

See [Scenario Test And Evidence Policy](docs/evidence-policy.md) for details and CI examples.

## Stack Files

Stack files use the `.stack.md` suffix and define technical platform choices and the reasoning behind them.

Required sections:

```md
# Kanban tech stack

## Purpose

## Stack
```

Optional sections are `## Context`, `## Rationale`, and `## Consequences`.

## Design Files

Design files use the `.design.md` suffix and define product, UI, layout, visual, and interaction direction.

Required sections:

```md
# Kanban board design

## Purpose

## Design
```

Optional sections are `## Principles`, `## Layout`, `## Interaction`, and `## Visual style`.

## Extension Sections

The following optional sections are valid in model, feature, stack, and design files. They are intentionally plain Markdown so teams can adopt them gradually without changing the core scenario coverage model.

### Open Questions

Use `## Open Questions` for unresolved product, technical, or testing choices that block confident implementation.

```md
## Open Questions

- BOOKING-Q001: Confirm whether attendees can buy individual drop-in classes.
- BOOKING-Q002: Confirm whether "user" includes public attendees or only staff members.
```

Open question IDs SHOULD use the document id plus `-Q001`. They are not treated as executable behavior and do not require test coverage.

### Assumptions

Use `## Assumptions` for temporary truths the spec relies on until they are confirmed, replaced, or promoted into rules.

```md
## Assumptions

- BOOKING-A001: MobilePay is the first live payment provider.
- BOOKING-A002: All initial recurring events repeat weekly.
```

Assumption IDs SHOULD use the document id plus `-A001`. When an assumption becomes durable product behavior, rewrite it as a rule with a `-R001` id.

### API Contract

Use `## API Contract` for API-first features and services. This section SHOULD describe endpoints, auth requirements, request/response shapes, status codes, idempotency expectations, pagination, webhooks, and links to generated OpenAPI or Swagger output.

```md
## API Contract

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | /api/events | Create an event | administrator |
| GET | /api/events | List visible events | account member |
```

API contract details can be covered by integration tests that reference the relevant scenario and rule IDs.

### Permissions

Use `## Permissions` for role, group, and tenant capability matrices.

```md
## Permissions

| Capability | Owner | Administrator | Teacher | Attendee |
| --- | --- | --- | --- | --- |
| Manage payment connection | yes | no | no | no |
| Move own class instance | yes | yes | yes | no |
```

Permissions that must be enforced by the implementation SHOULD also be written as rules so coverage can track them.

### Lifecycle

Use `## Lifecycle` for state machines and transition rules for entities such as bookings, payments, subscriptions, passes, and recurring event instances.

```md
## Lifecycle

Payment states:

```txt
pending -> paid
pending -> failed
paid -> refunded
```

Invalid transitions MUST be rejected by the API.
```

Lifecycle behavior that must be executable SHOULD be represented by rules and scenarios in the same feature file.

### Test Environment

Use `## Test Environment` for mocks, seed data, fixed-time behavior, provider adapters, and CI/e2e setup.

```md
## Test Environment

- Email delivery is mocked and exposes the latest magic link to tests.
- MobilePay runs through a deterministic mock in CI.
- Time is frozen during recurring-event generation tests.
```

This section is especially useful for SaaS apps with external dependencies such as payment providers, email, calendars, or third-party APIs.

## Splitting Guidance

Split model files by coherent domain vocabulary, ownership, or lifecycle.

Split feature files by user capability.

Use stack files for broad technical choices such as framework, language, testing, persistence, deployment, and runtime constraints.

Use design files for product/UI direction such as layout, interaction, visual style, and design principles.

Use extension sections when the information belongs with a spec but is not itself a model item, durable rule, or executable scenario. If an extension section becomes large enough to hide the core behavior, split the surrounding model or feature document instead of creating a new document type.

Keep each document small enough for an AI to read, revise, and use as test-writing context without extra explanation.

## Test Coverage Convention

Spec files declare expected test and evidence policy, but they do not map scenarios to concrete test files.

Tests reference model item, rule, and scenario IDs in test titles, tags, annotations, comments, or metadata.

Generated tooling can answer:

- Which model items are referenced?
- Which scenarios have tests?
- Which rules have executable coverage?
- Which tests reference deleted or unknown spec IDs?
- Which scenarios are expected to have screenshot evidence?
- Which visible flows have screenshots, traces, or other evidence?

Example:

```ts
test("KANBAN-CARD-AUTHORING-S001 user creates a card", async ({ page }) => {
  // Covers KANBAN-M001 and KANBAN-CARD-AUTHORING-R001.
});
```
