import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFtpSizeResponse } from "../src/githubActionFtpMaintenance.js";

describe("FTP maintenance helpers", () => {
  it("parses common FTP size responses", () => {
    assert.equal(parseFtpSizeResponse("213 1048576\n"), 1048576);
    assert.equal(parseFtpSizeResponse("213    42\r\n"), 42);
    assert.equal(parseFtpSizeResponse("550 Not supported\n"), undefined);
  });
});
