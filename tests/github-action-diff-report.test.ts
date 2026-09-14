import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PNG } from "pngjs";
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
      for (const directory of [previousDir, currentDir]) {
        await mkdir(join(directory, "__feature-spec-md"), {
          recursive: true,
        });
        await writeFile(
          join(directory, "__feature-spec-md", "account.feature.md"),
          "# Account access\n\n### ACCOUNT-S001: Administrator opens the account\n\nGiven an administrator opens the account view\n",
        );
      }
      await writeFile(
        join(previousDir, previousPath),
        PNG.sync.write(solidPng(390, 844)),
      );
      const current = solidPng(390, 844);
      for (let offset = 0; offset < current.data.length; offset += 4) {
        current.data[offset] = 255;
        current.data[offset + 3] = 255;
      }
      await writeFile(join(currentDir, currentPath), PNG.sync.write(current));

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
      assert.match(
        report,
        /class="image-comparison mobile-preview" data-image-comparison/,
      );
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

  it("ignores renamed PNGs with identical decoded pixels", async () => {
    const root = await mkdtemp(join(tmpdir(), "feature-spec-md-diff-test-"));
    const previousDir = join(root, "previous");
    const currentDir = join(root, "current");
    const previousPath = "screenshots/ACCOUNT-S001-line-25-account.png";
    const currentPath = "screenshots/ACCOUNT-S001-line-26-account.png";
    const image = solidPng(100, 100);

    try {
      await mkdir(join(previousDir, "screenshots"), { recursive: true });
      await mkdir(join(currentDir, "screenshots"), { recursive: true });
      await writeFile(
        join(previousDir, previousPath),
        PNG.sync.write(image, { deflateLevel: 1 }),
      );
      await writeFile(
        join(currentDir, currentPath),
        PNG.sync.write(image, { deflateLevel: 9 }),
      );

      const report = await renderLocalDiffReport({
        previousDir,
        currentDir,
      });

      assert.match(report, /0 screenshot changes/);
      assert.match(report, /No screenshot changes\./);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ignores byte-identical renamed images without decoding them", async () => {
    const root = await mkdtemp(join(tmpdir(), "feature-spec-md-diff-test-"));
    const previousDir = join(root, "previous");
    const currentDir = join(root, "current");
    const previousPath = "screenshots/ACCOUNT-S001-line-25-account.svg";
    const currentPath = "screenshots/ACCOUNT-S001-line-26-account.svg";
    const image = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';

    try {
      await mkdir(join(previousDir, "screenshots"), { recursive: true });
      await mkdir(join(currentDir, "screenshots"), { recursive: true });
      await writeFile(join(previousDir, previousPath), image);
      await writeFile(join(currentDir, currentPath), image);

      const report = await renderLocalDiffReport({
        previousDir,
        currentDir,
      });

      assert.match(report, /0 screenshot changes/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ignores same-path PNGs with identical decoded pixels", async () => {
    const root = await mkdtemp(join(tmpdir(), "feature-spec-md-diff-test-"));
    const previousDir = join(root, "previous");
    const currentDir = join(root, "current");
    const screenshotPath = "screenshots/ACCOUNT-S001-line-25-account.png";
    const image = solidPng(100, 100);

    try {
      await mkdir(join(previousDir, "screenshots"), { recursive: true });
      await mkdir(join(currentDir, "screenshots"), { recursive: true });
      await writeFile(
        join(previousDir, screenshotPath),
        PNG.sync.write(image, { deflateLevel: 1 }),
      );
      await writeFile(
        join(currentDir, screenshotPath),
        PNG.sync.write(image, { deflateLevel: 9 }),
      );

      const report = await renderLocalDiffReport({
        previousDir,
        currentDir,
      });

      assert.match(report, /0 screenshot changes/);
      assert.match(report, /No screenshot changes\./);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ignores renamed PNGs with only rasterisation noise", async () => {
    const root = await mkdtemp(join(tmpdir(), "feature-spec-md-diff-test-"));
    const previousDir = join(root, "previous");
    const currentDir = join(root, "current");
    const previousPath = "screenshots/ACCOUNT-S001-line-25-account.png";
    const currentPath = "screenshots/ACCOUNT-S001-line-26-account.png";
    const previous = solidPng(100, 100);
    const current = solidPng(100, 100);
    current.data[0] = 1;
    current.data[1] = 1;

    try {
      await mkdir(join(previousDir, "screenshots"), { recursive: true });
      await mkdir(join(currentDir, "screenshots"), { recursive: true });
      await writeFile(
        join(previousDir, previousPath),
        PNG.sync.write(previous),
      );
      await writeFile(join(currentDir, currentPath), PNG.sync.write(current));

      const report = await renderLocalDiffReport({ previousDir, currentDir });

      assert.match(report, /0 screenshot changes/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports a material screenshot difference", async () => {
    const root = await mkdtemp(join(tmpdir(), "feature-spec-md-diff-test-"));
    const previousDir = join(root, "previous");
    const currentDir = join(root, "current");
    const screenshotPath = "screenshots/ACCOUNT-S001-line-25-account.png";
    const previous = solidPng(100, 100);
    const current = solidPng(100, 100);
    current.data.fill(255, 0, current.data.length / 2);

    try {
      await mkdir(join(previousDir, "screenshots"), { recursive: true });
      await mkdir(join(currentDir, "screenshots"), { recursive: true });
      await writeFile(
        join(previousDir, screenshotPath),
        PNG.sync.write(previous),
      );
      await writeFile(
        join(currentDir, screenshotPath),
        PNG.sync.write(current),
      );

      const report = await renderLocalDiffReport({
        previousDir,
        currentDir,
      });

      assert.match(report, /1 screenshot change/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to byte comparison for malformed PNGs", async () => {
    const root = await mkdtemp(join(tmpdir(), "feature-spec-md-diff-test-"));
    const previousDir = join(root, "previous");
    const currentDir = join(root, "current");
    const screenshotPath = "screenshots/ACCOUNT-S001-line-25-account.png";

    try {
      await mkdir(join(previousDir, "screenshots"), { recursive: true });
      await mkdir(join(currentDir, "screenshots"), { recursive: true });
      await writeFile(join(previousDir, screenshotPath), "not a PNG before");
      await writeFile(join(currentDir, screenshotPath), "not a PNG after");

      const report = await renderLocalDiffReport({
        previousDir,
        currentDir,
      });

      assert.match(report, /1 screenshot change/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function solidPng(width: number, height: number) {
  const png = new PNG({ width, height });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = 0;
    png.data[offset + 1] = 0;
    png.data[offset + 2] = 0;
    png.data[offset + 3] = 255;
  }
  return png;
}
