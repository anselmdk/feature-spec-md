# feature-spec-md

Markdown feature specs with stable rule and scenario IDs, validation, coverage checks, and generated reports.

The goal is simple:

```txt
human-readable feature spec
→ exact executable tests
→ generated coverage report
```

The handwritten spec stays clean. It contains purpose, rules, and scenarios. Test mapping is derived from stable IDs instead of being written manually in the spec.

## Format

Feature specs are ordinary Markdown files named `*.feature.md`.

They use:

- frontmatter for metadata
- `## Purpose` for intent
- `## Rules` for general business rules
- `## Scenarios` for Given / When / Then examples

See `SPEC_FORMAT.md` and `examples/account-access.feature.md`.

## CLI

```bash
npm install
npm run dev -- check --specs "examples/**/*.feature.md" --tests "tests/**/*.test.ts" --require-scenario-coverage=false
npm run dev -- report --specs "examples/**/*.feature.md" --tests "tests/**/*.test.ts"
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
