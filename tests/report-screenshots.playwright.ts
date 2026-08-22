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
          changed: true,
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

  await page.locator("details.scenario > summary").click();

  await expect(
    page.getByText("Given a returning person is on the access page"),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "ACCOUNT-S001 screenshot" }),
  ).toBeVisible();

  await page.getByRole("img", { name: "ACCOUNT-S001 screenshot" }).click();
  await expect(page.locator("dialog.image-lightbox")).toBeVisible();
  await expect(page.locator(".lightbox-viewport img")).toHaveCSS(
    "max-width",
    "none",
  );
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("dialog.image-lightbox")).not.toBeVisible();

  const originalTheme = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    originalTheme === "dark" ? "light" : "dark",
  );
});

test("layered reports start collapsed and open ancestors for deep links", async ({
  page,
}) => {
  const spec = parseFeatureSpec(
    `---
id: ACCOUNT
title: Account access
status: draft
layer: capability
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

  await page.setContent(
    renderHtmlReport([spec], {
      layers: [
        {
          id: "capability",
          title: "Capabilities",
          description: "Authoritative behavior",
        },
      ],
      layersDefaultOpen: false,
      documentsDefaultOpen: false,
    }),
  );

  await expect(
    page.getByRole("heading", { name: "Capabilities" }),
  ).toBeVisible();
  const navigator = page.getByRole("navigation", { name: "Report navigation" });
  await expect(navigator).toBeVisible();
  await expect(navigator.locator("[data-navigator-current]")).toHaveText(
    "Capabilities",
  );
  await expect(
    page.getByRole("heading", { name: "Account access" }),
  ).not.toBeVisible();
  await page.locator("details.layer-section > summary").click();
  await expect(
    page.getByRole("heading", { name: "Account access" }),
  ).toBeVisible();
  await expect(
    page.getByText("People can access their account."),
  ).not.toBeVisible();

  await navigator.locator("[data-navigator-trigger]").click();
  await navigator.getByRole("link", { name: "Account access" }).click();
  await expect(page).toHaveURL(/#account$/);
  await expect(page.locator("details#account")).not.toHaveAttribute("open", "");
  await expect(navigator.locator("[data-navigator-current]")).toHaveText(
    "Account access",
  );
  await navigator.locator("[data-navigator-trigger]").click();
  await navigator.getByRole("button", { name: "Expand current" }).click();
  await expect(page.locator("details#account")).toHaveAttribute("open", "");

  await page.evaluate('window.location.hash = "account-s001"');
  await expect(page.locator("details#account")).toHaveAttribute("open", "");
  await expect(page.locator("details#account-s001")).toHaveAttribute(
    "open",
    "",
  );
  await expect(
    page.getByText("People can access their account."),
  ).toBeVisible();
});
