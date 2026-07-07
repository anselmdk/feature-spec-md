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

Scenarios use stable `-S001` IDs and Given / When / Then steps. The scenario body MUST be written inside a fenced `gherkin` code block so Markdown previews preserve line breaks without relying on trailing spaces:

````md
### KANBAN-CARD-AUTHORING-S001: User creates a card

```gherkin
Given the user is on the board
When they create a card with the title "Write release notes"
Then the card "Write release notes" is visible in the To do column
```
````

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

Scenario-level overrides go directly below a scenario heading. The Given / When / Then steps remain inside the fenced scenario block:

````md
### KANBAN-CARD-AUTHORING-S002: Card title is normalized
Test: unit
Screenshots: skip

```gherkin
Given the raw card title contains leading whitespace
When the title is normalized
Then the stored title has no leading whitespace
```
````

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

## Splitting Guidance

Split model files by coherent domain vocabulary, ownership, or lifecycle.

Split feature files by user capability.

Use stack files for broad technical choices such as framework, language, testing, persistence, deployment, and runtime constraints.

Use design files for product/UI direction such as layout, interaction, visual style, and design principles.

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
