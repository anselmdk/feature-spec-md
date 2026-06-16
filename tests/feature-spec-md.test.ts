import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildCoverageSummary,
  checkFeatureSpecs,
  collectSpecScreenshots,
  parseFeatureSpec,
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
    assert.match(text, /covered rule PROFILE-R001/);
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
`,
      { filePath: "specs/account.model.md" },
    );
    const spec = parseFeatureSpec(specSource, {
      filePath: "specs/account.feature.md",
    });
    const feature = { ...spec, kind: "feature" as const };
    const refs = parseSpecTestReferences(
      'test("ACCOUNT-S001 ACCOUNT-R001", () => { /* ACCOUNT-M001 */ })',
      "tests/account.spec.ts",
    );
    const coverage = buildSpecCoverageSummary([model, feature], refs);
    const report = buildSpecImplementationReport([feature], coverage, [model]);
    const text = formatSpecImplementationReport(report);

    assert.match(
      text,
      /Summary: 1\/1 spec\(s\) implemented, 1\/1 scenario\(s\) covered, 1\/1 rule\(s\) covered, 1\/2 model item\(s\) covered\./,
    );
    assert.match(text, /Missing model items: 1\./);
    assert.match(text, /Models:/);
    assert.match(text, /ACCOUNT: Account model \(1\/2 model items\)/);
    assert.match(text, /covered model ACCOUNT-M001: Account/);
    assert.match(text, /missing model ACCOUNT-M002: Session/);
  });

  it("renders scenario links on covered rules and rule IDs under scenarios", () => {
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
    const html = renderHtmlReport([spec], { coverage });

    assert.match(html, /covered by S001/);
    assert.match(
      html,
      /Rules covered by this scenario:<\/strong> <code>ACCOUNT-R001<\/code>/,
    );
  });

  it("renders spec line screenshots in the HTML report", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feature-spec-md-"));
    const cwd = process.cwd();
    try {
      const spec = parseFeatureSpec(specSource, {
        filePath: "account.feature.md",
      });
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
