# Report development mock data

The report UI is easier to develop when it can be rendered without a real app build, Playwright run, FTP server, or multiple published builds.

Run the library-owned mock setup from this package:

```bash
npm run report:mock
```

It writes a deterministic set of report fixtures to `test-results/mock-reports/`:

```txt
test-results/mock-reports/
├── feature-spec-report/index.html
├── previous-feature-spec-report/index.html
└── diff-report/index.html
```

The fixtures intentionally include the states that are otherwise cumbersome to reproduce by hand:

- covered and missing model/rule/scenario coverage
- orphan test references
- warning-level validation output
- current and previous screenshot evidence
- report metadata for branch, build, commit, and pull request
- a PR diff report with changed spec text, added spec text, changed screenshots, and added screenshots

Use `--out` to write the mock reports somewhere else:

```bash
npm run report:mock -- --out /tmp/feature-spec-md-reports
```

The same data is available from the library for custom dev servers or visual tests:

```ts
import {
  createMockReportData,
  renderMockDiffReport,
  renderMockFeatureSpecReport,
  writeMockReports,
} from "@anselmdk/feature-spec-md";
```

Keep new reusable report states in `src/mockReports.ts` so downstream projects and the demo repository can use the same fixtures instead of maintaining their own copies.
