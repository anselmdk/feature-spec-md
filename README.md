# feature-spec-md

Markdown specs for AI-assisted, testable spec driven development.

The concept is deliberately small:

```txt
model + features + stack + design
-> AI-written executable tests that reference stable spec IDs
-> validation, coverage, screenshots, and reports
```

The specs are meant to be written with an AI before implementation. The tests are meant to be written with an AI from those specs. `feature-spec-md` checks that the Markdown stays structured and that executable tests still cover the model items, rules, and scenarios the specs define.

## What You Write

Use four ordinary Markdown document types:

```txt
*.model.md    shared domain vocabulary
*.feature.md  user-facing behavior, rules, and scenarios
*.stack.md    technical platform choices
*.design.md   product, UI, and interaction direction
```

Each document has frontmatter, a short `## Purpose`, and stable IDs. Tests reference those IDs in titles, tags, annotations, comments, or metadata.

```md
### ACCOUNT-ACCESS-S001: Registered person signs in

Given a registered person is on the sign-in page
When they request and open a valid sign-in link
Then they are signed in
```

```ts
test("ACCOUNT-ACCESS-S001 registered person signs in", async ({ page }) => {
  // Covers ACCOUNT-ACCESS-R001 and ACCOUNT-M001.
});
```

See [SPEC_FORMAT.md](SPEC_FORMAT.md) for the exact document format.

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

The longer flow, including AI prompts and CI setup, is in [docs/spec-driven-flow.md](docs/spec-driven-flow.md).

## CLI

```bash
npx feature-spec-md check
npx feature-spec-md coverage --fail-on-missing
npx feature-spec-md report --out test-results/feature-spec-report/index.html
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

The `check` command validates spec structure, references between documents, and test coverage. Scenario coverage is required by default when tests are scanned. Use `--require-scenario-coverage=false` while drafting. Use `--require-rule-coverage` and `--require-model-coverage` when rules and model items must also fail validation if they have no test references.

The `coverage` command prints a terminal implementation report. Use `--fail-on-missing` when missing model item, rule, or scenario coverage should fail CI.

The `report` command writes an HTML report. It can include screenshot evidence from Playwright or another test runner by passing one or more screenshot manifest files:

```bash
npx feature-spec-md report \
  --screenshots "test-results/spec-report/screenshots-*.json"
```

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
  parseSpecDocument,
  renderHtmlReport,
  validateSpecDocument,
} from "@anselmdk/feature-spec-md";
```

Feature-only helpers such as `parseFeatureSpec` and `checkFeatureSpecs` remain available for compatibility.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Releases

Release candidates and stable releases are documented in [docs/releasing.md](docs/releasing.md).
