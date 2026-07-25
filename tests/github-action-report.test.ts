import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  featureReportUrls,
  latestReportUrl,
} from "../src/githubActionReport.js";

describe("GitHub Action report publishing", () => {
  it("provides immutable and stable latest report URLs", () => {
    assert.deepEqual(
      featureReportUrls("https://specs.example.test/project/", "42"),
      {
        reportUrl: "https://specs.example.test/project/build/42",
        latestReportUrl: "https://specs.example.test/project/latest",
      },
    );
    assert.equal(
      latestReportUrl("https://specs.example.test/project"),
      "https://specs.example.test/project/latest",
    );
  });
});
