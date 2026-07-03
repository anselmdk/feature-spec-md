import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSpecScreenshots } from "./screenshots.js";
import { checkSpecDocuments } from "./specDocuments.js";
import { insertReportMetadata, type ReportMetadataItem } from "./reportMetadata.js";
import { renderHtmlReport } from "./reportTemplate.js";
import type {
  SpecDocument,
  SpecScreenshot,
  ValidationIssue,
} from "./types.js";

export type MockReportVariant = "current" | "previous";

export type MockReportData = Awaited<ReturnType<typeof loadMockReportData>>;

export type WriteMockReportsOptions = {
  outDir?: string;
  generatedAt?: string;
};

type DiffLine = {
  kind: "context" | "added" | "removed";
  previousLine?: number;
  currentLine?: number;
  text: string;
};

type MockSpecDiff = {
  filePath: string;
  status: "added" | "removed" | "changed";
  lines: DiffLine[];
};

type MockScreenshotDiff = {
  path: string;
  status: "added" | "removed" | "changed";
  previousPath?: string;
  currentPath?: string;
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
  );

  return {
    title: "Feature Spec Report for mock-support-desk",
    fixturesRoot,
    variantRoot,
    documents: result.documents,
    models: result.models,
    features: result.features,
    stacks: result.stacks,
    designs: result.designs,
    coverage: result.coverage,
    screenshots,
    validationIssues: [...result.validationIssues, ...result.coverageIssues],
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
  const previous = await loadMockReportData("previous");
  const current = await loadMockReportData("current");
  const specDiffs = compareDocuments(previous.documents, current.documents);
  const screenshotDiffs = compareScreenshots(previous.screenshots, current.screenshots);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Feature spec PR diff mock</title>
    <style>
      body{font-family:system-ui,sans-serif;max-width:1180px;margin:0 auto;padding:40px 24px;color:#1f2328}
      .panel{border:1px solid #d0d7de;border-radius:8px;padding:20px;margin:18px 0}
      .badge{border:1px solid #d0d7de;border-radius:999px;padding:2px 8px;font-size:12px;white-space:nowrap}
      .added{color:#1a7f37}.removed{color:#cf222e}.changed{color:#9a6700}.muted{color:#57606a}
      table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #d0d7de;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f6f8fa}
      .diff{width:100%;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}.diff td{padding:2px 8px}.line-no{width:1%;color:#57606a;background:#f6f8fa;text-align:right;user-select:none}.diff-added td{background:#dafbe1}.diff-removed td{background:#ffebe9}.diff-context td{background:#fff}
      .image-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.image-card{border:1px solid #d0d7de;border-radius:8px;background:#f6f8fa;overflow:hidden}.image-card h4{margin:0;padding:8px 10px;background:#fff;border-bottom:1px solid #d0d7de}.image-card img{display:block;width:100%;height:auto}
      a{color:#0969da}
    </style>
  </head>
  <body>
    <h1>Feature spec PR diff for PR #42</h1>
    <p>Generated ${html(formatGeneratedAt(generatedAt))}.</p>
    <section class="panel">
      <h2>Compared builds</h2>
      <p>Main: <a href="../previous-feature-spec-report/">build 127</a></p>
      <p>PR: <a href="../feature-spec-report/">build 128</a></p>
      <p><span class="badge">${specDiffs.length} spec change${specDiffs.length === 1 ? "" : "s"}</span> <span class="badge">${screenshotDiffs.length} screenshot change${screenshotDiffs.length === 1 ? "" : "s"}</span></p>
    </section>
    ${renderSpecDiffs(specDiffs)}
    ${renderScreenshotDiffs(screenshotDiffs)}
    <section class="panel"><h2>Other assets</h2><p class="muted">No other asset changes.</p></section>
  </body>
</html>`;
}

export async function writeMockReports(options: WriteMockReportsOptions = {}) {
  const outDir = options.outDir ?? "test-results/mock-reports";
  const generatedAt = options.generatedAt ?? defaultGeneratedAt;
  const featureDir = path.join(outDir, "feature-spec-report");
  const previousFeatureDir = path.join(outDir, "previous-feature-spec-report");
  const diffDir = path.join(outDir, "diff-report");
  const fixturesRoot = await mockFixturesRoot();

  await writeTextFile(
    path.join(featureDir, "index.html"),
    await renderMockFeatureSpecReport("current", generatedAt),
  );
  await writeTextFile(
    path.join(previousFeatureDir, "index.html"),
    await renderMockFeatureSpecReport("previous", generatedAt),
  );
  await writeTextFile(path.join(diffDir, "index.html"), await renderMockDiffReport(generatedAt));

  await copyDirectory(
    path.join(fixturesRoot, "current", "screenshots"),
    path.join(featureDir, "screenshots"),
    (filePath) => filePath.endsWith(".svg"),
  );
  await copyDirectory(
    path.join(fixturesRoot, "previous", "screenshots"),
    path.join(previousFeatureDir, "screenshots"),
    (filePath) => filePath.endsWith(".svg"),
  );
  await copyDirectory(
    path.join(fixturesRoot, "current", "screenshots"),
    path.join(diffDir, "current", "screenshots"),
    (filePath) => filePath.endsWith(".svg"),
  );
  await copyDirectory(
    path.join(fixturesRoot, "previous", "screenshots"),
    path.join(diffDir, "previous", "screenshots"),
    (filePath) => filePath.endsWith(".svg"),
  );

  return {
    featureReportPath: path.join(featureDir, "index.html"),
    previousFeatureReportPath: path.join(previousFeatureDir, "index.html"),
    diffReportPath: path.join(diffDir, "index.html"),
  };
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

function normalizeMockScreenshots(
  screenshots: SpecScreenshot[],
  fixturesRoot: string,
): SpecScreenshot[] {
  return screenshots.map((screenshot) => ({
    ...screenshot,
    specPath: path.isAbsolute(screenshot.specPath)
      ? screenshot.specPath
      : path.join(fixturesRoot, screenshot.specPath.replace(/^src\/mocks\//, "")),
  }));
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function compareDocuments(
  previousDocuments: SpecDocument[],
  currentDocuments: SpecDocument[],
): MockSpecDiff[] {
  const previousByPath = new Map(
    previousDocuments.map((document) => [normalizeMockPath(document.filePath), document]),
  );
  const currentByPath = new Map(
    currentDocuments.map((document) => [normalizeMockPath(document.filePath), document]),
  );
  const paths = Array.from(new Set([...previousByPath.keys(), ...currentByPath.keys()])).sort();

  return paths.flatMap((filePath) => {
    const previous = previousByPath.get(filePath);
    const current = currentByPath.get(filePath);
    const status = !previous
      ? "added"
      : !current
        ? "removed"
        : previous.source === current.source
          ? undefined
          : "changed";
    if (!status) return [];
    return [{ filePath, status, lines: diffLines(previous?.source ?? "", current?.source ?? "") }];
  });
}

function compareScreenshots(
  previousScreenshots: SpecScreenshot[],
  currentScreenshots: SpecScreenshot[],
): MockScreenshotDiff[] {
  const previousByKey = new Map(previousScreenshots.map((item) => [screenshotDiffKey(item), item]));
  const currentByKey = new Map(currentScreenshots.map((item) => [screenshotDiffKey(item), item]));
  const keys = Array.from(new Set([...previousByKey.keys(), ...currentByKey.keys()])).sort();

  return keys.flatMap((key) => {
    const previous = previousByKey.get(key);
    const current = currentByKey.get(key);
    const status = !previous
      ? "added"
      : !current
        ? "removed"
        : previous.path === current.path
          ? undefined
          : "changed";
    if (!status) return [];
    return [
      {
        path: normalizeMockPath(current?.path ?? previous?.path ?? key),
        status,
        previousPath: previous ? path.posix.join("previous", normalizeMockPath(previous.path)) : undefined,
        currentPath: current ? path.posix.join("current", normalizeMockPath(current.path)) : undefined,
      },
    ];
  });
}

function screenshotDiffKey(item: SpecScreenshot) {
  return `${normalizeMockPath(item.specPath)}:${item.line}`;
}

function diffLines(previous: string, current: string): DiffLine[] {
  const a = previous.split("\n");
  const b = current.split("\n");
  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      matrix[i][j] = a[i] === b[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: "context", previousLine: i + 1, currentLine: j + 1, text: a[i] });
      i += 1;
      j += 1;
    } else if (j < b.length && (i === a.length || matrix[i][j + 1] >= matrix[i + 1][j])) {
      lines.push({ kind: "added", currentLine: j + 1, text: b[j] });
      j += 1;
    } else if (i < a.length) {
      lines.push({ kind: "removed", previousLine: i + 1, text: a[i] });
      i += 1;
    }
  }
  return compactContext(lines);
}

function compactContext(lines: DiffLine[]) {
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (line.kind === "context") return;
    for (let offset = -3; offset <= 3; offset += 1) {
      const candidate = index + offset;
      if (candidate >= 0 && candidate < lines.length) keep.add(candidate);
    }
  });
  return lines.filter((line, index) => line.kind !== "context" || keep.has(index));
}

function renderSpecDiffs(specDiffs: MockSpecDiff[]) {
  if (!specDiffs.length) {
    return `<section class="panel"><h2>Spec changes</h2><p class="muted">No spec text changes detected.</p></section>`;
  }
  return `<section class="panel"><h2>Spec changes</h2>${specDiffs.map(renderSpecDiff).join("\n")}</section>`;
}

function renderSpecDiff(diff: MockSpecDiff) {
  return `<details open><summary><strong>${html(diff.filePath)}</strong> <span class="badge ${diff.status}">${html(diff.status)}</span></summary><table class="diff"><tbody>${diff.lines.map(renderDiffLine).join("")}</tbody></table></details>`;
}

function renderDiffLine(line: DiffLine) {
  const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : "";
  return `<tr class="diff-${line.kind}"><td class="line-no">${line.previousLine ?? ""}</td><td class="line-no">${line.currentLine ?? ""}</td><td>${html(marker)} ${html(line.text)}</td></tr>`;
}

function renderScreenshotDiffs(items: MockScreenshotDiff[]) {
  if (!items.length) {
    return `<section class="panel"><h2>Screenshots</h2><p class="muted">No screenshot changes.</p></section>`;
  }
  return `<section class="panel"><h2>Screenshots</h2>${items.map(renderScreenshotDiff).join("\n")}</section>`;
}

function renderScreenshotDiff(item: MockScreenshotDiff) {
  const before = item.previousPath
    ? `<div class="image-card"><h4>Before</h4><img src="${html(item.previousPath)}" alt="Before ${html(item.path)}"></div>`
    : "";
  const after = item.currentPath
    ? `<div class="image-card"><h4>After</h4><img src="${html(item.currentPath)}" alt="After ${html(item.path)}"></div>`
    : "";
  return `<details open><summary><code>${html(item.path)}</code> <span class="badge ${item.status}">${html(item.status)}</span></summary><div class="image-pair">${before}${after}</div></details>`;
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

async function writeTextFile(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

function normalizeMockPath(filePath: string) {
  return filePath.split(path.sep).join("/").replace(/^.*src\/mocks\/(current|previous)\//, "");
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

function html(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
