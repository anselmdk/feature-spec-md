import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { tmpdir } from "node:os";
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

type ComparedFile = {
  path: string;
  kind: "report" | "screenshot" | "asset";
  status: "added" | "removed" | "changed" | "unchanged";
  previousHash?: string;
  currentHash?: string;
  previousSize?: number;
  currentSize?: number;
};

type DiffReport = {
  prNumber: string;
  baseBuild?: string;
  currentBuild: string;
  baseBuildUrl?: string;
  currentBuildUrl: string;
  baseLabel: "main" | "previous" | "none";
  files: ComparedFile[];
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

function emptyReport(config: ReturnType<typeof ftpConfig>, prNumber: string, currentBuild: string): DiffReport {
  return {
    prNumber,
    currentBuild,
    currentBuildUrl: publicUrl(config.baseUrl, "build", currentBuild, ""),
    baseLabel: "none",
    files: [],
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

  return {
    prNumber,
    baseBuild,
    currentBuild,
    baseBuildUrl: publicUrl(config.baseUrl, "build", baseBuild, ""),
    currentBuildUrl: publicUrl(config.baseUrl, "build", currentBuild, ""),
    baseLabel,
    files,
  };
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

function relativeRemotePath(root: string, filePath: string) {
  return relative(root, filePath).split("\\").join("/");
}

function fileKind(filePath: string): ComparedFile["kind"] {
  const name = basename(filePath).toLowerCase();
  if (name === "index.html" || name.endsWith(".html") || name.endsWith(".json")) return "report";
  if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return "screenshot";
  return "asset";
}

function renderDiffReport(report: DiffReport) {
  const changed = report.files.filter((file) => file.status !== "unchanged");
  const byKind = (kind: ComparedFile["kind"]) => changed.filter((file) => file.kind === kind);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Feature spec PR diff</title><style>body{font-family:system-ui,sans-serif;max-width:1180px;margin:0 auto;padding:40px 24px;color:#1f2328}.panel{border:1px solid #d0d7de;border-radius:8px;padding:20px;margin:18px 0}.badge{border:1px solid #d0d7de;border-radius:999px;padding:2px 8px;font-size:12px}.added{color:#1a7f37}.removed{color:#cf222e}.changed{color:#9a6700}.muted{color:#57606a}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #d0d7de;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f6f8fa}a{color:#0969da}</style></head><body><h1>Feature spec PR diff for PR #${html(report.prNumber)}</h1><p>Generated ${html(new Date().toISOString())}.</p><section class="panel"><h2>Compared builds</h2><p>${report.baseBuild ? `${baseLabel(report)}: <a href="${html(report.baseBuildUrl ?? "")}">build ${html(report.baseBuild)}</a>` : "No base build found."}</p><p>PR: <a href="${html(report.currentBuildUrl)}">build ${html(report.currentBuild)}</a></p><p><span class="badge">${changed.length} changed file${changed.length === 1 ? "" : "s"}</span> <span class="muted">${report.files.length} file${report.files.length === 1 ? "" : "s"} checked</span></p></section>${renderFileSection("Report output", byKind("report"))}${renderFileSection("Screenshots", byKind("screenshot"))}${renderFileSection("Other assets", byKind("asset"))}</body></html>`;
}

function renderFileSection(title: string, files: ComparedFile[]) {
  if (!files.length) return `<section class="panel"><h2>${html(title)}</h2><p class="muted">No changes.</p></section>`;
  return `<section class="panel"><h2>${html(title)}</h2><table><thead><tr><th>Status</th><th>File</th><th>Size change</th></tr></thead><tbody>${files.map((file) => `<tr><td class="${file.status}">${html(file.status)}</td><td><code>${html(file.path)}</code></td><td>${html(sizeChange(file))}</td></tr>`).join("")}</tbody></table></section>`;
}

function sizeChange(file: ComparedFile) {
  if (file.previousSize === undefined) return `+${file.currentSize ?? 0} bytes`;
  if (file.currentSize === undefined) return `-${file.previousSize} bytes`;
  const diff = file.currentSize - file.previousSize;
  return diff === 0 ? "same size" : `${diff > 0 ? "+" : ""}${diff} bytes`;
}

function commentBody(report: DiffReport, reportUrl: string) {
  const changed = report.files.filter((file) => file.status !== "unchanged");
  const reportChanges = changed.filter((file) => file.kind === "report").length;
  const screenshotChanges = changed.filter((file) => file.kind === "screenshot").length;
  return ["## Feature spec PR diff", "", `[Open the diff report](${reportUrl}) for ${comparisonText(report)}.`, "", `Changed files: **${changed.length}** total, **${reportChanges}** report output, **${screenshotChanges}** screenshots.`].join("\n");
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
