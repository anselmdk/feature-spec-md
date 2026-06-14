import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.playwright.ts",
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
  },
});
