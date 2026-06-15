# Feature Spec Markdown format

Feature Spec Markdown is a lightweight convention for readable, testable specifications.

It uses ordinary Markdown and stable IDs instead of a dedicated executable specification language.

## File types

The format has four document types:

```txt
*.model.md
*.feature.md
*.stack.md
*.design.md
```

- `*.model.md` defines shared domain vocabulary.
- `*.feature.md` defines user-facing behavior with rules and scenarios.
- `*.stack.md` defines technical platform choices.
- `*.design.md` defines product, UI, and interaction design direction.

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

## Purpose

Every model, feature, stack, and design file MUST include a short `## Purpose` section.

Purpose explains the document boundary and intent. It SHOULD be one or two short paragraphs and SHOULD NOT contain rules, scenarios, implementation details, or roadmap notes.

## Model files

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

Model rules use stable `-R001` IDs and should describe global invariants for the domain vocabulary.

## Feature files

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

## Stack files

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

| Area | Choice |
|---|---|
| Frontend | React |
| Language | TypeScript |
| Testing | Playwright |
```

## Design files

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

## Splitting guidance

Split model files by coherent domain vocabulary, ownership, or lifecycle.

Feature files SHOULD be split by user capability.

Use stack files for broad technical choices such as framework, language, testing, persistence, and deployment.

Use design files for product/UI direction such as layout, interaction, visual style, and design principles.

## Test coverage convention

Spec files do not contain test mappings.

Tests reference model item, rule, and scenario IDs in test titles, tags, annotations, comments, or metadata.

Generated tooling can answer:

- Which model items are referenced?
- Which scenarios have tests?
- Which rules have executable coverage?
- Which tests reference deleted or unknown spec IDs?
- Which visible flows have screenshots, traces, or other evidence?
