import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderLocalDiffReport } from "./githubActionDiffReport.js";
import { publishedSpecRoot } from "./reportArtifacts.js";
import { collectSpecScreenshots } from "./screenshots.js";
import { checkSpecDocuments } from "./specDocuments.js";
import { insertReportMetadata, type ReportMetadataItem } from "./reportMetadata.js";
import { renderHtmlReport } from "./reportTemplate.js";
import type {
  CoverageItem,
  CoverageSummary,
  DesignSpec,
  FeatureSpec,
  ModelSpec,
  SpecDocument,
  SpecScreenshot,
  StackSpec,
  TestReference,
} from "./types.js";

export type MockReportVariant = "current" | "previous";

export type MockReportData = Awaited<ReturnType<typeof loadMockReportData>>;

export type WriteMockReportsOptions = {
  outDir?: string;
  generatedAt?: string;
};

const defaultGeneratedAt = "2026-01-15T12:30:00.000Z";

export async function loadMockReportData(variant: MockReportVariant = "current") {
  const fixturesRoot = await mockFixturesRoot();
  const variantRoot = path.join(fixturesRoot, variant);
  const result = await checkSpecDocuments({
    specs: [
      path.join(variantRoot, "specs/**/*.model.md"),
      path.join(variantRoot, "specs/**/*.feature.md"),
      path.join(variantRoot, "specs/**/*.stack.md"),
      path.join(variantRoot, "specs/**/*.design.md"),
    ],
    tests: [path.join(variantRoot, "tests/**/*.ts")],
    requireModelCoverage: false,
    requireRuleCoverage: false,
    requireScenarioCoverage: false,
  });
  const screenshots = normalizeMockScreenshots(
    await collectSpecScreenshots([path.join(variantRoot, "screenshots/screenshots.json")]),
    fixturesRoot,
    variantRoot,
  );

  return {
    title: "Feature Spec Report for mock-support-desk",
    fixturesRoot,
    variantRoot,
    documents: normalizeMockDocuments(result.documents, variantRoot),
    models: normalizeMockDocuments(result.models, variantRoot),
    features: normalizeMockDocuments(result.features, variantRoot),
    stacks: normalizeMockDocuments(result.stacks, variantRoot),
    designs: normalizeMockDocuments(result.designs, variantRoot),
    coverage: normalizeMockCoverage(result.coverage, variantRoot),
    screenshots,
    validationIssues: [...result.validationIssues, ...result.coverageIssues].map((issue) => ({
      ...issue,
      filePath: issue.filePath ? normalizeMockSourcePath(issue.filePath, variantRoot) : issue.filePath,
    })),
    metadata: mockMetadata(variant),
  };
}

export async function renderMockFeatureSpecReport(
  variant: MockReportVariant = "current",
  generatedAt = defaultGeneratedAt,
) {
  const data = await loadMockReportData(variant);
  return insertReportMetadata(
    renderHtmlReport(data.features, {
      title: data.title,
      models: data.models,
      stacks: data.stacks,
      designs: data.designs,
      coverage: data.coverage,
      screenshots: data.screenshots,
      validationIssues: data.validationIssues,
      generatedAt,
      githubBaseUrl: "https://github.com/anselmdk/feature-spec-md",
      githubRef: variant === "current" ? "abc1234" : "def5678",
      repositoryUrl: "https://github.com/anselmdk/feature-spec-md",
    }),
    data.metadata,
  );
}

export async function renderMockDiffReport(generatedAt = defaultGeneratedAt) {
  const tempRoot = path.join(
    tmpdir(),
    `feature-spec-md-mock-diff-${process.pid}-${Date.now()}`,
  );
  const previousDir = path.join(tempRoot, "previous");
  const currentDir = path.join(tempRoot, "current");

  await writeFeatureReportDirectory(previousDir, "previous", generatedAt);
  await writeFeatureReportDirectory(currentDir, "current", generatedAt);

  return renderLocalDiffReport({
    previousDir,
    currentDir,
    prNumber: "42",
    baseBuild: "127",
    currentBuild: "128",
    baseBuildUrl: "previous/",
    currentBuildUrl: "current/",
    previousAssetUrlPrefix: "previous",
    currentAssetUrlPrefix: "current",
  });
}

export async function writeMockReports(options: WriteMockReportsOptions = {}) {
  const outDir = options.outDir ?? "test-results/mock-reports";
  const generatedAt = options.generatedAt ?? defaultGeneratedAt;
  const featureDir = path.join(outDir, "feature-spec-report");
  const previousFeatureDir = path.join(outDir, "previous-feature-spec-report");
  const diffDir = path.join(outDir, "diff-report");

  await writeFeatureReportDirectory(featureDir, "current", generatedAt);
  await writeFeatureReportDirectory(previousFeatureDir, "previous", generatedAt);
  await copyDirectory(previousFeatureDir, path.join(diffDir, "previous"));
  await copyDirectory(featureDir, path.join(diffDir, "current"));
  await writeTextFile(
    path.join(diffDir, "index.html"),
    await renderLocalDiffReport({
      previousDir: previousFeatureDir,
      currentDir: featureDir,
      prNumber: "42",
      baseBuild: "127",
      currentBuild: "128",
      baseBuildUrl: "../previous-feature-spec-report/",
      currentBuildUrl: "../feature-spec-report/",
      previousAssetUrlPrefix: "previous",
      currentAssetUrlPrefix: "current",
    }),
  );

  return {
    featureReportPath: path.join(featureDir, "index.html"),
    previousFeatureReportPath: path.join(previousFeatureDir, "index.html"),
    diffReportPath: path.join(diffDir, "index.html"),
  };
}

async function writeFeatureReportDirectory(
  reportDir: string,
  variant: MockReportVariant,
  generatedAt: string,
) {
  const fixturesRoot = await mockFixturesRoot();
  const variantRoot = path.join(fixturesRoot, variant);
  await writeTextFile(
    path.join(reportDir, "index.html"),
    await renderMockFeatureSpecReport(variant, generatedAt),
  );
  await copyDirectory(
    path.join(fixturesRoot, variant, "screenshots"),
    path.join(reportDir, "screenshots"),
    (filePath) => filePath.endsWith(".svg"),
  );
  await writeMockFeatureSpecSourceArtifacts(reportDir, variantRoot, generatedAt);
}

async function writeMockFeatureSpecSourceArtifacts(
  reportDir: string,
  variantRoot: string,
  generatedAt: string,
) {
  const sourceRoot = path.join(variantRoot, "specs");
  const publishedRoot = path.join(reportDir, publishedSpecRoot, "specs");
  await copyDirectory(sourceRoot, publishedRoot, (filePath) =>
    filePath.endsWith(".feature.md"),
  );

  const files = await listFilesRecursive(sourceRoot, (filePath) =>
    filePath.endsWith(".feature.md"),
  );
  const features = files.map((filePath) => {
    const relativePath = path.relative(variantRoot, filePath).split("\\").join("/");
    return {
      filePath: relativePath,
      publishedPath: `${publishedSpecRoot}/${relativePath}`,
    };
  });

  await writeTextFile(
    path.join(reportDir, "__feature-spec-md", "manifest.json"),
    JSON.stringify({ generatedAt, features }, null, 2),
  );
}

function mockMetadata(variant: MockReportVariant): ReportMetadataItem[] {
  const isCurrent = variant === "current";
  return [
    {
      label: "Branch",
      value: isCurrent ? "feature/mock-report-ui" : "main",
      url: `https://github.com/anselmdk/feature-spec-md/tree/${isCurrent ? "feature/mock-report-ui" : "main"}`,
    },
    {
      label: "Build",
      value: isCurrent ? "128" : "127",
      url: `https://github.com/anselmdk/feature-spec-md/actions/runs/${isCurrent ? "128" : "127"}`,
    },
    {
      label: "Commit",
      value: isCurrent ? "abc1234" : "def5678",
      url: `https://github.com/anselmdk/feature-spec-md/commit/${isCurrent ? "abc1234" : "def5678"}`,
    },
    {
      label: "Pull request",
      value: "#42",
      url: "https://github.com/anselmdk/feature-spec-md/pull/42",
    },
  ];
}

async function mockFixturesRoot() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, "mocks"),
    path.join(moduleDir, "..", "src", "mocks"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  throw new Error(
    `Could not find mock report fixtures. Tried: ${candidates.join(", ")}`,
  );
}

function normalizeMockDocuments<T extends SpecDocument | FeatureSpec | ModelSpec | StackSpec | DesignSpec>(
  documents: T[],
  variantRoot: string,
): T[] {
  return documents.map((document) => ({
    ...document,
    filePath: normalizeMockSourcePath(document.filePath, variantRoot),
  }));
}

function normalizeMockCoverage(
  coverage: CoverageSummary | undefined,
  variantRoot: string,
): CoverageSummary | undefined {
  if (!coverage) return undefined;

  return {
    ...coverage,
    modelCoverage: coverage.modelCoverage
      ? normalizeMockCoverageItems(coverage.modelCoverage, variantRoot)
      : coverage.modelCoverage,
    ruleCoverage: normalizeMockCoverageItems(coverage.ruleCoverage, variantRoot),
    scenarioCoverage: normalizeMockCoverageItems(coverage.scenarioCoverage),
    orphanModelReferences: coverage.orphanModelReferences
      ? normalizeMockReferences(coverage.orphanModelReferences, variantRoot)
      : coverage.orphanModelReferences,
    orphanRuleReferences: normalizeMockReferences(coverage.orphanRuleReferences, variantRoot),
    orphanScenarioReferences: normalizeMockReferences(coverage.orphanScenarioReferences, variantRoot),
  };
}

function normalizeMockCoverageItems<T extends CoverageItem>(
  items: T[],
  variantRoot: string,
): T[] {
  return items.map((item) => ({
    ...item,
    filePath: item.filePath ? normalizeMockSourcePath(item.filePath, variantRoot) : item.filePath,
    references: normalizeMockReferences(item.references, variantRoot),
  }));
}

function normalizeMockReferences(
  references: TestReference[],
  variantRoot: string,
): TestReference[] {
  return references.map((reference) => ({
    ...reference,
    filePath: normalizeMockSourcePath(reference.filePath, variantRoot),
  }));
}

function normalizeMockScreenshots(
  screenshots: SpecScreenshot[],
  fixturesRoot: string,
  variantRoot: string,
): SpecScreenshot[] {
  return screenshots.map((screenshot) => ({
    ...screenshot,
    specPath: normalizeMockSourcePath(
      path.isAbsolute(screenshot.specPath)
        ? screenshot.specPath
        : path.join(fixturesRoot, screenshot.specPath.replace(/^src\/mocks\//, "")),
      variantRoot,
    ),
    testPath: screenshot.testPath
      ? normalizeMockSourcePath(screenshot.testPath, variantRoot)
      : screenshot.testPath,
  }));
}

function normalizeMockSourcePath(filePath: string, variantRoot: string) {
  const relativePath = path.relative(variantRoot, filePath).split("\\").join("/");
  if (relativePath && !relativePath.startsWith("../") && relativePath !== "..") {
    return relativePath;
  }

  return filePath
    .split("\\")
    .join("/")
    .replace(/^\.\//, "")
    .replace(/^src\/mocks\/(?:current|previous)\//, "")
    .replace(/^.*\/src\/mocks\/(?:current|previous)\//, "")
    .replace(/^.*\/mocks\/(?:current|previous)\//, "");
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(
  source: string,
  target: string,
  include: (filePath: string) => boolean = () => true,
) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath, include);
    } else if (include(sourcePath)) {
      await copyFile(sourcePath, targetPath);
    }
  }
}

async function listFilesRecursive(
  source: string,
  include: (filePath: string) => boolean = () => true,
) {
  const files: string[] = [];
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(sourcePath, include)));
    } else if (include(sourcePath)) {
      files.push(sourcePath);
    }
  }
  return files.sort();
}

async function writeTextFile(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

function argValue(name: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const paths = await writeMockReports({ outDir: argValue("--out") });
  console.log(`Mock feature spec report written to ${paths.featureReportPath}`);
  console.log(`Mock previous feature spec report written to ${paths.previousFeatureReportPath}`);
  console.log(`Mock diff report written to ${paths.diffReportPath}`);
}
