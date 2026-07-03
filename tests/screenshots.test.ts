import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseFeatureSpec,
  validateScenarioScreenshots,
  type SpecScreenshot,
} from "../src/index.js";

const requiredSpec = parseFeatureSpec(
  `---
id: EXAMPLE-FEATURE
title: Example feature
test: playwright
screenshots: required
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

const unitOnlySpec = parseFeatureSpec(
  `---
id: EXAMPLE-UNIT
title: Example unit behavior
test: unit
screenshots: skip
---

# Example unit behavior

## Purpose

Describe behavior that is tested without UI evidence.

## Rules

- EXAMPLE-UNIT-R001: The unit behavior MUST be deterministic.

## Scenarios

### EXAMPLE-UNIT-S001: Function returns value

Given a deterministic input
When the function is called
Then the expected value is returned
`,
  { filePath: "specs/example-unit.feature.md" },
);

test("reports missing screenshot evidence only when the scenario policy requires it", () => {
  const issues = validateScenarioScreenshots([requiredSpec, unitOnlySpec], []);

  assert.equal(issues.length, 3);
  assert.equal(issues[0]?.code, "missing-screenshot-evidence");
  assert.equal(issues[0]?.severity, "error");
  assert.equal(issues[0]?.filePath, "specs/example.feature.md");
});

test("accepts screenshot evidence for matching spec step lines", () => {
  const screenshots: SpecScreenshot[] = requiredSpec.scenarios[0].steps.map(
    (step) => ({
      specPath: "specs/example.feature.md",
      line: step.line,
      path: `screenshots/line-${step.line}.png`,
    }),
  );

  assert.deepEqual(validateScenarioScreenshots([requiredSpec], screenshots), []);
});

test("defaults non-playwright scenarios to screenshot evidence skip", () => {
  assert.equal(unitOnlySpec.scenarios[0].evidence.test, "unit");
  assert.equal(unitOnlySpec.scenarios[0].evidence.screenshots, "skip");
  assert.deepEqual(validateScenarioScreenshots([unitOnlySpec], []), []);
});
