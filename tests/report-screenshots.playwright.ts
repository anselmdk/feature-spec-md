import { expect, test } from "@playwright/test";
import { parseFeatureSpec, renderHtmlReport } from "../src/index.js";

const transparentPixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

test("report screenshots are hidden until the scenario is toggled", async ({
  page,
}) => {
  const spec = parseFeatureSpec(
    `---
id: ACCOUNT
title: Account access
status: draft
---

# Account access

## Purpose

People can access their account.

## Rules

- ACCOUNT-R001: A person MUST complete the access flow.

## Scenarios

### ACCOUNT-S001: Returning person completes access flow

Given a returning person is on the access page
When they complete the access flow
Then account access is granted
`,
    { filePath: "specs/account.feature.md" },
  );

  const firstStep = spec.scenarios[0]?.steps[0];
  expect(firstStep).toBeDefined();

  await page.setContent(
    renderHtmlReport([spec], {
      generatedAt: "2026-06-14T00:00:00.000Z",
      screenshots: [
        {
          specPath: spec.filePath,
          line: firstStep!.line,
          path: transparentPixel,
          title: "ACCOUNT-S001 screenshot",
        },
      ],
    }),
  );

  await expect(
    page.getByRole("heading", { name: "Account access" }),
  ).toBeVisible();
  await expect(
    page.getByText("Given a returning person is on the access page"),
  ).not.toBeVisible();
  await expect(
    page.getByRole("img", { name: "ACCOUNT-S001 screenshot" }),
  ).not.toBeVisible();

  await page.locator("summary").click();

  await expect(
    page.getByText("Given a returning person is on the access page"),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "ACCOUNT-S001 screenshot" }),
  ).toBeVisible();
});
