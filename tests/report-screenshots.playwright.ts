import { expect, test } from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderLocalDiffReport } from "../src/githubActionDiffReport.js";
import { parseFeatureSpec, renderHtmlReport } from "../src/index.js";

const transparentPixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

test("renamed screenshots use an interactive before and after slider", async ({
  page,
}) => {
  const root = await mkdtemp(join(tmpdir(), "feature-spec-md-slider-test-"));
  const previousDir = join(root, "previous");
  const currentDir = join(root, "current");
  const previousPath = "screenshots/ACCOUNT-S001-line-25-account.png";
  const currentPath = "screenshots/ACCOUNT-S001-line-26-account.png";

  try {
    await mkdir(join(previousDir, "screenshots"), { recursive: true });
    await mkdir(join(currentDir, "screenshots"), { recursive: true });
    const pixel = Buffer.from(transparentPixel.split(",")[1] ?? "", "base64");
    await writeFile(join(previousDir, previousPath), pixel);
    await writeFile(join(currentDir, currentPath), pixel);
    await page.setContent(
      await renderLocalDiffReport({ previousDir, currentDir }),
    );

    await page.getByRole("button", { name: "Show all screenshots" }).click();
    const comparison = page.locator("[data-image-comparison]");
    const slider = comparison.getByRole("slider");
    await expect(comparison).toBeVisible();
    await expect(slider).toHaveValue("50");
    await slider.fill("80");
    await expect(comparison).toHaveAttribute("style", /--position: 80%/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
  const themeToggle = page.getByRole("button", { name: "Toggle dark mode" });
  await expect(themeToggle).toHaveText(originalTheme === "dark" ? "☀" : "☾");
  const themeToggleBox = await themeToggle.boundingBox();
  expect(themeToggleBox?.x).toBeLessThan(20);
  expect(themeToggleBox?.y).toBeGreaterThan(650);
  await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    originalTheme === "dark" ? "light" : "dark",
  );
  await expect(themeToggle).toHaveText(originalTheme === "dark" ? "☾" : "☀");
});

test("navigator toggles layers, documents, and scenarios", async ({ page }) => {
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
  await navigator.locator("[data-navigator-trigger]").click();
  const layerButton = navigator.locator(
    '[data-navigator-target="layer-capability"]',
  );
  await expect(layerButton).toHaveAttribute("aria-pressed", "false");
  await layerButton.click();
  await expect(page.locator("details#layer-capability")).toHaveAttribute(
    "open",
    "",
  );
  await expect(layerButton).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Account access" }),
  ).toBeVisible();
  await expect(
    page.getByText("People can access their account."),
  ).not.toBeVisible();

  await navigator.locator("[data-navigator-trigger]").click();
  const documentButton = navigator.locator('[data-navigator-target="account"]');
  await expect(documentButton).toHaveAttribute("aria-pressed", "false");
  await documentButton.click();
  await expect(page).toHaveURL(/#account$/);
  await expect(page.locator("details#account")).toHaveAttribute("open", "");
  await expect(documentButton).toHaveAttribute("aria-pressed", "true");
  await expect(navigator.locator("[data-navigator-current]")).toHaveText(
    "Account access",
  );
  await navigator.locator("[data-navigator-trigger]").click();
  await documentButton.click();
  await expect(page.locator("details#account")).not.toHaveAttribute("open", "");
  await expect(documentButton).toHaveAttribute("aria-pressed", "false");

  await navigator.locator("[data-navigator-trigger]").click();
  const scenariosButton = navigator.getByRole("button", {
    name: "Toggle scenarios for Account access",
  });
  await expect(scenariosButton).toHaveAttribute("aria-pressed", "false");
  await scenariosButton.click();
  await expect(page.locator("details#account")).toHaveAttribute("open", "");
  await expect(page.locator("details#account-s001")).toHaveAttribute(
    "open",
    "",
  );
  await expect(scenariosButton).toHaveAttribute("aria-pressed", "true");
  await scenariosButton.click();
  await expect(page.locator("details#account-s001")).not.toHaveAttribute(
    "open",
    "",
  );

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
