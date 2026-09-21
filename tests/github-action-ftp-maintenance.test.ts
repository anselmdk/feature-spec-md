import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  batches,
  cleanupCandidates,
  concurrencyLimiter,
  ftpDeleteCommand,
  groupFtpPathsByParent,
  maintenanceInventoryRoots,
  parseFtpHeadSize,
  parseFtpSizeResponse,
  parseMaintenanceListingNames,
  selectMaintenanceNames,
  selectExpiredBuildBatch,
} from "../src/githubActionFtpMaintenance.js";

describe("FTP maintenance helpers", () => {
  it("parses common FTP size responses", () => {
    assert.equal(parseFtpSizeResponse("213 1048576\n"), 1048576);
    assert.equal(parseFtpSizeResponse("213    42\r\n"), 42);
    assert.equal(parseFtpSizeResponse("550 Not supported\n"), undefined);
    assert.equal(parseFtpHeadSize("Size: 2048\n"), 2048);
  });

  it("normalizes FTP listings that return paths instead of basenames", () => {
    assert.deepEqual(
      parseMaintenanceListingNames(
        "booking.specs.title.dk/build/538/index.html\n" +
          "booking.specs.title.dk/build/538/__feature-spec-md/\n",
      ),
      ["index.html", "__feature-spec-md"],
    );
  });

  it("scopes cleanup planning to builds and explicitly requested roots", () => {
    assert.deepEqual(
      maintenanceInventoryRoots("report", ["pr/145"]),
      undefined,
    );
    assert.deepEqual(
      maintenanceInventoryRoots("dry-run", ["pr/145", "build/532"]),
      ["build", "pr"],
    );
    assert.deepEqual(maintenanceInventoryRoots("cleanup", []), ["build", "pr"]);
  });

  it("removes full and pull-request report directories for expired builds", () => {
    assert.deepEqual(
      cleanupCandidates(
        [
          { path: "reports/build/101", kind: "directory", sizeBytes: 0 },
          { path: "reports/build/100", kind: "directory", sizeBytes: 0 },
          { path: "reports/build/99", kind: "directory", sizeBytes: 0 },
          { path: "reports/pr/7/101", kind: "directory", sizeBytes: 0 },
          { path: "reports/pr/7/99", kind: "directory", sizeBytes: 0 },
          { path: "reports/pr/8/99", kind: "directory", sizeBytes: 0 },
        ],
        "/reports",
        2,
        [],
      ),
      ["reports/build/99", "reports/pr/7/99", "reports/pr/8/99"],
    );
  });

  it("limits retention cleanup to the next batch of expired build directories", () => {
    assert.deepEqual(
      selectExpiredBuildBatch(
        ["109", "103", "108", "102", "107", "106", "105", "104", "101"],
        3,
        4,
      ),
      ["106", "105", "104", "103"],
    );
  });

  it("deletes basenames after curl changes into their parent directory", () => {
    assert.equal(
      ftpDeleteCommand("/booking.specs.title.dk/build/532/index.html", "file"),
      "+DELE index.html",
    );
    assert.equal(
      ftpDeleteCommand("booking.specs.title.dk/build/532", "directory"),
      "+RMD 532",
    );
  });

  it("groups FTP deletion commands into bounded sessions", () => {
    assert.deepEqual(batches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });

  it("groups exact cleanup verification by shallow parent listing", () => {
    assert.deepEqual(
      groupFtpPathsByParent([
        "reports/build/101",
        "reports/build/100",
        "reports/pr/7/101",
      ]),
      [
        {
          parent: "reports/build",
          items: [
            { name: "101", path: "reports/build/101" },
            { name: "100", path: "reports/build/100" },
          ],
        },
        {
          parent: "reports/pr/7",
          items: [{ name: "101", path: "reports/pr/7/101" }],
        },
      ],
    );
  });

  it("shares one concurrency limit across recursive FTP work", async () => {
    const runLimited = concurrencyLimiter(2);
    let active = 0;
    let maximum = 0;
    await Promise.all(
      Array.from({ length: 8 }, () =>
        runLimited(async () => {
          active += 1;
          maximum = Math.max(maximum, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
        }),
      ),
    );
    assert.equal(maximum, 2);
  });

  it("includes explicitly requested builds outside a bounded newest-build scan", () => {
    assert.deepEqual(
      selectMaintenanceNames(
        ["531", "532", "533", "534"],
        "booking.specs.title.dk/build",
        "booking.specs.title.dk",
        2,
        ["build/532"],
      ),
      ["534", "533", "532"],
    );
    assert.deepEqual(
      selectMaintenanceNames(
        ["533", "534"],
        "booking.specs.title.dk/build",
        "booking.specs.title.dk",
        2,
        ["build/532"],
      ),
      ["534", "533"],
    );
  });

  it("limits bounded explicit cleanup to the requested pull-request tree", () => {
    assert.deepEqual(
      selectMaintenanceNames(
        ["144", "145", "146"],
        "booking.specs.title.dk/pr",
        "booking.specs.title.dk",
        undefined,
        ["build/532", "pr/145"],
        true,
      ),
      ["145"],
    );
    assert.deepEqual(
      selectMaintenanceNames(
        ["531", "532", "533"],
        "booking.specs.title.dk/pr/145",
        "booking.specs.title.dk",
        undefined,
        ["build/532", "pr/145"],
        true,
      ),
      ["531", "532", "533"],
    );
  });

  it("defines the bounded smoke-test workflow mode", async () => {
    const workflow = await readFile(
      ".github/workflows/consuming-project-feature-spec-ftp-maintenance.yml",
      "utf8",
    );
    assert.match(workflow, /smoke-test, report, dry-run, or cleanup/);
    assert.match(workflow, /--ftp-maintenance-max-time "10"/);
    assert.match(workflow, /max-builds-to-scan:/);
    assert.match(workflow, /max-builds-to-delete:/);
    assert.match(workflow, /default: "10"/);
    assert.match(
      workflow,
      /Maximum expired build directories removed by one retention cleanup run/,
    );
    assert.match(workflow, /timeout-minutes: 15/);
  });

  it("exposes configurable report retention and cleanup comment reconciliation", async () => {
    const workflow = await readFile(
      ".github/workflows/consuming-project-feature-spec-ftp-maintenance.yml",
      "utf8",
    );
    assert.match(workflow, /default: "100"/);
    assert.match(workflow, /ftp-cleanup-paths/);
    assert.match(workflow, /deleted by cleanup job/);
    assert.match(workflow, /pr-number:/);
    assert.match(workflow, /paths\.add\(`pr\/\$\{prNumber\}`\)/);
    assert.match(workflow, /const prReport = url\.match/);
    assert.match(workflow, /const alreadyStruck =/);
    assert.match(workflow, /~~~~/);
    assert.match(workflow, /deletedPullRequests\.size/);
    assert.match(workflow, /deletedPullRequestReports/);
    assert.match(workflow, /const affectedPullRequests =/);
    assert.doesNotMatch(workflow, /github\.rest\.pulls\.list/);
  });

  it("uses the consuming project's supported Node.js version", async () => {
    const workflow = await readFile(
      ".github/workflows/consuming-project-feature-spec-ftp-maintenance.yml",
      "utf8",
    );
    assert.match(workflow, /node-version:[\s\S]*?default: "24"/);
    assert.match(workflow, /node-version: \$\{\{ inputs\.node-version \}\}/);
  });

  it("makes PR comment history retention configurable", async () => {
    const workflow = await readFile(
      ".github/workflows/consuming-project-feature-spec-pr-diff-report.yml",
      "utf8",
    );
    assert.match(workflow, /report-history-limit:/);
    assert.match(workflow, /slice\(0, historyLimit\)/);
  });
});
