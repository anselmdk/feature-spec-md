import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { renderLocalDiffReport } from "../src/githubActionDiffReport.js";

describe("GitHub Action screenshot diffs", () => {
  it("pairs screenshots whose generated line number changed", async () => {
    const root = await mkdtemp(join(tmpdir(), "feature-spec-md-diff-test-"));
    const previousDir = join(root, "previous");
    const currentDir = join(root, "current");
    const previousPath =
      "screenshots/ACCOUNT-S001-line-25-the-user-opens-the-account.png";
    const currentPath =
      "screenshots/ACCOUNT-S001-line-26-the-user-opens-the-account.png";

    try {
      await mkdir(join(previousDir, "screenshots"), { recursive: true });
      await mkdir(join(currentDir, "screenshots"), { recursive: true });
      await writeFile(join(previousDir, previousPath), "before image");
      await writeFile(join(currentDir, currentPath), "after image");

      const report = await renderLocalDiffReport({
        previousDir,
        currentDir,
        previousAssetUrlPrefix: "previous",
        currentAssetUrlPrefix: "current",
      });

      assert.match(report, /1 screenshot change/);
      assert.match(
        report,
        /ACCOUNT-S001-line-25-the-user-opens-the-account\.png<\/code> <span aria-label="renamed to">→<\/span> <code>screenshots\/ACCOUNT-S001-line-26-the-user-opens-the-account\.png/,
      );
      assert.match(report, /class="image-comparison" data-image-comparison/);
      assert.match(
        report,
        /src="previous\/screenshots\/ACCOUNT-S001-line-25-the-user-opens-the-account\.png"/,
      );
      assert.match(
        report,
        /src="current\/screenshots\/ACCOUNT-S001-line-26-the-user-opens-the-account\.png"/,
      );
      assert.match(report, /aria-label="Compare before and after/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
