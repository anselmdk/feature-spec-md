# feature-spec-md

Markdown specs for AI-assisted, testable spec-driven development.

`feature-spec-md` helps you describe a product in Markdown, ask an AI to turn those specs into executable tests, and then prove which parts of the specification are covered by those tests. It is intentionally small: your specs stay as plain Markdown, your tests stay in your normal test runner, and the tool connects the two through stable spec IDs.

```txt
model + features + stack + design
-> AI-written executable tests that reference stable spec IDs
-> validation, coverage, screenshots, and reports
```

## What the tool does

The shortest version is: `feature-spec-md` turns Markdown specifications into a testable contract.

It gives you:

- **Spec document formats** for domain models, product features, technical stack notes, and UI/design direction.
- **Stable IDs** for model items, rules, and scenarios, so tests can reference exactly what they implement.
- **Validation** that checks frontmatter, headings, IDs, cross-document references, and test coverage expectations.
- **Coverage reporting** that shows which model items, rules, and scenarios are implemented by tests.
- **HTML reports** that are useful for reviews, CI artifacts, or published build reports.
- **Screenshot evidence** for scenarios when using the Playwright helper.
- **A library API** for projects that want to parse specs, check coverage, collect screenshots, or render reports from their own tooling.

The specs are meant to be written with an AI before implementation. The tests are meant to be written with an AI from those specs. `feature-spec-md` then checks that the Markdown stays structured and that executable tests still cover the model items, rules, and scenarios the specs define.

## Why this exists

AI can write tests quickly, but it needs a stable source of truth. Free-form product notes are often too ambiguous, and generated tests are hard to audit later. `feature-spec-md` keeps the source of truth in readable Markdown and makes the AI preserve IDs such as `ACCOUNT-M001`, `TICKET-R001`, or `TICKET-S001` in the generated tests.

That gives humans a simple review loop:

1. Read the Markdown spec.
2. Read or run the generated tests.
3. Run `feature-spec-md check` or `coverage` to see what is missing.
4. Open the HTML report to review the implemented scenarios, rules, model items, and screenshots.

## Demo project

A complete demo app is available in [`anselmdk/feature-spec-md-demo`](https://github.com/anselmdk/feature-spec-md-demo). It shows a small support-ticket desk built from model, feature, stack, and design specs, with unit tests, Playwright tests, generated coverage, and a published report.

Demo reports, including scenario screenshots, are available here:

<https://feature-spec-md.anselm.dk/demo/>

Use the demo repository when you want to see the expected project shape, script names, screenshot manifest flow, and report output in a real app.

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

Feature specs describe user-facing behavior with rules and scenarios. Rules and scenarios get stable IDs that tests can reference.

```md
### ACCOUNT-ACCESS-R001: Sign-in links expire

Sign-in links can only be used within the configured expiry window.

### ACCOUNT-ACCESS-S001: Registered person signs in

Given a registered person is on the sign-in page
When they request and open a valid sign-in link
Then they are signed in
```

### Stack specs

Stack specs document technical decisions that shape the implementation: framework, storage, test runner, deployment constraints, external services, or architecture decisions.

### Design specs

Design specs capture product, UI, and interaction direction: layout priorities, states, accessibility expectations, empty states, or copy tone.

See [SPEC_FORMAT.md](SPEC_FORMAT.md) for the exact document format.

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
2. Run `npx feature-spec-md check` until the spec set is valid.
3. Ask an AI to write executable tests from the specs, preserving the relevant `-M001`, `-R001`, and `-S001` IDs in the test source.
4. Run `npx feature-spec-md coverage` to see which scenarios, rules, and model items have tests.
5. Run `npx feature-spec-md report` to generate an HTML implementation report for review or CI artifacts.
6. Use `npx feature-spec-md github-report` in GitHub Actions when the report should be linked from the job summary or published.

The longer flow, including AI prompts and CI setup, is in [docs/spec-driven-flow.md](docs/spec-driven-flow.md). The demo repository also shows the flow in practice: <https://github.com/anselmdk/feature-spec-md-demo>.

## CLI tools

```bash
npx feature-spec-md check
npx feature-spec-md coverage --fail-on-missing
npx feature-spec-md report --out test-results/feature-spec-report/index.html
npx feature-spec-md github-report --report-dir test-results/spec-report
```

By default the CLI scans:

```txt
specs/**/*.model.md
specs/**/*.feature.md
specs/**/*.stack.md
specs/**/*.design.md
tests/**/*.spec.ts
```

Use explicit patterns when your project uses different paths:

```bash
npx feature-spec-md check \
  --specs "product/**/*.model.md,product/**/*.feature.md,product/**/*.stack.md,product/**/*.design.md" \
  --tests "e2e/**/*.spec.ts"
```

### `init`

Creates starter Markdown files for one spec kind.

```bash
npx feature-spec-md init --kind feature --dir specs
```

Supported kinds are `model`, `feature`, `stack`, and `design`.

### `check`

Validates the spec set and, by default, requires scenario coverage when tests are scanned.

```bash
npx feature-spec-md check
```

`check` validates spec structure, references between documents, and test coverage. Use `--require-scenario-coverage=false` while drafting. Use `--require-rule-coverage` and `--require-model-coverage` when rules and model items must also fail validation if they have no test references.

The demo uses stricter coverage gates for all tests:

```bash
feature-spec-md check --tests "tests/**/*.ts" --require-rule-coverage --require-model-coverage
```

### `coverage`

Prints a terminal implementation report showing covered and missing model items, rules, and scenarios.

```bash
npx feature-spec-md coverage --fail-on-missing
```

Use `--fail-on-missing` when missing model item, rule, or scenario coverage should fail CI.

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

The demo report is published at <https://feature-spec-md.anselm.dk/demo/> and includes scenario screenshots, so it is the best place to see what the report output looks like.

### `github-report`

Writes a GitHub Actions job summary and prepares the generated report for either artifact upload or FTP publishing.

```bash
npx feature-spec-md github-report \
  --report-dir test-results/spec-report \
  --publish artifact
```

Use `--publish ftp` when the report should be uploaded to a public report site from CI.

```bash
npx feature-spec-md github-report \
  --report-dir test-results/spec-report \
  --publish ftp
```

## Playwright screenshot evidence

The package exports a Playwright helper from `@anselmdk/feature-spec-md/playwright`. It maps scenario step text back to the spec line, wraps the implementation in a Playwright `test.step`, captures a screenshot after the step, attaches it to the test, and writes a screenshot manifest such as `test-results/spec-report/screenshots-0.json`.

That manifest can then be passed to `feature-spec-md report` with `--screenshots "test-results/spec-report/screenshots-*.json"` so the HTML report can show scenario evidence next to the relevant spec step.

## GitHub Actions report publishing

`feature-spec-md github-report` writes the GitHub Actions job summary and can either prepare outputs for a GitHub artifact upload or publish the generated report to FTP.

```bash
npx feature-spec-md github-report \
  --report-dir test-results/spec-report \
  --publish ftp
```

For FTP publishing, configure repository secrets in GitHub under **Settings → Secrets and variables → Actions → Repository secrets**. For this repository, the direct settings URL is:

```txt
https://github.com/anselmdk/feature-spec-md/settings/secrets/actions
```

GitHub's documentation for repository secrets is here:

```txt
https://docs.github.com/actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository
```

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
```

Example GitHub Actions step:

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

With `FEATURE_SPEC_REPORT_BASE_URL=http://feature-spec-md.anselm.dk/` and GitHub Actions build number `42`, the report is uploaded to a build-numbered directory and linked as:

```txt
http://feature-spec-md.anselm.dk/42/
```

The build index is created or updated at:

```txt
http://feature-spec-md.anselm.dk/
```

FTP reports are uploaded into a build-numbered directory using `GITHUB_RUN_NUMBER`, and an `index.html` file is created or updated at the public base URL so all uploaded builds can be browsed. When FTP publishing is used, the command emits `upload-github-artifact=false` and links the GitHub Actions job summary directly to the hosted report URL.

## Library API

Most integrations can use the top-level document API:

```ts
import {
  checkSpecDocuments,
  collectSpecScreenshots,
  parseSpecDocument,
  renderHtmlReport,
  validateSpecDocument,
} from "@anselmdk/feature-spec-md";
```

Useful exports include:

- `parseSpecDocument` and kind-specific parsers for reading Markdown specs.
- `validateSpecDocument` and `validateSpecGraph` for checking one document or a connected spec set.
- `checkSpecDocuments` for loading specs and tests, validating documents, and computing coverage in one call.
- `buildSpecCoverageSummary` and `collectSpecTestReferences` for custom coverage workflows.
- `renderHtmlReport` for generating the same report UI from your own integration.
- `collectSpecScreenshots` for loading screenshot manifest files before rendering a report.
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
