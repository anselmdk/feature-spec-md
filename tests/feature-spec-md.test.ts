import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildCoverageSummary,
  checkSpecDocuments,
  checkFeatureSpecs,
  collectSpecScreenshots,
  parseFeatureSpec,
  parseSpecDocument,
  parseTestReferences,
  renderHtmlReport,
  validateCoverage,
  validateFeatureSpec,
} from "../src/index.js";
import {
  createPlaywrightSpecEvidence,
  loadSpecSteps,
} from "../src/playwright.js";
import {
  buildSpecCoverageSummary,
  parseModelSpec,
  parseSpecTestReferences,
} from "../src/specDocuments.js";
import {
  buildSpecImplementationReport,
  formatSpecImplementationReport,
} from "../src/testImplementationReport.js";

const specSource = `---
id: ACCOUNT
title: Account access
status: draft
---

# Account access

## Purpose

People can access their account after completing the required flow.

## Rules

- ACCOUNT-R001: A person MUST complete the required flow before account access is granted.

## Scenarios

### ACCOUNT-S001: Returning person completes access flow

Given a returning person is on the access page
When they complete the required flow
Then account access is granted
`;

describe("feature-spec-md", () => {
  it("parses and validates a Markdown feature spec", () => {
    const spec = parseFeatureSpec(specSource, {
      filePath: "account.feature.md",
    });
    assert.equal(spec.frontmatter.id, "ACCOUNT");
    assert.equal(spec.rules[0]?.keyword, "MUST");
    assert.equal(spec.scenarios[0]?.id, "ACCOUNT-S001");
    assert.deepEqual(
      validateFeatureSpec(spec).filter((issue) => issue.severity === "error"),
      [],
    );
  });

  it("maps test references to rule and scenario coverage", () => {
    const spec = parseFeatureSpec(specSource, {
      filePath: "account.feature.md",
    });
    const refs = parseTestReferences(
      'test("ACCOUNT-S001", () => { /* ACCOUNT-R001 */ })',
      "account.spec.ts",
    );
    const coverage = buildCoverageSummary([spec], refs);
    assert.equal(coverage.scenarioCoverage[0]?.covered, true);
    assert.equal(coverage.ruleCoverage[0]?.covered, true);
    assert.deepEqual(
      validateCoverage(coverage, { requireRuleCoverage: true }),
      [],
    );
  });

  it("reports implemented, partial, and missing specs", () => {
    const implementedSpec = parseFeatureSpec(specSource, {
      filePath: "specs/account.feature.md",
    });
    const partialSpec = parseFeatureSpec(
      specSource.replaceAll("ACCOUNT", "PROFILE").replace(
        "### PROFILE-S001: Returning person completes access flow",
        `### PROFILE-S001: Returning person completes access flow

Given a returning person is on the profile page
When they complete the required flow
Then profile access is granted

### PROFILE-S002: New person starts profile flow`,
      ),
      { filePath: "specs/profile.feature.md" },
    );
    const missingSpec = parseFeatureSpec(
      specSource.replaceAll("ACCOUNT", "BILLING"),
      {
        filePath: "specs/billing.feature.md",
      },
    );
    const refs = parseTestReferences(
      'test("ACCOUNT-S001 ACCOUNT-R001", () => {}); test("PROFILE-S001 PROFILE-R001", () => {})',
      "tests/account.spec.ts",
    );
    const coverage = buildCoverageSummary(
      [implementedSpec, partialSpec, missingSpec],
      refs,
    );
    const report = buildSpecImplementationReport(
      [implementedSpec, partialSpec, missingSpec],
      coverage,
    );
    const text = formatSpecImplementationReport(report);

    assert.deepEqual(
      report.implemented.map((spec) => spec.id),
      ["ACCOUNT"],
    );
    assert.deepEqual(
      report.partial.map((spec) => spec.id),
      ["PROFILE"],
    );
    assert.deepEqual(
      report.missing.map((spec) => spec.id),
      ["BILLING"],
    );
    assert.match(
      text,
      /Summary: 1\/3 spec\(s\) implemented, 2\/4 scenario\(s\) covered, 2\/3 rule\(s\) covered\./,
    );
    assert.match(text, /missing PROFILE-S002: New person starts profile flow/);
    assert.match(
      text,
      /covered rule PROFILE-R001: A person MUST complete the required flow before account access is granted\. \(tests\/account\.spec\.ts:1\)/,
    );
    assert.match(text, /missing rule BILLING-R001/);
    assert.match(
      text,
      /BILLING: Account access \(0\/1 scenarios, 0\/1 rules\)/,
    );
  });

  it("reports model item coverage when model specs are loaded", () => {
    const model = parseModelSpec(
      `---
id: ACCOUNT
title: Account model
status: draft
---

# Account model

## Purpose

Define the account concepts.

## Model

### ACCOUNT-M001: Account

An account stores profile access.

### ACCOUNT-M002: Session

A session represents current browser access.

## Rules

- ACCOUNT-R002: An account MUST have a stable identifier.
`,
      { filePath: "specs/account.model.md" },
    );
    const spec = parseFeatureSpec(specSource, {
      filePath: "specs/account.feature.md",
    });
    const feature = { ...spec, kind: "feature" as const };
    const refs = parseSpecTestReferences(
      'test("ACCOUNT-S001 ACCOUNT-R001", () => { /* ACCOUNT-M001 ACCOUNT-R002 */ })',
      "tests/account.spec.ts",
    );
    const coverage = buildSpecCoverageSummary([model, feature], refs);
    const report = buildSpecImplementationReport([feature], coverage, [model]);
    const text = formatSpecImplementationReport(report);

    assert.match(
      text,
      /Summary: 1\/1 spec\(s\) implemented, 1\/1 scenario\(s\) covered, 2\/2 rule\(s\) covered, 1\/2 model item\(s\) covered\./,
    );
    assert.match(text, /Missing model items: 1\./);
    assert.match(text, /Models:/);
    assert.match(
      text,
      /ACCOUNT: Account model \(1\/2 model items, 1\/1 rules\)/,
    );
    assert.match(
      text,
      /covered model ACCOUNT-M001: Account \(tests\/account\.spec\.ts:1\)/,
    );
    assert.match(
      text,
      /covered rule ACCOUNT-R002: An account MUST have a stable identifier\. \(tests\/account\.spec\.ts:1\)/,
    );
    assert.match(text, /missing model ACCOUNT-M002: Session/);
  });

  it("exports document-level helpers from the package root", async () => {
    const doc = parseSpecDocument(specSource, {
      filePath: "specs/account.feature.md",
    });
    assert.equal(doc.kind, "feature");

    const root = await mkdtemp(path.join(os.tmpdir(), "feature-spec-md-"));
    const cwd = process.cwd();
    try {
      await mkdir(path.join(root, "specs"), { recursive: true });
      await mkdir(path.join(root, "tests"), { recursive: true });
      await writeFile(
        path.join(root, "specs", "account.feature.md"),
        specSource,
        "utf8",
      );
      await writeFile(
        path.join(root, "tests", "account.spec.ts"),
        'test("ACCOUNT-S001", () => { /* ACCOUNT-R001 */ })',
        "utf8",
      );
      process.chdir(root);
      const result = await checkSpecDocuments({
        specs: ["specs/**/*.feature.md"],
        tests: ["tests/**/*.spec.ts"],
      });
      assert.equal(result.ok, true);
      assert.equal(result.features.length, 1);
    } finally {
      process.chdir(cwd);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("renders source links in report titles, coverage badges, and line badges", () => {
    const spec = parseFeatureSpec(specSource, {
      filePath: "account.feature.md",
    });
    const refs = parseTestReferences(
      `test("ACCOUNT-S001 Returning person completes access flow", () => {
  // Covers ACCOUNT-R001.
})`,
      "account.spec.ts",
    );
    const coverage = buildCoverageSummary([spec], refs);
    const reportHtml = renderHtmlReport([spec], {
      coverage,
      title: "Feature Spec Report for feature-spec-md-demo",
      validationIssues: [],
      generatedAt: "2026-06-16T23:26:00",
      githubBaseUrl: "https://github.com/anselmdk/feature-spec-md-demo",
      githubRef: "abc123",
      repositoryUrl: "https://github.com/anselmdk/feature-spec-md-demo",
    });

    assert.match(
      reportHtml,
      /<title>Feature Spec Report for feature-spec-md-demo<\/title>/,
    );
    assert.match(
      reportHtml,
      /<h1>Feature Spec Report for <a href="https:\/\/github\.com\/anselmdk\/feature-spec-md-demo" target="_blank" rel="noopener noreferrer">feature-spec-md-demo<\/a><\/h1>/,
    );
    assert.match(reportHtml, /Generated 16th June 2026 at 23:26\./);
    assert.doesNotMatch(reportHtml, /<h2>Validation<\/h2>/);
    assert.match(reportHtml, /<h2>Account access<\/h2>/);
    assert.doesNotMatch(reportHtml, /<h2>ACCOUNT Account access<\/h2>/);
    assert.match(reportHtml, /covered by ACCOUNT-S001/);
    assert.doesNotMatch(reportHtml, /via/);
    assert.match(
      reportHtml,
      /<a class="coverage-ref" href="https:\/\/github\.com\/anselmdk\/feature-spec-md-demo\/blob\/abc123\/account\.spec\.ts#L2" title="account\.spec\.ts:2" target="_blank" rel="noopener noreferrer">1<\/a>/,
    );
    assert.match(
      reportHtml,
      /<a class="badge line-link" href="https:\/\/github\.com\/anselmdk\/feature-spec-md-demo\/blob\/abc123\/account\.feature\.md#L21" title="account\.feature\.md:21" target="_blank" rel="noopener noreferrer">line 21<\/a>/,
    );
    assert.match(
      reportHtml,
      /Rules covered by this scenario:<\/strong> <code>ACCOUNT-R001<\/code>/,
    );
  });

  it("renders full scenario IDs and stored feature rule IDs in the HTML report", () => {
    const spec = parseFeatureSpec(
      `---
id: BOARD-VIEW
title: Board view
status: draft
model: KANBAN
---

# Board view

## Purpose

Show the Kanban board.

## Rules

- BOARD-VIEW-R001: The board MUST show columns.

## Scenarios

### BOARD-VIEW-S001: User sees board columns

Given no cards exist
When the user opens the board
Then the columns are visible
`,
      { filePath: "board-view.feature.md" },
    );
    const refs = parseTestReferences(
      `test("BOARD-VIEW-S001 User sees board columns", () => {
  // Covers BOARD-VIEW-R001.
})`,
      "board-view.spec.ts",
    );
    const coverage = buildCoverageSummary([spec], refs);
    const html = renderHtmlReport([spec], { coverage });

    assert.match(
      html,
      /<code>BOARD-VIEW-R001<\/code>: The board MUST show columns\./,
    );
    assert.match(html, /covered by BOARD-VIEW-S001/);
    assert.match(
      html,
      /Rules covered by this scenario:<\/strong> <code>BOARD-VIEW-R001<\/code>/,
    );
  });

  it("renders feature evidence policy and compacts scenarios that skip screenshots", () => {
    const spec = parseFeatureSpec(
      specSource.replace(
        "status: draft",
        "status: draft\ntest: integration\nscreenshots: skip",
      ),
      { filePath: "account.feature.md" },
    );
    const reportHtml = renderHtmlReport([spec]);

    assert.match(
      reportHtml,
      /<div class="feature-policy"><span class="badge"><span class="muted">test<\/span> <code>integration<\/code><\/span><span class="badge"><span class="muted">screenshots<\/span> <code>skip<\/code><\/span><\/div>/,
    );
    assert.doesNotMatch(reportHtml, /no visual evidence recorded/);
    assert.doesNotMatch(reportHtml, /no screenshot captured/);
    assert.match(reportHtml, /<div class="scenario-body compact-steps">/);
    assert.match(
      reportHtml,
      /\.scenario-body\.compact-steps \.step\{margin:4px 0\}/,
    );
  });

  it("renders ordinal suffixes in generated timestamps", () => {
    const spec = parseFeatureSpec(specSource, {
      filePath: "account.feature.md",
    });

    assert.match(
      renderHtmlReport([spec], { generatedAt: "2026-06-01T09:05:00" }),
      /Generated 1st June 2026 at 09:05\./,
    );
    assert.match(
      renderHtmlReport([spec], { generatedAt: "2026-06-02T09:05:00" }),
      /Generated 2nd June 2026 at 09:05\./,
    );
    assert.match(
      renderHtmlReport([spec], { generatedAt: "2026-06-03T09:05:00" }),
      /Generated 3rd June 2026 at 09:05\./,
    );
    assert.match(
      renderHtmlReport([spec], { generatedAt: "2026-06-11T09:05:00" }),
      /Generated 11th June 2026 at 09:05\./,
    );
  });

  it("renders model coverage references in the HTML report", () => {
    const model = parseModelSpec(
      `---
id: ACCOUNT
title: Account model
status: draft
---

# Account model

## Purpose

Define the account concepts.

## Model

### ACCOUNT-M001: Account

An account stores profile access.

| Field | Required |
| ----- | -------- |
| \`Id\` | yes |

## Rules

- ACCOUNT-R002: An account MUST have a stable identifier.
`,
      { filePath: "specs/account.model.md" },
    );
    const spec = { ...parseFeatureSpec(specSource), kind: "feature" as const };
    const refs = parseSpecTestReferences(
      `test("ACCOUNT-S001", () => {
  // Covers ACCOUNT-M001 ACCOUNT-R002.
})`,
      "tests/account.spec.ts",
    );
    const coverage = buildSpecCoverageSummary([model, spec], refs);
    const reportHtml = renderHtmlReport([spec], { models: [model], coverage });

    assert.match(reportHtml, /<details class="model-item">/);
    assert.match(reportHtml, /data-details-selector="details\.model-item"[^>]+>Show all models<\/button>/);
    assert.match(reportHtml, /<summary><code>ACCOUNT-M001<\/code>: Account/);
    assert.doesNotMatch(reportHtml, /<summary>Model<\/summary>/);
    assert.match(reportHtml, /An account stores profile access\./);
    assert.match(reportHtml, /<table>/);
    assert.match(reportHtml, /<th>Field<\/th>/);
    assert.match(reportHtml, /<td><code>Id<\/code><\/td>/);
    assert.match(reportHtml, /<td>yes<\/td>/);
    assert.match(
      reportHtml,
      /<code>ACCOUNT-R002<\/code>: An account MUST have a stable identifier\./,
    );
    assert.match(reportHtml, /covered by ACCOUNT-S001/);
    assert.doesNotMatch(reportHtml, /via/);
    assert.match(
      reportHtml,
      /<span class="coverage-ref" title="tests\/account\.spec\.ts:2">1<\/span>/,
    );
  });

  it("renders section-scoped show and hide controls for models and scenarios", () => {
    const model = parseModelSpec(
      `---
id: ACCOUNT
title: Account model
status: draft
---

# Account model

## Purpose

Define accounts.

## Model

### ACCOUNT-M001: Account

An account.

### ACCOUNT-M002: Member

An account member.
`,
      { filePath: "specs/account.model.md" },
    );
    const spec = { ...parseFeatureSpec(specSource), kind: "feature" as const };
    const reportHtml = renderHtmlReport([spec], { models: [model] });

    assert.match(reportHtml, /<section class="panel" data-details-section>/);
    assert.match(reportHtml, /data-details-selector="details\.scenario"[^>]+>Show all scenarios<\/button>/);
    assert.match(reportHtml, /data-hide-label="Hide all models"/);
    assert.match(reportHtml, /data-hide-label="Hide all scenarios"/);
    assert.equal(reportHtml.match(/<details class="model-item">/g)?.length, 2);
    assert.match(reportHtml, /section\.querySelectorAll\(button\.dataset\.detailsSelector\)/);
    assert.match(reportHtml, /details\.open = shouldOpen/);
    assert.doesNotMatch(reportHtml, /<details class="(?:model-item|scenario)"[^>]* open/);
  });

  it("renders Mermaid model diagrams and preserves escaped source as a fallback", () => {
    const model = parseModelSpec(
      `---
id: ACCOUNT
title: Account model
status: draft
---

# Account model

## Purpose

Define account concepts.

## Model

### ACCOUNT-M001: Account

An account owns members.

## Model Diagram

\`\`\`mermaid
erDiagram
    ACCOUNT ||--o{ MEMBER : owns
    ACCOUNT }o--|| PLAN : "uses <paid>"
\`\`\`
`,
      { filePath: "specs/account.model.md" },
    );
    const spec = { ...parseFeatureSpec(specSource), kind: "feature" as const };
    const reportHtml = renderHtmlReport([spec], { models: [model] });

    assert.match(reportHtml, /<h4>Model Diagram <span class="badge">line 19<\/span><\/h4>/);
    assert.match(reportHtml, /<pre class="mermaid">erDiagram/);
    assert.match(reportHtml, /ACCOUNT \|\|--o\{ MEMBER : owns/);
    assert.match(reportHtml, /&quot;uses &lt;paid&gt;&quot;/);
    assert.match(reportHtml, /mermaid@11\/dist\/mermaid\.min\.js/);
    assert.match(reportHtml, /window\.mermaid\.run/);
  });

  it("links flagged items to their detailed report sections and renders at most two columns", () => {
    const model = parseModelSpec(
      `---
id: ACCOUNT
title: Account model
status: draft
---

# Account model

## Purpose

Define account concepts.

## Model

### ACCOUNT-M001: Account

An account owns members.

## Open Questions

- ACCOUNT-Q001: Should members have aliases?
- ACCOUNT-Q002: Should aliases be unique?

## Assumptions

- Account email is available.
`,
      { filePath: "specs/account.model.md" },
    );
    const spec = { ...parseFeatureSpec(specSource), kind: "feature" as const };
    const reportHtml = renderHtmlReport([spec], {
      models: [model],
      githubBaseUrl: "https://github.com/example/repository",
      githubRef: "abc123",
    });

    assert.match(
      reportHtml,
      /class="flag-item-link" href="#account-q001">ACCOUNT-Q001: Should members have aliases\?<\/a>/,
    );
    assert.match(
      reportHtml,
      /class="flag-item-link" href="#account-assumptions-26">Account email is available\.<\/a>/,
    );
    assert.match(
      reportHtml,
      /<li id="account-q001">ACCOUNT-Q001: Should members have aliases\?<\/li>/,
    );
    assert.match(
      reportHtml,
      /<li id="account-assumptions-26">Account email is available\.<\/li>/,
    );
    assert.doesNotMatch(reportHtml, /class="flag-item-link"[^>]+target="_blank"/);
    assert.match(
      reportHtml,
      /Informational only:[^<]+Review and either answer, promote to rules\/scenarios, or remove when no longer relevant\./,
    );
    assert.equal(
      reportHtml.match(/Review and either answer/g)?.length,
      1,
    );
    assert.match(
      reportHtml,
      /\.flag-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
    );
  });

  it("renders spec line screenshots in the HTML report", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feature-spec-md-"));
    const cwd = process.cwd();
    try {
      const spec = parseFeatureSpec(
        specSource.replace("status: draft", "status: draft\nscreenshots: optional"),
        { filePath: "account.feature.md" },
      );
      const step = spec.scenarios[0]?.steps[0];
      assert.ok(step);
      await mkdir(path.join(root, "test-results"), { recursive: true });
      await writeFile(
        path.join(root, "test-results", "screenshots.json"),
        JSON.stringify({
          screenshots: [
            {
              specPath: "account.feature.md",
              line: step.line,
              path: "screenshots/account-s001-line-22.png",
              title: "Given a returning person is on the access page",
            },
          ],
        }),
        "utf8",
      );
      process.chdir(root);
      const screenshots = await collectSpecScreenshots([
        "test-results/screenshots.json",
      ]);
      const html = renderHtmlReport([spec], { screenshots });

      assert.match(html, /screenshots\/account-s001-line-22\.png/);
      assert.match(html, /data-has-images="true"/);
      assert.doesNotMatch(html, /visual changes?/);
      assert.doesNotMatch(html, /unchanged screens?/);
      assert.match(
        html,
        /const topBefore = target\.getBoundingClientRect\(\)\.top/,
      );
      assert.match(html, /window\.scrollBy\(0, topAfter - topBefore\)/);
      assert.match(
        html,
        /querySelectorAll\('details\.scenario\[data-has-images="true"\]\[open\]'\)/,
      );
      assert.match(html, /missing screenshot/);
    } finally {
      process.chdir(cwd);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("checks specs and tests from file globs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feature-spec-md-"));
    const cwd = process.cwd();
    try {
      await mkdir(path.join(root, "specs"), { recursive: true });
      await mkdir(path.join(root, "tests"), { recursive: true });
      await writeFile(
        path.join(root, "specs", "account.feature.md"),
        specSource,
        "utf8",
      );
      await writeFile(
        path.join(root, "tests", "account.spec.ts"),
        'test("ACCOUNT-S001", () => { /* ACCOUNT-R001 */ })',
        "utf8",
      );
      process.chdir(root);
      const result = await checkFeatureSpecs({
        specs: ["specs/**/*.feature.md"],
        tests: ["tests/**/*.spec.ts"],
        requireRuleCoverage: true,
      });
      assert.equal(result.ok, true);
    } finally {
      process.chdir(cwd);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("loads spec steps and writes Playwright screenshot evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feature-spec-md-"));
    try {
      await mkdir(path.join(root, "specs"), { recursive: true });
      await writeFile(
        path.join(root, "specs", "account.feature.md"),
        specSource,
        "utf8",
      );

      const steps = await loadSpecSteps(["specs/**/*.feature.md"], root);
      const spec = parseFeatureSpec(specSource, {
        filePath: "specs/account.feature.md",
      });
      const firstStepLine = spec.scenarios[0]?.steps[0]?.line;
      assert.equal(steps[0]?.scenarioId, "ACCOUNT-S001");
      assert.equal(steps[0]?.line, firstStepLine);

      const calls: string[] = [];
      const helper = createPlaywrightSpecEvidence(
        {
          async step(_title, body) {
            return body();
          },
        },
        { specs: ["specs/**/*.feature.md"], cwd: root },
      );

      await helper.specStep(
        {
          async screenshot(options) {
            calls.push(options.path);
            await writeFile(options.path, "fake image", "utf8");
          },
        },
        {
          async attach(name) {
            calls.push(name);
          },
          file: "tests/account.spec.ts",
          workerIndex: 0,
        },
        "ACCOUNT-S001",
        "Given a returning person is on the access page",
        async () => {
          calls.push("body");
        },
      );

      assert.equal(calls.includes("body"), true);
      const screenshots = await collectSpecScreenshots([
        path.join(root, "test-results/spec-report/screenshots-0.json"),
      ]);
      assert.equal(screenshots[0]?.line, firstStepLine);
      assert.equal(
        screenshots[0]?.path,
        `screenshots/ACCOUNT-S001-line-${firstStepLine}-a-returning-person-is-on-the-access-page.png`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
