import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ftpConfig,
  listBuildNumbers,
  pathJoin,
  publicUrl,
  uploadDirectory,
  uploadFile,
  type GithubActionOptions,
} from "./githubActionFtp.js";
import { writeGithubOutput, writeGithubSummary } from "./githubActionOutput.js";

export type GithubActionReportOptions = GithubActionOptions;

type PublishMode = "artifact" | "ftp";

export async function publishGithubActionReport(
  options: GithubActionReportOptions,
) {
  const reportDir =
    value(options, "report-dir", "FEATURE_SPEC_REPORT_DIR") ??
    "test-results/spec-report";
  const reportName =
    value(options, "name", "FEATURE_SPEC_REPORT_NAME") ??
    "feature-spec-report";
  const mode = publishMode(
    value(options, "publish", "FEATURE_SPEC_REPORT_PUBLISH") ?? "artifact",
  );

  if (mode === "ftp") {
    const config = ftpConfig(options);
    const reportUrl = await publishReportToFtp(reportDir, config);
    await writeGithubSummary(
      [
        "## Feature Spec Report",
        "",
        `<p><strong>Hosted HTML report:</strong> <a href=\"${escapeHtml(reportUrl)}\">${escapeHtml(reportName)}</a></p>`,
        `<p><strong>Build report index:</strong> <a href=\"${escapeHtml(buildIndexUrl(config.baseUrl))}\">all builds</a></p>`,
        "",
      ].join("\n"),
    );
    await writeGithubOutput({
      "upload-github-artifact": "false",
      "report-url": reportUrl,
      "index-url": buildIndexUrl(config.baseUrl),
    });
    console.log(`Feature spec report uploaded to ${reportUrl}`);
    return;
  }

  await writeGithubSummary(
    [
      "## Feature Spec Report",
      "",
      `<p>Feature spec report is ready for GitHub artifact upload as <strong>${escapeHtml(reportName)}</strong>.</p>`,
      "",
    ].join("\n"),
  );
  await writeGithubOutput({
    "upload-github-artifact": "true",
    "artifact-name": reportName,
    "artifact-path": reportDir,
  });
}

async function publishReportToFtp(
  reportDir: string,
  config: ReturnType<typeof ftpConfig>,
) {
  const buildsRoot = pathJoin(config.remoteDir, "build");
  const buildRemoteDir = pathJoin(buildsRoot, config.buildNumber);
  await uploadDirectory(reportDir, buildRemoteDir, config);

  const builds = await listBuildNumbers(buildsRoot, config);
  if (!builds.includes(config.buildNumber)) builds.push(config.buildNumber);
  builds.sort((a, b) => Number(b) - Number(a));

  const localIndex = join(
    tmpdir(),
    `feature-spec-md-build-index-${process.pid}.html`,
  );
  await writeFile(localIndex, renderBuildIndex(config.baseUrl, builds), "utf8");
  await uploadFile(localIndex, pathJoin(buildsRoot, "index.html"), config);

  return buildUrl(config.baseUrl, config.buildNumber);
}

function publishMode(value: string): PublishMode {
  if (value === "ftp" || value === "artifact") return value;
  throw new Error(`Unknown report publish mode: ${value}`);
}

function value(
  options: GithubActionReportOptions,
  key: string,
  envKey: string,
) {
  return options[key] ?? process.env[envKey];
}

function renderBuildIndex(baseUrl: string, builds: string[]) {
  const generatedAt = new Date().toISOString();
  const rows = builds
    .map(
      (build) =>
        `<li><a href=\"${escapeHtml(buildUrl(baseUrl, build))}\">Build ${escapeHtml(build)}</a></li>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Feature spec build reports</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
    li { margin: 0.35rem 0; }
  </style>
</head>
<body>
  <h1>Feature spec build reports</h1>
  <p>Generated ${escapeHtml(generatedAt)}.</p>
  <ol>
${rows}
  </ol>
</body>
</html>
`;
}

function buildUrl(baseUrl: string, build: string) {
  return publicUrl(baseUrl, "build", build, "");
}

function buildIndexUrl(baseUrl: string) {
  return publicUrl(baseUrl, "build", "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}
