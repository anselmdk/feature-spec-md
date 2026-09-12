import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ftpConfig, runWithConcurrency } from "../src/githubActionFtp.js";

describe("GitHub Action FTP configuration", () => {
  const required = {
    "ftp-host": "ftp.example.test",
    "ftp-user": "user",
    "ftp-password": "password",
    "base-url": "https://reports.example.test",
    "build-number": "42",
  };

  it("uses bounded transfer defaults", () => {
    const config = ftpConfig(required);
    assert.equal(config.concurrency, 4);
    assert.equal(config.connectTimeoutSeconds, 15);
    assert.equal(config.maxTimeSeconds, 120);
  });

  it("accepts explicit transfer settings", () => {
    const config = ftpConfig({
      ...required,
      "ftp-concurrency": "8",
      "ftp-connect-timeout": "10",
      "ftp-max-time": "90",
    });

    assert.equal(config.concurrency, 8);
    assert.equal(config.connectTimeoutSeconds, 10);
    assert.equal(config.maxTimeSeconds, 90);
  });

  it("rejects invalid transfer settings", () => {
    assert.throws(
      () => ftpConfig({ ...required, "ftp-concurrency": "0" }),
      /FTP concurrency must be a positive integer/,
    );
    assert.throws(
      () => ftpConfig({ ...required, "ftp-concurrency": "17" }),
      /FTP concurrency must be at most 16/,
    );
    assert.throws(
      () => ftpConfig({ ...required, "ftp-max-time": "fast" }),
      /FTP maximum transfer time must be a positive integer/,
    );
  });

  it("limits concurrent work to the configured pool size", async () => {
    let active = 0;
    let maximumActive = 0;
    const completed: number[] = [];

    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed.push(item);
      active -= 1;
    });

    assert.equal(maximumActive, 2);
    assert.deepEqual(completed.sort(), [1, 2, 3, 4, 5]);
  });
});
