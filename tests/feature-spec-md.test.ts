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
});
