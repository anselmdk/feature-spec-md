# Feature Spec Markdown format

Feature Spec Markdown is a lightweight convention for readable, testable feature specifications.

It intentionally uses ordinary Markdown and stable IDs instead of a dedicated executable specification language.

The format has two document types:

```txt
*.model.md
*.feature.md
```

A model file defines shared domain vocabulary. A feature file defines rules and scenarios for one user capability and may reference one or more model files.

## File names

Use:

```txt
*.model.md
*.feature.md
```

Examples:

```txt
kanban.model.md
card-authoring.feature.md
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
- `model`: a single referenced model id
- `models`: comma-separated referenced model ids

## Purpose

Every model and feature file MUST include a short `## Purpose` section.

Purpose explains the document boundary and intent.

Purpose SHOULD be one or two short paragraphs.

Purpose SHOULD NOT contain rules, scenarios, implementation details, or roadmap notes.

Example:

```md
## Purpose

Users can create, edit, and delete cards on the board.
```

## Model files

Model files use the `.model.md` suffix.

A model file defines one coherent domain vocabulary: concepts, fields, allowed values, relationships, and important boundaries.

A model file describes the domain, not the implementation. It SHOULD NOT define database tables, ORM schemas, API DTOs, migrations, storage engines, or UI components.

### Required model sections

```md
# Kanban model

## Purpose

## Model
```

### Optional model sections

```md
## Rules
```

Model rules SHOULD be global invariants for the domain vocabulary.

### Model example

```md
---
id: KANBAN
title: Kanban model
status: draft
---

# Kanban model

## Purpose

Define the shared concepts for a single-user Kanban board.

## Model

### KANBAN-M001: Card

A card represents one work item on the board.

| Field | Required | Description |
|---|---|---|
| Title | yes | 1-100 characters after trimming whitespace |
| Status | yes | One of To do, In progress, or Done |

## Rules

- KANBAN-R001: A card MUST have exactly one status.
```

## Feature files

Feature files use the `.feature.md` suffix.

A feature file defines rules and scenarios for one user capability. It may reference a shared model through frontmatter.

### Required feature sections

```md
# Card authoring

## Purpose

## Rules

## Scenarios
```

### Feature example

```md
---
id: KANBAN-CARD-AUTHORING
title: Card authoring
status: draft
model: KANBAN
---

# Card authoring

## Purpose

Users can create, edit, and delete cards on the board.

## Rules

- KANBAN-CARD-AUTHORING-R001: A new card MUST start in the To do column.

## Scenarios

### KANBAN-CARD-AUTHORING-S001: User creates a card

Given the user is on the board
When they create a card with the title "Write release notes"
Then the card "Write release notes" is visible in the To do column
```

## Rules

Rules are durable truths about the model and behavior. They describe constraints, invariants, permissions, validations, and policies.

Rules use stable IDs and requirement keywords.

```md
- KANBAN-CARD-AUTHORING-R001: A new card MUST start in the To do column.
- KANBAN-CARD-AUTHORING-R002: A card title MUST NOT be longer than 100 characters.
- KANBAN-CARD-AUTHORING-R003: A card description MAY be empty.
```

Use these keywords:

- `MUST`
- `MUST NOT`
- `SHOULD`
- `SHOULD NOT`
- `MAY`
- `OPTIONAL`

Rules SHOULD NOT describe individual UI interactions that are already fully expressed by a scenario.

Every rule SHOULD be covered by at least one scenario or test.

## Scenarios

Scenarios are concrete examples of observable behavior. They use stable IDs and Given / When / Then steps.

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

A scenario SHOULD be concrete enough to become an executable test.

Prefer this:

```md
When they create a card with the title "Write release notes"
```

Over this:

```md
When they create a valid card
```

## Splitting guidance

Split model files by coherent domain vocabulary, ownership, or lifecycle.

A model file SHOULD NOT be split merely because it contains several related concepts.

Good:

```txt
kanban.model.md
user-access.model.md
billing.model.md
```

Avoid:

```txt
board.model.md
column.model.md
card.model.md
status.model.md
```

Feature files SHOULD be split by user capability.

Good:

```txt
card-authoring.feature.md
card-movement.feature.md
card-filtering.feature.md
```

Avoid splitting feature files by technical layer.

## Test coverage convention

Spec files do not contain test mappings.

Tests reference model item, rule, and scenario IDs in test titles, tags, annotations, comments, or metadata.

Generated tooling can then answer:

- Which model items are referenced?
- Which scenarios have tests?
- Which rules have executable coverage?
- Which tests reference deleted or unknown spec IDs?
- Which visible flows have screenshots, traces, or other evidence?

For Playwright tests, capture one screenshot for each scenario step line in the spec. Report manifests associate each screenshot with the exact spec file and line number, so the HTML report can display the evidence beside the Given / When / Then / And line it proves.
