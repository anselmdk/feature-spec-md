# Feature Spec Markdown format

Feature Spec Markdown is a lightweight convention for readable, testable feature specifications.

It intentionally uses ordinary Markdown and stable IDs instead of a dedicated executable specification language.

## File name

Use:

```txt
*.feature.md
```

Example:

```txt
account-access.feature.md
```

## Frontmatter

Every file starts with YAML-like frontmatter:

```md
---
id: ACCOUNT
title: Account access
status: draft
---
```

Required fields:

- `id`
- `title`

Optional fields:

- `status`: `draft`, `active`, or `deprecated`
- `owner`

## Required sections

```md
# Account access

## Purpose

## Rules

## Scenarios
```

## Rules

Rules are durable business truths. They use stable IDs and requirement keywords.

```md
- ACCOUNT-R001: A person MUST prove control of a registered email address before accessing an account.
- ACCOUNT-R002: The system MUST NOT reveal whether an unknown email address belongs to an account.
- ACCOUNT-R003: A signed-in person SHOULD be returned to the page they originally requested.
```

Use these keywords:

- `MUST`
- `MUST NOT`
- `SHOULD`
- `SHOULD NOT`
- `MAY`
- `OPTIONAL`

## Scenarios

Scenarios are concrete examples. They use stable IDs and Given / When / Then steps.

```md
### ACCOUNT-S001: Registered person signs in

Given a registered person is on the sign-in page  
When they request and open a valid sign-in link  
Then they are signed in
```

Allowed step keywords:

- `Given`
- `When`
- `Then`
- `And`
- `But`

## Test coverage convention

The spec file does not contain test mappings.

Tests reference rule and scenario IDs in test titles, tags, annotations, comments, or metadata.

Generated tooling can then answer:

- Which scenarios have tests?
- Which rules have executable coverage?
- Which tests reference deleted or unknown spec IDs?
- Which visible flows have screenshots, traces, or other evidence?

For Playwright tests, capture one screenshot for each scenario step line in the
spec. Report manifests associate each screenshot with the exact spec file and
line number, so the HTML report can display the evidence beside the
Given / When / Then / And line it proves.
