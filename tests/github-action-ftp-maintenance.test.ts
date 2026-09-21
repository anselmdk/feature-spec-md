import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  cleanupCandidates,
  ftpDeleteCommand,
  maintenanceInventoryRoots,
  parseFtpHeadSize,
  parseFtpSizeResponse,
  parseMaintenanceListingNames,
  selectMaintenanceNames,
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

  it("deletes normalized absolute paths from the FTP login root", () => {
    assert.equal(
      ftpDeleteCommand("/booking.specs.title.dk/build/532/index.html", "file"),
      "DELE /booking.specs.title.dk/build/532/index.html",
    );
    assert.equal(
      ftpDeleteCommand("booking.specs.title.dk/build/532", "directory"),
      "RMD /booking.specs.title.dk/build/532",
    );
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
    assert.match(workflow, /cleanup additionally requires explicit paths/);
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
