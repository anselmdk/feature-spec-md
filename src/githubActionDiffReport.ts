import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { html } from "./html.js";
import {
  downloadRemoteFile,
  ftpConfig,
  listBuildNumbers,
  listRemoteFilesRecursive,
  pathJoin,
  publicUrl,
  uploadDirectory,
  type GithubActionOptions,
} from "./githubActionFtp.js";
import { writeGithubOutput, writeGithubSummary } from "./githubActionOutput.js";

export type GithubActionDiffReportOptions = GithubActionOptions;

export type LocalDiffReportOptions = {
  previousDir: string;
  currentDir: string;
  prNumber?: string;
  baseBuild?: string;
  currentBuild?: string;
  baseBuildUrl?: string;
  currentBuildUrl?: string;
  baseLabel?: DiffReport["baseLabel"];
  previousAssetUrlPrefix?: string;
  currentAssetUrlPrefix?: string;
};

type ComparedFile = {
  path: string;
  kind: "report" | "screenshot" | "asset";
  status: "added" | "removed" | "changed" | "unchanged";
  previousHash?: string;
  currentHash?: string;
  previousSize?: number;
  currentSize?: number;
};

type DiffLine = {
  kind: "context" | "added" | "removed";
  previousLine?: number;
  currentLine?: number;
  text: string;
};

type SpecSection = {
  key: string;
  title: string;
  filePath?: string;
  scenarioIds: string[];
  text: string;
};

type SpecDiff = {
  key: string;
  title: string;
  filePath?: string;
  status: "added" | "removed" | "changed";
  lines: DiffLine[];
};

type ScreenshotDiffItem = {
  path: string;
  title: string;
  status: ComparedFile["status"];
  previousUrl?: string;
  currentUrl?: string;
  previousSize?: number;
  currentSize?: number;
};

type ScreenshotDiffGroup = {
  specLabel: string;
  specPath?: string;
  items: ScreenshotDiffItem[];
};

type DiffReport = {
  prNumber: string;
  baseBuild?: string;
  currentBuild: string;
  baseBuildUrl?: string;
  currentBuildUrl: string;
  baseLabel: "main" | "previous" | "none";
  files: ComparedFile[];
  specDiffs: SpecDiff[];
  screenshotDiffs: ScreenshotDiffGroup[];
};

export async function publishGithubActionDiffReport(
  options: GithubActionDiffReportOptions,
) {
  const config = ftpConfig(options);
  const prNumber = config.prNumber;
  if (!prNumber) throw new Error("Missing required option --pr-number or FEATURE_SPEC_PR_NUMBER.");

  const buildsRoot = pathJoin(config.remoteDir, "build");
  const builds = await listBuildNumbers(buildsRoot, config);
  const currentBuild = config.buildNumber;
  const requestedBaseBuild = optionValue(options, "base-build-number", "FEATURE_SPEC_BASE_BUILD_NUMBER");
  const hasRequestedBaseBuild = Boolean(requestedBaseBuild && builds.includes(requestedBaseBuild));
  const baseBuild = hasRequestedBaseBuild ? requestedBaseBuild : previousBuildNumber(builds, currentBuild);
  const baseLabel: DiffReport["baseLabel"] = hasRequestedBaseBuild ? "main" : baseBuild ? "previous" : "none";

  const report = baseBuild
    ? await compareBuilds(config, baseBuild, currentBuild, prNumber, baseLabel)
    : emptyReport(config, prNumber, currentBuild);

  const localReportDir = join(tmpdir(), `feature-spec-md-pr-diff-${process.pid}-${prNumber}-${currentBuild}`);
  await mkdir(localReportDir, { recursive: true });
  await writeFile(join(localReportDir, "index.html"), renderDiffReport(report), "utf8");

  const remoteReportDir = pathJoin(config.remoteDir, "pr", prNumber, currentBuild);
  await uploadDirectory(localReportDir, remoteReportDir, config);

  const reportUrl = publicUrl(config.baseUrl, "pr", prNumber, currentBuild, "");
  await writeGithubSummary([
    "## Feature Spec PR Diff",
    "",
    `<p><strong>Diff report:</strong> <a href=\"${html(reportUrl)}\">PR #${html(prNumber)} build ${html(currentBuild)}</a></p>`,
    summaryComparisonSentence(report),
    "",
  ].join("\n"));
  await writeGithubOutput({
    "diff-report-url": reportUrl,
    "diff-comment-body": commentBody(report, reportUrl),
    "base-build": report.baseLabel === "main" ? report.baseBuild ?? "" : "",
    "previous-build": report.baseLabel === "previous" ? report.baseBuild ?? "" : "",
    "current-build": currentBuild,
  });
  console.log(`Feature spec PR diff report uploaded to ${reportUrl}`);
}

export async function renderLocalDiffReport(options: LocalDiffReportOptions) {
  return renderDiffReport(await compareLocalBuilds(options));
}

async function compareLocalBuilds(options: LocalDiffReportOptions): Promise<DiffReport> {
  const baseBuild = options.baseBuild ?? "127";
  const currentBuild = options.currentBuild ?? "128";
  const files = await compareLocalFiles(options.previousDir, options.currentDir);
  const previousIndex = await readFileMaybe(join(options.previousDir, "index.html"));
  const currentIndex = await readFileMaybe(join(options.currentDir, "index.html"));
  const previousSpecs = extractSpecSections(previousIndex ?? "");
  const currentSpecs = extractSpecSections(currentIndex ?? "");
  const specDiffs = compareSpecSections(previousSpecs, currentSpecs);
  const scenarioToSpec = scenarioSpecMap([...previousSpecs, ...currentSpecs]);
  const screenshotDiffs = groupScreenshotDiffs(files, scenarioToSpec, {
    previousUrl: (filePath) => relativeAssetUrl(options.previousAssetUrlPrefix ?? "previous", filePath),
    currentUrl: (filePath) => relativeAssetUrl(options.currentAssetUrlPrefix ?? "current", filePath),
  });

  return {
    prNumber: options.prNumber ?? "42",
    baseBuild,
    currentBuild,
    baseBuildUrl: options.baseBuildUrl ?? "previous/",
    currentBuildUrl: options.currentBuildUrl ?? "current/",
    baseLabel: options.baseLabel ?? "previous",
    files,
    specDiffs,
    screenshotDiffs,
  };
}

function emptyReport(config: ReturnType<typeof ftpConfig>, prNumber: string, currentBuild: string): DiffReport {
  return {
    prNumber,
    currentBuild,
    currentBuildUrl: publicUrl(config.baseUrl, "build", currentBuild, ""),
    baseLabel: "none",
    files: [],
    specDiffs: [],
    screenshotDiffs: [],
  };
}

async function compareBuilds(
  config: ReturnType<typeof ftpConfig>,
  baseBuild: string,
  currentBuild: string,
  prNumber: string,
  baseLabel: DiffReport["baseLabel"],
): Promise<DiffReport> {
  const baseRoot = pathJoin(config.remoteDir, "build", baseBuild);
  const currentRoot = pathJoin(config.remoteDir, "build", currentBuild);
  const baseFiles = await listRemoteFilesRecursive(baseRoot, config);
  const currentFiles = await listRemoteFilesRecursive(currentRoot, config);
  const baseRelative = new Set(baseFiles.map((file) => relativeRemotePath(baseRoot, file)));
  const currentRelative = new Set(currentFiles.map((file) => relativeRemotePath(currentRoot, file)));
  const allPaths = Array.from(new Set([...baseRelative, ...currentRelative])).sort();
  const localRoot = join(tmpdir(), `feature-spec-md-build-compare-${process.pid}-${baseBuild}-${currentBuild}`);
  const files: ComparedFile[] = [];

  for (const filePath of allPaths) {
    const baseRemote = baseRelative.has(filePath) ? pathJoin(baseRoot, filePath) : undefined;
    const currentRemote = currentRelative.has(filePath) ? pathJoin(currentRoot, filePath) : undefined;
    const baseLocal = baseRemote ? join(localRoot, "base", filePath) : undefined;
    const currentLocal = currentRemote ? join(localRoot, "current", filePath) : undefined;

    if (baseRemote && baseLocal) await downloadRemoteFile(baseRemote, baseLocal, config);
    if (currentRemote && currentLocal) await downloadRemoteFile(currentRemote, currentLocal, config);

    const baseInfo = baseLocal ? await fileInfo(baseLocal) : undefined;
    const currentInfo = currentLocal ? await fileInfo(currentLocal) : undefined;
    const status = !baseInfo ? "added" : !currentInfo ? "removed" : baseInfo.hash === currentInfo.hash ? "unchanged" : "changed";

    files.push({
      path: filePath,
      kind: fileKind(filePath),
      status,
      previousHash: baseInfo?.hash,
      currentHash: currentInfo?.hash,
      previousSize: baseInfo?.size,
      currentSize: currentInfo?.size,
    });
  }

  const previousIndex = await readFileMaybe(join(localRoot, "base", "index.html"));
  const currentIndex = await readFileMaybe(join(localRoot, "current", "index.html"));
  const previousSpecs = extractSpecSections(previousIndex ?? "");
  const currentSpecs = extractSpecSections(currentIndex ?? "");
  const specDiffs = compareSpecSections(previousSpecs, currentSpecs);
  const scenarioToSpec = scenarioSpecMap([...previousSpecs, ...currentSpecs]);
  const screenshotDiffs = groupScreenshotDiffs(files, scenarioToSpec, {
    previousUrl: (filePath) => publicUrl(config.baseUrl, "build", baseBuild, filePath),
    currentUrl: (filePath) => publicUrl(config.baseUrl, "build", currentBuild, filePath),
  });

  return {
    prNumber,
    baseBuild,
    currentBuild,
    baseBuildUrl: publicUrl(config.baseUrl, "build", baseBuild, ""),
    currentBuildUrl: publicUrl(config.baseUrl, "build", currentBuild, ""),
    baseLabel,
    files,
    specDiffs,
    screenshotDiffs,
  };
}

async function compareLocalFiles(previousDir: string, currentDir: string): Promise<ComparedFile[]> {
  const previousFiles = await listLocalFilesRecursive(previousDir);
  const currentFiles = await listLocalFilesRecursive(currentDir);
  const previousSet = new Set(previousFiles);
  const currentSet = new Set(currentFiles);
  const allPaths = Array.from(new Set([...previousSet, ...currentSet])).sort();
  const files: ComparedFile[] = [];

  for (const filePath of allPaths) {
    const previousInfo = previousSet.has(filePath) ? await fileInfo(join(previousDir, filePath)) : undefined;
    const currentInfo = currentSet.has(filePath) ? await fileInfo(join(currentDir, filePath)) : undefined;
    const status = !previousInfo ? "added" : !currentInfo ? "removed" : previousInfo.hash === currentInfo.hash ? "unchanged" : "changed";
    files.push({
      path: filePath,
      kind: fileKind(filePath),
      status,
      previousHash: previousInfo?.hash,
      currentHash: currentInfo?.hash,
      previousSize: previousInfo?.size,
      currentSize: currentInfo?.size,
    });
  }

  return files;
}

async function listLocalFilesRecursive(root: string) {
  const files: string[] = [];
  await visit("");
  return files.sort();

  async function visit(relativeDir: string) {
    const dir = relativeDir ? join(root, relativeDir) : root;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
}

function previousBuildNumber(builds: string[], currentBuild: string) {
  const current = Number(currentBuild);
  return builds.map(Number).filter((build) => Number.isFinite(build) && build < current).sort((a, b) => b - a).at(0)?.toString();
}

function optionValue(options: GithubActionDiffReportOptions, key: string, envKey: string) {
  return options[key] ?? process.env[envKey];
}

async function fileInfo(filePath: string) {
  const buffer = await readFile(filePath);
  return { hash: createHash("sha256").update(buffer).digest("hex"), size: buffer.byteLength };
}

async function readFileMaybe(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function relativeRemotePath(root: string, filePath: string) {
  return relative(root, filePath).split("\\").join("/");
}

function fileKind(filePath: string): ComparedFile["kind"] {
  const name = basename(filePath).toLowerCase();
  if (name === "index.html" || name.endsWith(".html") || name.endsWith(".json")) return "report";
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(name)) return "screenshot";
  return "asset";
}

function extractSpecSections(source: string): SpecSection[] {
  if (!source) return [];
  const sections: SpecSection[] = [];
  const matches = source.matchAll(/<section class="panel">([\s\S]*?)(?=<section class="panel">|<script>|<\/body>)/g);
  for (const match of matches) {
    const fragment = match[1] ?? "";
    const heading = fragment.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1];
    if (!heading) continue;
    const title = textContent(heading).trim();
    if (!title || title === "Validation" || title === "Models") continue;
    const filePaths = Array.from(fragment.matchAll(/title="([^":]+\.md):\d+"/g), (item) => item[1]);
    const scenarioIds = Array.from(fragment.matchAll(/<summary><code>([^<]+)<\/code>/g), (item) => textContent(item[1] ?? ""));
    const text = specText(fragment);
    const filePath = filePaths[0];
    sections.push({
      key: filePath ?? title,
      title,
      filePath,
      scenarioIds,
      text,
    });
  }
  return sections;
}

function specText(fragment: string) {
  return textContent(fragment)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function textContent(fragment: string) {
  return decodeEntities(
    fragment
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>|<\/li>|<\/summary>|<\/h[1-6]>|<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function decodeEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function compareSpecSections(previous: SpecSection[], current: SpecSection[]): SpecDiff[] {
  const previousByKey = new Map(previous.map((spec) => [spec.key, spec]));
  const currentByKey = new Map(current.map((spec) => [spec.key, spec]));
  const keys = Array.from(new Set([...previousByKey.keys(), ...currentByKey.keys()])).sort();
  const diffs: SpecDiff[] = [];
  for (const key of keys) {
    const before = previousByKey.get(key);
    const after = currentByKey.get(key);
    const status = !before ? "added" : !after ? "removed" : before.text === after.text ? undefined : "changed";
    if (!status) continue;
    diffs.push({
      key,
      title: after?.title ?? before?.title ?? key,
      filePath: after?.filePath ?? before?.filePath,
      status,
      lines: diffLines(before?.text ?? "", after?.text ?? ""),
    });
  }
  return diffs;
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

function scenarioSpecMap(specs: SpecSection[]) {
  const map = new Map<string, SpecSection>();
  for (const spec of specs) {
    for (const scenarioId of spec.scenarioIds) {
      map.set(scenarioId, spec);
    }
  }
  return map;
}

function groupScreenshotDiffs(
  files: ComparedFile[],
  scenarioMap: Map<string, SpecSection>,
  urls: {
    previousUrl: (filePath: string) => string | undefined;
    currentUrl: (filePath: string) => string | undefined;
  },
): ScreenshotDiffGroup[] {
  const groups = new Map<string, ScreenshotDiffGroup>();
  for (const file of files.filter((item) => item.kind === "screenshot" && item.status !== "unchanged")) {
    const scenarioId = scenarioIdFromScreenshotPath(file.path);
    const spec = scenarioId ? scenarioMap.get(scenarioId) : undefined;
    const specLabel = spec?.filePath ?? spec?.title ?? scenarioId ?? "Unmapped screenshots";
    const group = groups.get(specLabel) ?? { specLabel, specPath: spec?.filePath, items: [] };
    group.items.push({
      path: file.path,
      title: screenshotTitle(file.path, scenarioId),
      status: file.status,
      previousUrl: file.status !== "added" ? urls.previousUrl(file.path) : undefined,
      currentUrl: file.status !== "removed" ? urls.currentUrl(file.path) : undefined,
      previousSize: file.previousSize,
      currentSize: file.currentSize,
    });
    groups.set(specLabel, group);
  }
  return Array.from(groups.values()).sort((a, b) => a.specLabel.localeCompare(b.specLabel));
}

function scenarioIdFromScreenshotPath(filePath: string) {
  return basename(filePath).match(/^(.+?)-line-\d+-/)?.[1];
}

function screenshotTitle(filePath: string, scenarioId: string | undefined) {
  const name = basename(filePath).replace(/\.(png|jpe?g|webp|gif|svg)$/i, "");
  return scenarioId ? name.replace(`${scenarioId}-`, `${scenarioId} `) : name;
}

function relativeAssetUrl(prefix: string, filePath: string) {
  return [prefix.replace(/\/+$/, ""), ...filePath.split("/").filter(Boolean)]
    .filter(Boolean)
    .join("/");
}

function renderDiffReport(report: DiffReport) {
  const changed = report.files.filter((file) => file.status !== "unchanged" && file.kind !== "report");
  const assetChanges = changed.filter((file) => file.kind === "asset");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Feature spec PR diff</title><style>${diffReportStyles()}</style></head><body><h1>Feature spec PR diff for PR #${html(report.prNumber)}</h1><p>Generated ${html(new Date().toISOString())}.</p><section class="panel"><h2>Compared builds</h2><p>${report.baseBuild ? `${baseLabel(report)}: <a href="${html(report.baseBuildUrl ?? "")}">build ${html(report.baseBuild)}</a>` : "No base build found."}</p><p>PR: <a href="${html(report.currentBuildUrl)}">build ${html(report.currentBuild)}</a></p><p><span class="badge">${report.specDiffs.length} spec change${report.specDiffs.length === 1 ? "" : "s"}</span> <span class="badge">${screenshotChangeCount(report)} screenshot change${screenshotChangeCount(report) === 1 ? "" : "s"}</span></p></section>${renderSpecDiffs(report.specDiffs)}${renderScreenshotDiffs(report.screenshotDiffs)}${renderFileSection("Other assets", assetChanges)}</body></html>`;
}

function diffReportStyles() {
  return "body{font-family:system-ui,sans-serif;max-width:1180px;margin:0 auto;padding:40px 24px;color:#1f2328}.panel{border:1px solid #d0d7de;border-radius:8px;padding:20px;margin:18px 0}.badge{border:1px solid #d0d7de;border-radius:999px;padding:2px 8px;font-size:12px}.added{color:#1a7f37}.removed{color:#cf222e}.changed{color:#9a6700}.muted{color:#57606a}.toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 16px}.toggle-label{border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;color:#1f2328;cursor:pointer;font:inherit;padding:6px 10px}.screenshot-all-toggle,.screenshot-item-toggle{margin-right:6px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #d0d7de;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f6f8fa}a{color:#0969da}.diff{width:100%;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}.diff td{padding:2px 8px}.line-no{width:1%;color:#57606a;background:#f6f8fa;text-align:right;user-select:none}.diff-added td{background:#dafbe1}.diff-removed td{background:#ffebe9}.diff-context td{background:#fff}.screenshot-item{border-top:1px solid #d0d7de;padding:10px 0}.screenshot-summary{display:block;margin-bottom:8px;cursor:pointer}.screenshot-all-toggle:not(:checked)~.screenshot-groups .screenshot-item-toggle:not(:checked)~.image-pair{display:none}.image-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.image-card{border:1px solid #d0d7de;border-radius:8px;background:#f6f8fa;overflow:hidden}.image-card h4{margin:0;padding:8px 10px;background:#fff;border-bottom:1px solid #d0d7de}.image-card img{display:block;width:100%;height:auto}";
}

function renderSpecDiffs(specDiffs: SpecDiff[]) {
  if (!specDiffs.length) return `<section class="panel"><h2>Spec changes</h2><p class="muted">No spec text changes detected in the published report.</p></section>`;
  return `<section class="panel"><h2>Spec changes</h2>${specDiffs.map(renderSpecDiff).join("\n")}</section>`;
}

function renderSpecDiff(diff: SpecDiff) {
  return `<details open><summary><strong>${html(diff.filePath ?? diff.title)}</strong> <span class="badge ${diff.status}">${html(diff.status)}</span></summary><table class="diff"><tbody>${diff.lines.map(renderDiffLine).join("")}</tbody></table></details>`;
}

function renderDiffLine(line: DiffLine) {
  const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : "";
  return `<tr class="diff-${line.kind}"><td class="line-no">${line.previousLine ?? ""}</td><td class="line-no">${line.currentLine ?? ""}</td><td>${html(marker)} ${html(line.text)}</td></tr>`;
}

function renderScreenshotDiffs(groups: ScreenshotDiffGroup[]) {
  if (!groups.length) return `<section class="panel"><h2>Screenshots</h2><p class="muted">No screenshot changes.</p></section>`;
  return `<section class="panel"><h2>Screenshots</h2><input id="screenshot-all-toggle" class="screenshot-all-toggle" type="checkbox"><label class="toggle-label" for="screenshot-all-toggle">Show all screenshots</label><div class="screenshot-groups">${groups.map(renderScreenshotGroup).join("\n")}</div></section>`;
}

function renderScreenshotGroup(group: ScreenshotDiffGroup) {
  return `<section><h3>${html(group.specPath ?? group.specLabel)}</h3>${group.items.map(renderScreenshotItem).join("\n")}</section>`;
}

function renderScreenshotItem(item: ScreenshotDiffItem) {
  const before = item.previousUrl ? `<div class="image-card"><h4>Before</h4><img src="${html(item.previousUrl)}" alt="Before ${html(item.title)}"></div>` : "";
  const after = item.currentUrl ? `<div class="image-card"><h4>After</h4><img src="${html(item.currentUrl)}" alt="After ${html(item.title)}"></div>` : "";
  const toggleId = `screenshot-${htmlId(item.path)}`;
  return `<div class="screenshot-item"><input id="${toggleId}" class="screenshot-item-toggle" type="checkbox"><label class="screenshot-summary" for="${toggleId}"><code>${html(item.path)}</code> <span class="badge ${item.status}">${html(item.status)}</span> <span class="muted">${html(sizeChange({ previousSize: item.previousSize, currentSize: item.currentSize }))}</span></label><div class="image-pair">${before}${after}</div></div>`;
}

function htmlId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function renderFileSection(title: string, files: ComparedFile[]) {
  if (!files.length) return `<section class="panel"><h2>${html(title)}</h2><p class="muted">No changes.</p></section>`;
  return `<section class="panel"><h2>${html(title)}</h2><table><thead><tr><th>Status</th><th>File</th><th>Size change</th></tr></thead><tbody>${files.map((file) => `<tr><td class="${file.status}">${html(file.status)}</td><td><code>${html(file.path)}</code></td><td>${html(sizeChange(file))}</td></tr>`).join("")}</tbody></table></section>`;
}

function sizeChange(file: { previousSize?: number; currentSize?: number }) {
  if (file.previousSize === undefined) return `+${file.currentSize ?? 0} bytes`;
  if (file.currentSize === undefined) return `-${file.previousSize} bytes`;
  const diff = file.currentSize - file.previousSize;
  return diff === 0 ? "same size" : `${diff > 0 ? "+" : ""}${diff} bytes`;
}

function screenshotChangeCount(report: DiffReport) {
  return report.screenshotDiffs.reduce((sum, group) => sum + group.items.length, 0);
}

function commentBody(report: DiffReport, reportUrl: string) {
  return [
    "## Feature spec PR diff",
    "",
    `[Open the diff report](${reportUrl}) for ${comparisonText(report)}.`,
    "",
    `Changed: **${report.specDiffs.length}** spec file(s), **${screenshotChangeCount(report)}** screenshot(s).`,
  ].join("\n");
}

function comparisonText(report: DiffReport) {
  if (!report.baseBuild) return `PR build ${report.currentBuild}`;
  return `${baseLabel(report).toLowerCase()} build ${report.baseBuild} → PR build ${report.currentBuild}`;
}

function summaryComparisonSentence(report: DiffReport) {
  if (!report.baseBuild) return `<p>No base build was found, so this report establishes the first comparison baseline.</p>`;
  return `<p>Compared ${html(baseLabel(report).toLowerCase())} build <strong>${html(report.baseBuild)}</strong> with PR build <strong>${html(report.currentBuild)}</strong>.</p>`;
}

function baseLabel(report: DiffReport) {
  if (report.baseLabel === "main") return "Main";
  if (report.baseLabel === "previous") return "Previous";
  return "Base";
}
