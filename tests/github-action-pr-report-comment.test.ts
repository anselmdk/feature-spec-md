import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const workflowPath =
  ".github/workflows/consuming-project-feature-spec-pr-diff-report.yml";

test("PR report comments run for failed CI and preserve stacked report history", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /github\.event\.workflow_run\.pull_requests\[0\]/);
  assert.doesNotMatch(
    workflow,
    /github\.event\.workflow_run\.conclusion == 'success' &&/,
  );
  assert.match(
    workflow,
    /- name: Comment on consuming project PR\n        if: always\(\)/,
  );
  assert.match(
    workflow,
    /status: failed \? 'failure' : relevant \? 'success' : 'skipped'/,
  );
  assert.match(workflow, /color: #cf222e/);
  assert.match(workflow, /Previous reports/);
});
