# AI Spec Driven Development Flow

`feature-spec-md` is built for a loop where specs and tests are both AI-assisted, but the contract between them is explicit and testable.

```txt
AI drafts specs
-> humans review intent and evidence policy
-> AI writes tests from stable IDs
-> tooling checks coverage and declared evidence
-> implementation follows failing tests
-> reports show what is implemented
```

## Install

Install the package in the project that owns the specs and tests:

```bash
npm install -D @anselmdk/feature-spec-md
```

Add scripts if you want short project commands:

```json
{
  "scripts": {
    "spec": "feature-spec-md check",
    "spec:coverage": "feature-spec-md coverage --fail-on-missing",
    "spec:report": "feature-spec-md report"
  }
}
```

Create starter documents:

```bash
npx feature-spec-md init --kind model --dir specs
npx feature-spec-md init --kind feature --dir specs
npx feature-spec-md init --kind stack --dir specs
npx feature-spec-md init --kind design --dir specs
```

## 1. Ask AI To Draft The Spec Set

Give the AI product intent and ask it to create or update:

- `*.model.md` for domain vocabulary and global invariants
- `*.feature.md` for capabilities, rules, and scenarios
- `*.stack.md` for implementation platform choices
- `*.design.md` for product, UI, and interaction direction

Useful instruction:

```txt
Create feature-spec-md documents for this change. Keep the documents small.
Use stable uppercase IDs. Put durable behavior in rules. Put testable examples
in scenarios. For each feature or scenario, declare whether the expected test
is unit, integration, playwright, manual, or skip. Require screenshots only for
UI flows where visual evidence should be part of the review.
```

Run:

```bash
npx feature-spec-md check --tests ""
```

Use `--tests ""` while the spec set is still being drafted so validation focuses on document structure and graph references.

## 2. Review The Specs Before Implementation

Review the Markdown as product intent, not as generated test code.

Check that:

- model terms are clear enough for test authors
- feature rules are durable product truths
- scenarios are concrete enough to become executable tests
- each scenario has the right test policy
- screenshots are required only for UI/browser behavior where visual evidence is valuable
- stack choices are specific enough to guide implementation
- design direction covers the visible behavior users will judge

Example feature-level policy for UI behavior:

```md
---
id: ACCOUNT-ACCESS
title: Account access
test: playwright
screenshots: required
---
```

Example scenario-level override for unit-only behavior:

```md
### ACCOUNT-ACCESS-S002: Link expiry is calculated
Test: unit
Screenshots: skip

Given a sign-in link was created 31 minutes ago
When expiry is calculated
Then the link is expired
```

Then run:

```bash
npx feature-spec-md check --require-scenario-coverage=false
```

This keeps the spec set valid while allowing missing tests.

## 3. Ask AI To Write Tests From The Specs

Give the AI the relevant spec files and tell it to write executable tests that preserve spec IDs in the test source and match the declared test policy.

Useful instruction:

```txt
Write tests from these feature-spec-md specs. Each scenario test must include
the scenario ID in the test title. Add comments or annotations for covered
rule IDs and model item IDs. Use Playwright and the screenshot evidence helper
for scenarios declared as test: playwright with screenshots: required. Use unit
or integration tests for scenarios declared that way. Do not invent IDs that are
not in the specs.
```

Example:

```ts
test("ACCOUNT-ACCESS-S001 registered person signs in", async ({ page }) => {
  // Covers ACCOUNT-ACCESS-R001 and ACCOUNT-M001.
});
```

The test can reference IDs in titles, tags, annotations, comments, or metadata. The important part is that the ID text is present in the test source.

## 4. Check Coverage

Run:

```bash
npx feature-spec-md coverage
```

The coverage command groups specs by implementation state and shows missing scenario, rule, and model item references.

Use this in CI when missing scenario tests should block a change:

```bash
npx feature-spec-md coverage --fail-on-missing
```

Use stricter checks when you also want rule coverage to fail CI:

```bash
npx feature-spec-md check --require-rule-coverage=true
```

## 5. Generate A Report

Run:

```bash
npx feature-spec-md report --out test-results/feature-spec-report/index.html
```

The report is useful as a PR artifact because it shows specs, coverage state, validation issues, declared evidence policy, and optional screenshot evidence.

If your tests produce screenshot manifests, include them:

```bash
npx feature-spec-md report \
  --screenshots "test-results/spec-report/screenshots-*.json" \
  --out test-results/feature-spec-report/index.html
```

When missing declared screenshot evidence should block the build, enforce evidence policy:

```bash
npx feature-spec-md report \
  --screenshots "test-results/spec-report/screenshots-*.json" \
  --enforce-evidence \
  --out test-results/feature-spec-report/index.html
```

The gate only fails for scenarios whose resolved screenshot policy is `required`.

Screenshot manifest shape:

```json
{
  "screenshots": [
    {
      "specPath": "specs/account-access.feature.md",
      "line": 24,
      "path": "screenshots/account-access-s001-line-24.png",
      "title": "ACCOUNT-ACCESS-S001:24 Given a registered person is on the sign-in page"
    }
  ]
}
```

## 6. Publish The Report From CI

A typical CI sequence is:

```bash
npm run build
npx feature-spec-md check --require-rule-coverage --require-model-coverage
npx feature-spec-md coverage --fail-on-missing
npm test
npx feature-spec-md report \
  --screenshots "test-results/spec-report/screenshots-*.json" \
  --enforce-evidence \
  --out test-results/spec-report/index.html
npx feature-spec-md github-report --publish ftp --report-dir test-results/spec-report
```

Use `--enforce-evidence` when the project wants missing required screenshots to fail the build. Leave it out when the report should show screenshot state without blocking.

## 7. Keep The Loop Honest

When behavior changes, update specs first, then regenerate or update tests from the changed specs.

The expected loop is:

```txt
spec change -> validation -> AI test update -> coverage -> implementation -> evidence report
```

That keeps the AI-generated work anchored to a small, reviewable contract instead of a loose conversation history.
