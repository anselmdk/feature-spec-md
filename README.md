# feature-spec-md

Markdown specs for AI-assisted, testable spec-driven development.

`feature-spec-md` helps you describe a product in Markdown, ask an AI to turn those specs into executable tests, and then prove which parts of the specification are covered by those tests. It is intentionally small: your specs stay as plain Markdown, your tests stay in your normal test runner, and the tool connects the two through stable spec IDs.

```txt
model + features + stack + design
-> AI-written executable tests that reference stable spec IDs
-> validation, coverage, screenshots, reports, and PR diffs
```

## See the workflow in action

The clearest example of what this library can deliver is the demo feature PR workflow:

- **Feature PR:** <https://github.com/anselmdk/feature-spec-md-demo/pull/16>
- **Feature spec report:** <https://feature-spec-md.anselm.dk/demo/build/269/>
- **Feature spec diff:** <https://feature-spec-md.anselm.dk/demo/pr/16/269/>

PRs like this are the essence of `feature-spec-md`: a feature branch can carry the product/spec/code change, a published feature spec report can show the full implementation state, and a PR diff report can show exactly what changed in the specs, rendered report, and screenshot evidence.

## What the tool does

The shortest version is: `feature-spec-md` turns Markdown specifications into a testable contract.

It gives you:

- **Spec document formats** for domain models, product features, technical stack notes, and UI/design direction.
- **Stable IDs** for model items, rules, and scenarios, so tests can reference exactly what they implement.
- **Validation** that checks frontmatter, headings, IDs, cross-document references, and test coverage expectations.
- **Coverage reporting** that shows which model items, rules, and scenarios are implemented by tests.
- **Scenario evidence policy** so specs can declare whether behavior should be tested by unit, integration, Playwright, manual, or no executable tests.
- **HTML reports** that combine specs, coverage, validation status, source links, GitHub/build metadata, and screenshot evidence.
- **PR diff reports** that compare a current published build with a base or previous build and highlight changed report files, changed spec sections, and screenshot evidence.
- **Screenshot evidence** for scenarios when using the Playwright helper.
- **GitHub Actions publishing helpers** for job summaries, FTP-published build reports, FTP-published PR diff reports, and PR comments.
- **A library API** for projects that want to parse specs, check coverage, collect screenshots, render reports, or render diff reports from their own tooling.

The specs are meant to be written with an AI before implementation. The tests are meant to be written with an AI from those specs. `feature-spec-md` then checks that the Markdown stays structured and that executable tests still cover the model items, rules, and scenarios the specs define.

## Demo project

A complete demo app is available in [`anselmdk/feature-spec-md-demo`](https://github.com/anselmdk/feature-spec-md-demo). It shows a small support-ticket desk built from model, feature, stack, and design specs, with unit tests, Playwright tests, generated coverage, screenshot evidence, a published feature spec report, and a published PR diff report.

Demo reports, including scenario screenshots, are available here:

<https://feature-spec-md.anselm.dk/demo/>

Use the demo repository when you want to see the expected project shape, script names, screenshot manifest flow, CI publishing setup, PR comments, and report output in a real app.

## What you write

Use four ordinary Markdown document types:

```txt
*.model.md    shared domain vocabulary
*.feature.md  user-facing behavior, rules, and scenarios
*.stack.md    technical platform choices
*.design.md   product, UI, and interaction direction
```

Each document has frontmatter, a short `## Purpose`, and stable IDs.

### Model specs

Model specs define the shared vocabulary that features can refer to. Use them for domain concepts, states, entities, and important business terms.

```md
### ACCOUNT-M001: Registered person

A person who has completed registration and can request sign-in links.
```

### Feature specs

Feature specs describe user-facing behavior with rules and scenarios. Rules and scenarios get stable IDs that tests can reference. Scenario steps are fenced so Markdown previews preserve line breaks without relying on trailing spaces.

````md
---
id: ACCOUNT-ACCESS
title: Account access
test: playwright
screenshots: required
---

# Account access

## Purpose

Allow registered people to access their account securely.

## Rules

- ACCOUNT-ACCESS-R001: Sign-in links MUST expire.

## Scenarios

### ACCOUNT-ACCESS-S001: Registered person signs in

```gherkin
Given a registered person is on the sign-in page
When they request and open a valid sign-in link
Then they are signed in
```
````

Feature specs can declare the expected test and evidence policy:

```txt
test: unit | integration | playwright | manual | skip
screenshots: required | optional | skip
```

If `screenshots` is omitted, Playwright scenarios default to `required`; non-Playwright scenarios default to `skip`. Scenario-level overrides can be written directly below a scenario heading, before the fenced scenario block:

````md
### ACCOUNT-ACCESS-S002: Link expiry is calculated
Test: unit
Screenshots: skip

```gherkin
Given a sign-in link was created 31 minutes ago
When expiry is calculated
Then the link is expired
```
````

See [SPEC_FORMAT.md](SPEC_FORMAT.md) and [docs/evidence-policy.md](docs/evidence-policy.md) for the exact format.

### Stack specs

Stack specs document technical decisions that shape the implementation: framework, storage, test runner, deployment constraints, external services, or architecture decisions.

### Design specs

Design specs capture product, UI, and interaction direction: layout priorities, states, accessibility expectations, empty states, or copy tone.

## How tests connect to specs

Tests reference spec IDs in titles, tags, annotations, comments, or metadata. The tool scans test files and matches those references back to the Markdown documents.

```ts
test("ACCOUNT-ACCESS-S001 registered person signs in", async ({ page }) => {
  // Covers ACCOUNT-ACCESS-R001 and ACCOUNT-M001.
});
```

This keeps the test runner independent from `feature-spec-md`. You can use Playwright, Vitest, Node test, or another runner as long as the source files contain the relevant IDs.

## Install

```bash
npm install -D @anselmdk/feature-spec-md
```

Create starter specs:

```bash
npx feature-spec-md init --kind model --dir specs
npx feature-spec-md init --kind feature --dir specs
npx feature-spec-md init --kind stack --dir specs
npx feature-spec-md init --kind design --dir specs
```

## Workflow

1. Ask an AI to draft or update `*.model.md`, `*.feature.md`, `*.stack.md`, and `*.design.md` files.
2. Declare each feature/scenario test evidence policy where the default is not right.
3. Run `npx feature-spec-md check` until the spec set is valid.
4. Ask an AI to write executable tests from the specs, preserving the relevant `-M001`, `-R001`, and `-S001` IDs in the test source.
5. Run `npx feature-spec-md coverage` to see which scenarios, rules, and model items have tests.
6. Run `npx feature-spec-md report` to generate an HTML implementation report for review or CI artifacts.
7. Use `npx feature-spec-md github-report` in GitHub Actions when the report should be linked from the job summary, uploaded as an artifact, or published by FTP.
8. Use `npx feature-spec-md github-diff-report` in PR builds when a published diff should compare the current report output and screenshots with a base build and provide a PR comment body.

The longer flow, including AI prompts and CI setup, is in [docs/spec-driven-flow.md](docs/spec-driven-flow.md). The demo repository also shows the flow in practice: <https://github.com/anselmdk/feature-spec-md-demo>.

## CLI tools

```bash
npx feature-spec-md check
npx feature-spec-md coverage --fail-on-missing
npx feature-spec-md report --out test-results/spec-report/index.html
npx feature-spec-md github-report --report-dir test-results/spec-report --publish ftp
npx feature-spec-md github-diff-report --publish ftp --pr-number 123
```

By default the CLI scans:

```txt
specs/**/*.model.md
specs/**/*.feature.md
specs/**/*.stack.md
specs/**/*.design.md
tests/**/*.ts
```

Use explicit patterns when your project uses different paths:

```bash
npx feature-spec-md check \
  --specs "product/**/*.model.md,product/**/*.feature.md,product/**/*.stack.md,product/**/*.design.md" \
  --tests "e2e/**/*.spec.ts"
```

### `check`

Validates the spec set and, by default, requires model, rule, and scenario coverage when tests are scanned.

```bash
npx feature-spec-md check
```

`check` validates spec structure, references between documents, and test coverage. Use `--require-scenario-coverage=false`, `--require-rule-coverage=false`, or `--require-model-coverage=false` while drafting.

### `coverage`

Prints a terminal implementation report showing covered and missing model items, rules, and scenarios.

```bash
npx feature-spec-md coverage --fail-on-missing
```

Use `--fail-on-missing=false` when missing model item, rule, or scenario coverage should not fail CI.

### `report`

Writes an HTML report for local review, CI artifacts, or publishing.

```bash
npx feature-spec-md report \
  --tests "tests/**/*.ts" \
  --out test-results/spec-report/index.html
```

The report can include screenshot evidence from Playwright or another test runner by passing one or more screenshot manifest files:

```bash
npx feature-spec-md report \
  --screenshots "test-results/spec-report/screenshots-*.json"
```

When CI should fail for missing declared screenshot evidence, use `--enforce-evidence`:

```bash
npx feature-spec-md report \
  --screenshots "test-results/spec-report/screenshots-*.json" \
  --enforce-evidence \
  --out test-results/spec-report/index.html
```

This gate only fails for scenarios whose resolved screenshot policy is `required`. In GitHub Actions, the report also includes source links and report metadata derived from the repository, ref, SHA, run, build number, and pull request context when available.

### `github-report`

Writes a GitHub Actions job summary and prepares the generated report for either artifact upload or FTP publishing.

```bash
npx feature-spec-md github-report \
  --report-dir test-results/spec-report \
  --publish ftp
```

With FTP publishing, build reports are published below a `build/<build-number>/` directory. This keeps immutable build outputs available for later PR diff comparisons.

### `github-diff-report`

Builds and publishes a PR diff report from already-published feature spec report outputs.

```bash
npx feature-spec-md github-diff-report \
  --publish ftp \
  --pr-number 123
```

The diff report lists changed report assets, extracts changed spec sections, groups screenshot changes by spec/scenario, writes a GitHub Actions summary, and exposes a `diff-comment-body` output that a workflow can add to the PR. PR diff reports are published below `pr/<pr-number>/<build-number>/`.

## Playwright screenshot evidence

The package exports a Playwright helper from `@anselmdk/feature-spec-md/playwright`. It maps scenario step text back to the spec line, wraps the implementation in a Playwright `test.step`, captures a screenshot after the step, attaches it to the test, and writes a screenshot manifest such as `test-results/spec-report/screenshots-0.json`.

That manifest can then be passed to `feature-spec-md report` with `--screenshots "test-results/spec-report/screenshots-*.json"` so the HTML report can show scenario evidence next to the relevant spec step. With `--enforce-evidence`, missing screenshots fail only for scenarios declared as `screenshots: required`.

## GitHub Actions report publishing

`feature-spec-md github-report` writes the GitHub Actions job summary and can either prepare outputs for a GitHub artifact upload or publish the generated report to FTP. `feature-spec-md github-diff-report` compares published build reports and publishes a PR-specific diff report.

For FTP publishing, configure repository secrets in GitHub under **Settings → Secrets and variables → Actions → Repository secrets**.

Required secrets or environment variables:

```txt
FEATURE_SPEC_FTP_HOST=ftp.example.com
FEATURE_SPEC_FTP_USER=feature-spec-md
FEATURE_SPEC_FTP_PASSWORD=<your FTP password>
FEATURE_SPEC_REPORT_BASE_URL=http://feature-spec-md.anselm.dk/
```

Optional values:

```txt
FEATURE_SPEC_FTP_REMOTE_DIR=/public_html/feature-spec-md
FEATURE_SPEC_FTP_PORT=21
FEATURE_SPEC_FTP_SECURE=false
FEATURE_SPEC_BUILD_NUMBER=<build number, defaults to GITHUB_RUN_NUMBER>
FEATURE_SPEC_PR_NUMBER=<pull request number>
FEATURE_SPEC_BASE_BUILD_NUMBER=<main/base build number for PR diffs>
```

Example GitHub Actions step for publishing the current report:

```yaml
- name: Publish feature spec report
  if: always() && hashFiles('test-results/spec-report/index.html') != ''
  run: npx feature-spec-md github-report --publish ftp --report-dir test-results/spec-report
  env:
    FEATURE_SPEC_FTP_HOST: ${{ secrets.FEATURE_SPEC_FTP_HOST }}
    FEATURE_SPEC_FTP_USER: ${{ secrets.FEATURE_SPEC_FTP_USER }}
    FEATURE_SPEC_FTP_PASSWORD: ${{ secrets.FEATURE_SPEC_FTP_PASSWORD }}
    FEATURE_SPEC_REPORT_BASE_URL: ${{ secrets.FEATURE_SPEC_REPORT_BASE_URL }}
```

Example step for publishing a PR diff after the current report has been published:

```yaml
- name: Publish feature spec PR diff
  if: always() && github.event_name == 'pull_request'
  run: npx feature-spec-md github-diff-report --publish ftp --pr-number "${{ github.event.pull_request.number }}"
  env:
    FEATURE_SPEC_FTP_HOST: ${{ secrets.FEATURE_SPEC_FTP_HOST }}
    FEATURE_SPEC_FTP_USER: ${{ secrets.FEATURE_SPEC_FTP_USER }}
    FEATURE_SPEC_FTP_PASSWORD: ${{ secrets.FEATURE_SPEC_FTP_PASSWORD }}
    FEATURE_SPEC_REPORT_BASE_URL: ${{ secrets.FEATURE_SPEC_REPORT_BASE_URL }}
```

## Library API

Most integrations can use the top-level document API:

```ts
import {
  checkSpecDocuments,
  collectSpecScreenshots,
  parseSpecDocument,
  renderHtmlReport,
  renderLocalDiffReport,
  validateScenarioScreenshots,
  validateSpecDocument,
} from "@anselmdk/feature-spec-md";
```

Useful exports include:

- `parseSpecDocument` and kind-specific parsers for reading Markdown specs.
- `validateSpecDocument` and `validateSpecGraph` for checking one document or a connected spec set.
- `checkSpecDocuments` for loading specs and tests, validating documents, and computing coverage in one call.
- `buildSpecCoverageSummary` and `collectSpecTestReferences` for custom coverage workflows.
- `collectSpecScreenshots` and `validateScenarioScreenshots` for loading and enforcing screenshot evidence.
- `renderHtmlReport` for generating the same report UI from your own integration.
- `renderLocalDiffReport` for generating the same diff-report UI from local report directories.
- `insertReportMetadata` and `githubReportMetadata` for adding source/build/PR metadata to reports.
- `writeTextFile` for small report-writing integrations.

Feature-only helpers such as `parseFeatureSpec` and `checkFeatureSpecs` remain available for compatibility.

The package also exports `@anselmdk/feature-spec-md/specDocuments` and `@anselmdk/feature-spec-md/playwright` for more focused imports.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Releases

Release candidates and stable releases are documented in [docs/releasing.md](docs/releasing.md).
