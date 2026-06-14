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

  it("renders scenario short IDs on covered rule badges", () => {
    const spec = parseFeatureSpec(specSource, {
      filePath: "account.feature.md",
    });
    const refs = parseTestReferences(
      'test("ACCOUNT-S001 ACCOUNT-R001", () => {})',
      "account.spec.ts",
    );
    const coverage = buildCoverageSummary([spec], refs);
    const html = renderHtmlReport([spec], { coverage });

    assert.match(html, /covered S001/);
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
