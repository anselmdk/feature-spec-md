# feature-spec-md

Markdown feature specs with stable model, rule, and scenario IDs, validation, coverage checks, and generated reports.

The goal is simple:

```txt
human-readable model + feature specs
→ exact executable tests
→ generated coverage report
```

The handwritten specs stay clean. Shared domain language lives in `*.model.md` files. User-facing capabilities live in `*.feature.md` files with rules and scenarios. Test mapping is derived from stable IDs instead of being written manually in the spec.

## Format

Feature Spec Markdown uses ordinary Markdown files:

```txt
*.model.md
*.feature.md
```

Model files use:

- frontmatter for metadata
- `## Model` for shared domain vocabulary
- optional `## Rules` for global invariants

Feature files use:

- frontmatter for metadata
- optional `model` or `models` references
- `## Rules` for durable product truths
- `## Scenarios` for Given / When / Then examples

See `SPEC_FORMAT.md` and `examples/account-access.feature.md`.

## CLI

```bash
npm install
npm run dev -- check --specs "examples/**/*.feature.md" --tests "tests/**/*.test.ts" --require-scenario-coverage=false
npm run dev -- coverage --specs "specs/**/*.feature.md" --tests "tests/**/*.spec.ts"
npm run dev -- report --specs "examples/**/*.feature.md" --tests "tests/**/*.test.ts"
npm run dev -- report --specs "examples/**/*.feature.md" --tests "tests/**/*.test.ts" --screenshots "test-results/spec-report/screenshots-*.json"
```

The `coverage` command prints a simple terminal report that groups feature
specs by whether all, some, or none of their scenarios have matching test
references. Use `--fail-on-missing` when missing scenario tests should fail CI.

Playwright screenshot evidence can be shown in the report by passing one or
more screenshot manifest JSON files. Each screenshot should point at the spec
file and line it proves:

```json
{
  "screenshots": [
    {
      "specPath": "specs/account-access.feature.md",
      "line": 24,
      "path": "screenshots/account-s001-line-24.png",
      "title": "ACCOUNT-S001:24 Given a registered person is on the sign-in page"
    }
  ]
}
```

## Library API

```ts
import {
  checkFeatureSpecs,
  parseFeatureSpec,
  renderHtmlReport,
  validateFeatureSpec,
} from "feature-spec-md";
```

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Releases

Stable releases are published to npm by the `Publish to npm` GitHub Actions workflow when a `v*` tag is pushed, or when the workflow is run manually.

Release candidates are published manually from GitHub Actions:

1. Open the `Publish RC to npm` workflow.
2. Run the workflow from `main`.
3. The workflow verifies the package, creates a prerelease version using the current package version and GitHub run number, and publishes it with the npm `rc` dist-tag.

Install the latest release candidate with:

```bash
npm install @anselmdk/feature-spec-md@rc
```
