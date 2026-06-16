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

The short version:

```txt
model tells tests what things mean
features tell tests what behavior must work
stack tells implementation what tools and constraints to use
design tells implementation what experience to create
```

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

Allowed step keywords:

- `Given`
- `When`
- `Then`
- `And`
- `But`

Rules state durable product truths. Scenarios show concrete examples that executable tests can implement.

## Stack Files

Stack files use the `.stack.md` suffix.

A stack file defines technical platform choices and the reasoning behind them.

Required sections:

```md
# Kanban tech stack

## Purpose

## Stack
```

Optional sections:

```md
## Context

## Rationale

## Consequences
```

Example:

```md
---
id: KANBAN-STACK
title: Kanban tech stack
status: draft
---

# Kanban tech stack

## Purpose

Define the initial technical stack for implementing the Kanban board.

## Stack

| Area     | Choice     |
| -------- | ---------- |
| Frontend | React      |
| Language | TypeScript |
| Testing  | Playwright |
```

## Design Files

Design files use the `.design.md` suffix.

A design file defines product, UI, layout, visual, and interaction direction.

Required sections:

```md
# Kanban board design

## Purpose

## Design
```

Optional sections:

```md
## Principles

## Layout

## Interaction

## Visual style
```

Example:

```md
---
id: KANBAN-DESIGN
title: Kanban board design
status: draft
model: KANBAN
---

# Kanban board design

## Purpose

Define the visual and interaction design direction for the Kanban board.

## Design

The board should feel lightweight, immediate, and calm.
```

## Splitting Guidance

Split model files by coherent domain vocabulary, ownership, or lifecycle.

Split feature files by user capability.

Use stack files for broad technical choices such as framework, language, testing, persistence, deployment, and runtime constraints.

Use design files for product/UI direction such as layout, interaction, visual style, and design principles.

Keep each document small enough for an AI to read, revise, and use as test-writing context without extra explanation.

## Test Coverage Convention

Spec files do not contain test mappings.

Tests reference model item, rule, and scenario IDs in test titles, tags, annotations, comments, or metadata.

Generated tooling can answer:

- Which model items are referenced?
- Which scenarios have tests?
- Which rules have executable coverage?
- Which tests reference deleted or unknown spec IDs?
- Which visible flows have screenshots, traces, or other evidence?

Example:

```ts
test("KANBAN-CARD-AUTHORING-S001 user creates a card", async ({ page }) => {
  // Covers KANBAN-M001 and KANBAN-CARD-AUTHORING-R001.
});
```
