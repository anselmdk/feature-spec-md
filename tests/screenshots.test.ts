import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseFeatureSpec,
  validateScenarioScreenshots,
  type SpecScreenshot,
} from "../src/index.js";

const spec = parseFeatureSpec(
  `---
id: EXAMPLE-FEATURE
title: Example feature
---

# Example feature

## Purpose

Describe behavior that should have screenshot evidence.

## Rules

- EXAMPLE-FEATURE-R001: The feature MUST show its success state.

## Scenarios

### EXAMPLE-FEATURE-S001: User sees success

Given the user is on the feature screen
When they complete the action
Then they see the success state
`,
  { filePath: "specs/example.feature.md" },
);

test("reports missing screenshot evidence for every scenario step", () => {
  const issues = validateScenarioScreenshots([spec], []);

  assert.equal(issues.length, 3);
  assert.equal(issues[0]?.code, "missing-screenshot-evidence");
  assert.equal(issues[0]?.severity, "error");
  assert.equal(issues[0]?.filePath, "specs/example.feature.md");
});

test("accepts screenshot evidence for matching spec step lines", () => {
  const screenshots: SpecScreenshot[] = spec.scenarios[0].steps.map((step) => ({
    specPath: "specs/example.feature.md",
    line: step.line,
    path: `screenshots/line-${step.line}.png`,
  }));

  assert.deepEqual(validateScenarioScreenshots([spec], screenshots), []);
});
