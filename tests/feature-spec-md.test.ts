import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildCoverageSummary,
  checkFeatureSpecs,
  parseFeatureSpec,
  parseTestReferences,
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
