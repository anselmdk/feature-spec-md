import { readFile } from "node:fs/promises";
import { expandArtifactPatterns } from "./filePatterns.js";
import type { FeatureSpec, SpecScreenshot, ValidationIssue } from "./types.js";

export async function collectSpecScreenshots(patterns: string[]) {
  const evidence: SpecScreenshot[] = [];
  for (const file of await expandArtifactPatterns(patterns)) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    const entries = isRecord(parsed) && Array.isArray(parsed.evidence)
      ? parsed.evidence
      : isRecord(parsed) && Array.isArray(parsed.screenshots)
        ? parsed.screenshots
        : [];

    for (const entry of entries) {
      const normalized = normalizeEvidence(entry);
      if (normalized) evidence.push(normalized);
    }
  }
  return evidence;
}

export function validateScenarioScreenshots(
  specs: FeatureSpec[],
  evidence: SpecScreenshot[],
) {
  const evidenceKeys = new Set(
    evidence.map((entry) => screenshotKey(entry.specPath, entry.line)),
  );
  const issues: ValidationIssue[] = [];

  for (const spec of specs) {
    for (const scenario of spec.scenarios) {
      if (scenario.evidence.screenshots === "required") {
        for (const step of scenario.steps) {
          if (!evidenceKeys.has(screenshotKey(spec.filePath, step.line))) {
            issues.push({
              code: "missing-screenshot-evidence",
              severity: "error",
              filePath: spec.filePath,
              line: step.line,
              message: `Visual evidence is required for ${scenario.id} ${step.keyword} ${step.text}`,
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

function normalizeEvidence(value: unknown): SpecScreenshot | null {
  if (!isRecord(value)) return null;
  const specPath = value.specPath;
  const line = value.line;
  const changed = value.changed;
  const imagePath = value.path ?? value.imagePath;
  if (typeof specPath !== "string" || typeof line !== "number") return null;
  const changedValue = typeof changed === "boolean" ? changed : true;
  if (changedValue && typeof imagePath !== "string") return null;
  return {
    specPath: normalizeFilePath(specPath),
    line,
    changed: changedValue,
    path: typeof imagePath === "string" ? imagePath : undefined,
    title: typeof value.title === "string" ? value.title : undefined,
    testPath: typeof value.testPath === "string" ? value.testPath : undefined,
    comparedWithLine:
      typeof value.comparedWithLine === "number" ? value.comparedWithLine : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
