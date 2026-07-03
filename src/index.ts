/**
 * Public package entry point that re-exports the CLI-facing library API for
 * parsing specs, checking coverage, rendering reports, and working with types.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export { expandFilePatterns } from "./filePatterns.js";
export {
  buildCoverageSummary,
  checkFeatureSpecs,
  collectTestReferences,
  loadFeatureSpecs,
  parseFeatureSpec,
  parseTestReferences,
  validateCoverage,
  validateFeatureSpec,
} from "./featureSpecs.js";
export {
  renderLocalDiffReport,
} from "./githubActionDiffReport.js";
export {
  loadMockReportData,
  renderMockDiffReport,
  renderMockFeatureSpecReport,
  writeMockReports,
} from "./mockReports.js";
export { renderHtmlReport } from "./reportTemplate.js";
export {
  insertReportMetadata,
  renderReportMetadata,
} from "./reportMetadata.js";
export {
  collectSpecScreenshots,
  validateScenarioScreenshots,
} from "./screenshots.js";
export {
  buildSpecCoverageSummary,
  checkSpecDocuments,
  collectSpecTestReferences,
  loadSpecDocuments,
  parseDesignSpec,
  parseModelSpec,
  parseSpecDocument,
  parseSpecTestReferences,
  parseStackSpec,
  validateDesignSpec,
  validateModelSpec,
  validateSpecDocument,
  validateSpecGraph,
  validateStackSpec,
} from "./specDocuments.js";
export type {
  LocalDiffReportOptions,
} from "./githubActionDiffReport.js";
export type {
  MockReportData,
  MockReportVariant,
  WriteMockReportsOptions,
} from "./mockReports.js";
export type {
  ReportMetadataItem,
} from "./reportMetadata.js";
export type {
  CoverageItem,
  CoverageSummary,
  DesignFrontmatter,
  DesignSpec,
  FeatureFrontmatter,
  FeatureRule,
  FeatureScenario,
  FeatureSpec,
  FeatureStep,
  ModelItem,
  ModelReferenceFrontmatter,
  ModelSpec,
  RuleKeyword,
  ScenarioEvidencePolicy,
  ScenarioTestType,
  ScreenshotPolicy,
  SpecDocument,
  SpecFrontmatter,
  SpecScreenshot,
  StackSpec,
  StepKeyword,
  TestReference,
  ValidationIssue,
} from "./types.js";

/** Write text content to a path, creating the parent directory when needed. */
export async function writeTextFile(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}
