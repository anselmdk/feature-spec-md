import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  FeatureSpecMdConfiguration,
  ReportLayer,
  SpecDocument,
  ValidationIssue,
} from "./types.js";

export async function loadProjectConfiguration(
  cwd = process.cwd(),
): Promise<FeatureSpecMdConfiguration> {
  const packagePath = path.join(cwd, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    featureSpecMd?: unknown;
  };
  return normalizeProjectConfiguration(packageJson.featureSpecMd);
}

export function normalizeProjectConfiguration(
  value: unknown,
): FeatureSpecMdConfiguration {
  if (value === undefined) return {};
  if (!isRecord(value))
    throw new Error("package.json featureSpecMd must be an object.");
  const report = value.report;
  if (report === undefined) return {};
  if (!isRecord(report))
    throw new Error("package.json featureSpecMd.report must be an object.");

  const layers = report.layers;
  if (layers !== undefined && !Array.isArray(layers))
    throw new Error("featureSpecMd.report.layers must be an array.");

  return {
    report: {
      layers: layers?.map(normalizeLayer),
      layersDefaultOpen: optionalBoolean(
        report.layersDefaultOpen,
        "featureSpecMd.report.layersDefaultOpen",
      ),
      documentsDefaultOpen: optionalBoolean(
        report.documentsDefaultOpen,
        "featureSpecMd.report.documentsDefaultOpen",
      ),
    },
  };
}

export function validateDocumentLayers(
  documents: SpecDocument[],
  layers: ReportLayer[] = [],
): ValidationIssue[] {
  if (!layers.length) return [];
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const layer of layers) {
    if (!/^[a-z][a-z0-9-]*$/.test(layer.id)) {
      issues.push({
        code: "invalid-report-layer-id",
        severity: "error",
        message: `Report layer id "${layer.id}" must use lowercase words separated by hyphens.`,
      });
    }
    if (seen.has(layer.id)) {
      issues.push({
        code: "duplicate-report-layer-id",
        severity: "error",
        message: `Report layer id "${layer.id}" is configured more than once.`,
      });
    }
    seen.add(layer.id);
  }

  for (const document of documents) {
    const layer = document.frontmatter.layer;
    if (!layer) {
      issues.push({
        code: "missing-report-layer",
        severity: "warning",
        message: `Spec "${document.frontmatter.id}" has no report layer and will appear under Other.`,
        filePath: document.filePath,
      });
    } else if (!seen.has(layer)) {
      issues.push({
        code: "unknown-report-layer",
        severity: "error",
        message: `Spec "${document.frontmatter.id}" references unknown report layer "${layer}".`,
        filePath: document.filePath,
      });
    }
  }
  return issues;
}

function normalizeLayer(value: unknown, index: number): ReportLayer {
  if (!isRecord(value))
    throw new Error(`featureSpecMd.report.layers[${index}] must be an object.`);
  if (typeof value.id !== "string" || !value.id.trim())
    throw new Error(`featureSpecMd.report.layers[${index}].id is required.`);
  if (typeof value.title !== "string" || !value.title.trim())
    throw new Error(`featureSpecMd.report.layers[${index}].title is required.`);
  if (value.description !== undefined && typeof value.description !== "string")
    throw new Error(
      `featureSpecMd.report.layers[${index}].description must be a string.`,
    );
  return {
    id: value.id.trim(),
    title: value.title.trim(),
    description: value.description?.trim(),
  };
}

function optionalBoolean(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${name} must be boolean.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
