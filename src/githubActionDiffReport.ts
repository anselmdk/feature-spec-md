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
  previousBuild?: string;
  currentBuild: string;
  currentBuildUrl: string;
  previousBuildUrl?: string;
  files: ComparedFile[];
};

export async function publishGithubActionDiffReport(
  options: GithubActionDiffReportOptions,
) {
  const config = ftpConfig(options);
  const prNumber = config.prNumber;
  if (!prNumber) {
    throw new Error("Missing required option --pr-number or FEATURE_SPEC_PR_NUMBER.");
  }

  const buildsRoot = pathJoin(config.remoteDir, "build");
  const builds = await listBuildNumbers(buildsRoot, config);
  const currentBuild = config.buildNumber;
  const previousBuild = previousBuildNumber(builds, currentBuild);
  const currentBuildUrl = publicUrl(config.baseUrl, "build", currentBuild, "");
  const previousBuildUrl = previousBuild
    ? publicUrl(config.baseUrl, "build", previousBuild, "")
    : undefined;

  const report: DiffReport = previousBuild
    ? await compareBuilds(config, previousBuild, currentBuild, prNumber)
    : {
        prNumber,
        currentBuild,
        currentBuildUrl,
        files: [],
      };

  if (previousBuild) {
    report.previousBuild = previousBuild;
    report.previousBuildUrl = previousBuildUrl;
  }

  const localReportDir = join(
    tmpdir(),
    `feature-spec-md-pr-diff-${process.pid}-${prNumber}-${currentBuild}`,
  );
  await mkdir(localReportDir, { recursive: true });
  await writeFile(join(localReportDir, "index.html"), renderDiffReport(report), "utf8");

  const remoteReportDir = pathJoin(config.remoteDir, "pr", prNumber, currentBuild);
  await uploadDirectory(localReportDir, remoteReportDir, config);

  const reportUrl = publicUrl(config.baseUrl, "pr", prNumber, currentBuild, "");
  await writeGithubSummary(
    [
      "## Feature Spec PR Diff",
      "",
      `<p><strong>Diff report:</strong> <a href=\"${html(reportUrl)}\">PR #${html(prNumber)} build ${html(currentBuild)}</a></p>`,
      report.previousBuild
        ? `<p>Compared build <strong>${html(report.previousBuild)}</strong> with build <strong>${html(currentBuild)}</strong>.</p>`
        : `<p>No earlier build was found, so this report establishes the first comparison baseline.</p>`,
      "",
    ].join("\n"),
  );
  await writeGithubOutput({
    "diff-report-url": reportUrl,
    "diff-comment-body": commentBody(report, reportUrl),
    "previous-build": report.previousBuild ?? "",
    "current-build": currentBuild,
  });
  console.log(`Feature spec PR diff report uploaded to ${reportUrl}`);
}

async function compareBuilds(
  config: ReturnType<typeof ftpConfig>,
  previousBuild: string,
  currentBuild: string,
  prNumber: string,
): Promise<DiffReport> {
  const previousRoot = pathJoin(config.remoteDir, "build", previousBuild);
  const currentRoot = pathJoin(config.remoteDir, "build", currentBuild);
  const previousFiles = await listRemoteFilesRecursive(previousRoot, config);
  const currentFiles = await listRemoteFilesRecursive(currentRoot, config);
  const previousRelative = new Set(
    previousFiles.map((file) => relativeRemotePath(previousRoot, file)),
  );
  const currentRelative = new Set(
    currentFiles.map((file) => relativeRemotePath(currentRoot, file)),
  );
  const allPaths = Array.from(new Set([...previousRelative, ...currentRelative])).sort();

  const localRoot = join(
    tmpdir(),
    `feature-spec-md-build-compare-${process.pid}-${previousBuild}-${currentBuild}`,
  );
  const files: ComparedFile[] = [];

  for (const filePath of allPaths) {
    const previousRemote = previousRelative.has(filePath)
      ? pathJoin(previousRoot, filePath)
      : undefined;
    const currentRemote = currentRelative.has(filePath)
      ? pathJoin(currentRoot, filePath)
      : undefined;
    const previousLocal = previousRemote
      ? join(localRoot, "previous", filePath)
      : undefined;
    const currentLocal = currentRemote ? join(localRoot, "current", filePath) : undefined;

    if (previousRemote && previousLocal) {
      await downloadRemoteFile(previousRemote, previousLocal, config);
    }
    if (currentRemote && currentLocal) {
      await downloadRemoteFile(currentRemote, currentLocal, config);
    }

    const previousInfo = previousLocal ? await fileInfo(previousLocal) : undefined;
    const currentInfo = currentLocal ? await fileInfo(currentLocal) : undefined;
    const status = !previousInfo
      ? "added"
      : !currentInfo
        ? "removed"
        : previousInfo.hash === currentInfo.hash
          ? "unchanged"
          : "changed";

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

  return {
    prNumber,
    previousBuild,
    currentBuild,
    previousBuildUrl: publicUrl(config.baseUrl, "build", previousBuild, ""),
    currentBuildUrl: publicUrl(config.baseUrl, "build", currentBuild, ""),
    files,
  };
}

function previousBuildNumber(builds: string[], currentBuild: string) {
  const current = Number(currentBuild);
  return builds
    .map(Number)
    .filter((build) => Number.isFinite(build) && build < current)
    .sort((a, b) => b - a)
    .at(0)
    ?.toString();
}

async function fileInfo(filePath: string) {
  const buffer = await readFile(filePath);
  return {
    hash: createHash("sha256").update(buffer).digest("hex"),
    size: buffer.byteLength,
  };
}

function relativeRemotePath(root: string, filePath: string) {
  return relative(root, filePath).split("\\").join("/");
}

function fileKind(filePath: string): ComparedFile["kind"] {
  const name = basename(filePath).toLowerCase();
  if (name === "index.html" || name.endsWith(".html") || name.endsWith(".json")) {
    return "report";
  }
  if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return "screenshot";
  return "asset";
}

function renderDiffReport(report: DiffReport) {
  const changed = report.files.filter((file) => file.status !== "unchanged");
  const byKind = (kind: ComparedFile["kind"]) =>
    changed.filter((file) => file.kind === kind);
  const sections = [
    renderFileSection("Report output", byKind("report")),
    renderFileSection("Screenshots", byKind("screenshot")),
    renderFileSection("Other assets", byKind("asset")),
  ].join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Feature spec PR diff</title>
    <style>
      body{font-family:system-ui,sans-serif;max-width:1180px;margin:0 auto;padding:40px 24px;color:#1f2328}
      .panel{border:1px solid #d0d7de;border-radius:8px;padding:20px;margin:18px 0}
      .badge{border:1px solid #d0d7de;border-radius:999px;padding:2px 8px;font-size:12px;white-space:nowrap}
      .added{color:#1a7f37}.removed{color:#cf222e}.changed{color:#9a6700}.muted{color:#57606a}
      table{border-collapse:collapse;width:100%;font-size:14px} th,td{border:1px solid #d0d7de;padding:6px 8px;text-align:left;vertical-align:top} th{background:#f6f8fa}
      a{color:#0969da}
    </style>
  </head>
  <body>
    <h1>Feature spec PR diff for PR #${html(report.prNumber)}</h1>
    <p>Generated ${html(new Date().toISOString())}.</p>
    <section class="panel">
      <h2>Compared builds</h2>
      <p>${report.previousBuild ? `Previous: <a href="${html(report.previousBuildUrl ?? "")}">build ${html(report.previousBuild)}</a>` : "No previous build found."}</p>
      <p>Current: <a href="${html(report.currentBuildUrl)}">build ${html(report.currentBuild)}</a></p>
      <p><span class="badge">${changed.length} changed file${changed.length === 1 ? "" : "s"}</span> <span class="muted">${report.files.length} file${report.files.length === 1 ? "" : "s"} checked</span></p>
    </section>
    ${sections}
  </body>
</html>`;
}

function renderFileSection(title: string, files: ComparedFile[]) {
  if (!files.length) {
    return `<section class="panel"><h2>${html(title)}</h2><p class="muted">No changes.</p></section>`;
  }

  return `<section class="panel"><h2>${html(title)}</h2><table><thead><tr><th>Status</th><th>File</th><th>Size change</th></tr></thead><tbody>${files
    .map(
      (file) =>
        `<tr><td class="${file.status}">${html(file.status)}</td><td><code>${html(file.path)}</code></td><td>${html(sizeChange(file))}</td></tr>`,
    )
    .join("")}</tbody></table></section>`;
}

function sizeChange(file: ComparedFile) {
  if (file.previousSize === undefined) return `+${file.currentSize ?? 0} bytes`;
  if (file.currentSize === undefined) return `-${file.previousSize} bytes`;
  const diff = file.currentSize - file.previousSize;
  if (diff === 0) return "same size";
  return `${diff > 0 ? "+" : ""}${diff} bytes`;
}

function commentBody(report: DiffReport, reportUrl: string) {
  const changed = report.files.filter((file) => file.status !== "unchanged");
  const reportChanges = changed.filter((file) => file.kind === "report").length;
  const screenshotChanges = changed.filter((file) => file.kind === "screenshot").length;
  const previous = report.previousBuild
    ? `build ${report.previousBuild} → build ${report.currentBuild}`
    : `build ${report.currentBuild}`;

  return [
    "## Feature spec PR diff",
    "",
    `[Open the diff report](${reportUrl}) for ${previous}.`,
    "",
    `Changed files: **${changed.length}** total, **${reportChanges}** report output, **${screenshotChanges}** screenshots.`,
  ].join("\n");
}
