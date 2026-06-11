# Feature Spec Markdown format

A feature spec is a Markdown file with these sections:

- frontmatter
- `## Purpose`
- `## Rules`
- `## Scenarios`

Rules use IDs like `FEATURE-R001`.
Scenarios use IDs like `FEATURE-S001`.
Scenario steps use `Given`, `When`, `Then`, `And`, and `But`.

The spec file describes behaviour only. Test mappings and reports are generated from IDs.
