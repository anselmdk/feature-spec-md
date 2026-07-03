/**
 * Screenshot evidence manifest loading and normalization for generated spec
 * implementation reports.
 */
import { readFile } from "node:fs/promises";
import { expandArtifactPatterns } from "./filePatterns.js";
import type { FeatureSpec, SpecScreenshot, ValidationIssue } from "./types.js";

/** Load screenshot evidence manifests and normalize entries for report rendering. */
export async function collectSpecScreenshots(patterns: string[]) {
  const screenshots: SpecScreenshot[] = [];
  for (const file of await expandArtifactPatterns(patterns)) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.screenshots)
        ? parsed.screenshots
        : [];

    for (const entry of entries) {
      const screenshot = normalizeScreenshot(entry);
      if (screenshot) screenshots.push(screenshot);
    }
  }
  return screenshots;
}

/** Validate screenshot evidence manifests against scenario policies. */
export function validateScenarioScreenshots(
  specs: FeatureSpec[],
  screenshots: SpecScreenshot[],
) {
  const screenshotKeys = new Set(
    screenshots.map((screenshot) => screenshotKey(screenshot.specPath, screenshot.line)),
  );
  const issues: ValidationIssue[] = [];

  for (const spec of specs) {
    for (const scenario of spec.scenarios) {
      if (scenario.evidence.screenshots === "required") {
        for (const step of scenario.steps) {
          if (!screenshotKeys.has(screenshotKey(spec.filePath, step.line))) {
            issues.push({
              code: "missing-screenshot-evidence",
              severity: "error",
              filePath: spec.filePath,
              line: step.line,
              message: `Screenshot evidence is required for ${scenario.id} ${step.keyword} ${step.text}`,
            });
          }
        }
      }
    }
  }

  return issues;
}

export function screenshotKey(filePath: string, line: number) {
  return `${normalizeFilePath(filePath)}:${line}`;
}

export function normalizeFilePath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeScreenshot(value: unknown): SpecScreenshot | null {
  if (!isRecord(value)) return null;
  const specPath = value.specPath;
  const line = value.line;
  const imagePath = value.path ?? value.imagePath;
  if (
    typeof specPath !== "string" ||
    typeof line !== "number" ||
    typeof imagePath !== "string"
  ) {
    return null;
  }
  return {
    specPath: normalizeFilePath(specPath),
    line,
    path: imagePath,
    title: typeof value.title === "string" ? value.title : undefined,
    testPath: typeof value.testPath === "string" ? value.testPath : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
