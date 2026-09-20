import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  ftpDeleteCommand,
  maintenanceInventoryRoots,
  parseFtpHeadSize,
  parseFtpSizeResponse,
} from "../src/githubActionFtpMaintenance.js";

describe("FTP maintenance helpers", () => {
  it("parses common FTP size responses", () => {
    assert.equal(parseFtpSizeResponse("213 1048576\n"), 1048576);
    assert.equal(parseFtpSizeResponse("213    42\r\n"), 42);
    assert.equal(parseFtpSizeResponse("550 Not supported\n"), undefined);
    assert.equal(parseFtpHeadSize("Size: 2048\n"), 2048);
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
    assert.deepEqual(maintenanceInventoryRoots("cleanup", []), ["build"]);
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
    assert.match(workflow, /default: "30"/);
    assert.match(workflow, /ftp-cleanup-paths/);
    assert.match(workflow, /deleted by cleanup job/);
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
