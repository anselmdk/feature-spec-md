import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
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

  it("defines the bounded smoke-test workflow mode", async () => {
    const workflow = await readFile(
      ".github/workflows/consuming-project-feature-spec-ftp-maintenance.yml",
      "utf8",
    );
    assert.match(workflow, /smoke-test, report, dry-run, or cleanup/);
    assert.match(workflow, /--ftp-maintenance-max-time "10"/);
  });
});
