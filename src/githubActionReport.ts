import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { tmpdir } from "node:os";

export type GithubActionReportOptions = Record<string, string | undefined>;

type PublishMode = "artifact" | "ftp";

type FtpConfig = {
  host: string;
  user: string;
  password: string;
  port?: string;
  secure: boolean;
  remoteDir: string;
  baseUrl: string;
  buildNumber: string;
};

export async function publishGithubActionReport(
  options: GithubActionReportOptions,
) {
  const reportDir = value(options, "report-dir", "FEATURE_SPEC_REPORT_DIR") ??
    "test-results/spec-report";
  const reportName = value(options, "name", "FEATURE_SPEC_REPORT_NAME") ??
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
        `<p><strong>Report index:</strong> <a href=\"${escapeHtml(indexUrl(config.baseUrl))}\">all builds</a></p>`,
        "",
      ].join("\n"),
    );
    await writeGithubOutput({
      "upload-github-artifact": "false",
      "report-url": reportUrl,
      "index-url": indexUrl(config.baseUrl),
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

async function publishReportToFtp(reportDir: string, config: FtpConfig) {
  const buildRemoteDir = pathJoin(config.remoteDir, config.buildNumber);
  await uploadDirectory(reportDir, buildRemoteDir, config);

  const builds = await listBuildNumbers(config.remoteDir, config);
  if (!builds.includes(config.buildNumber)) builds.push(config.buildNumber);
  builds.sort((a, b) => Number(b) - Number(a));

  const localIndex = join(
    tmpdir(),
    `feature-spec-md-build-index-${process.pid}.html`,
  );
  await writeFile(localIndex, renderBuildIndex(config.baseUrl, builds), "utf8");
  await uploadFile(localIndex, pathJoin(config.remoteDir, "index.html"), config);

  return `${trimTrailingSlash(config.baseUrl)}/${encodeURIComponent(config.buildNumber)}/`;
}

async function uploadDirectory(
  localDir: string,
  remoteDir: string,
  config: FtpConfig,
) {
  const files = await walkFiles(localDir);
  if (!files.length) {
    throw new Error(`Report directory contains no files: ${localDir}`);
  }

  for (const file of files) {
    const remotePath = pathJoin(remoteDir, relative(localDir, file).split(sep).join("/"));
    await uploadFile(file, remotePath, config);
  }
}

async function uploadFile(localFile: string, remotePath: string, config: FtpConfig) {
  await runCurl([
    "--silent",
    "--show-error",
    "--fail",
    "--ftp-create-dirs",
    "-u",
    `${config.user}:${config.password}`,
    "-T",
    localFile,
    ftpUrl(config, remotePath),
  ]);
}

async function listBuildNumbers(remoteDir: string, config: FtpConfig) {
  try {
    const listing = await runCurl([
      "--silent",
      "--show-error",
      "--fail",
      "-u",
      `${config.user}:${config.password}`,
      ftpUrl(config, pathJoin(remoteDir, "/")),
    ]);
    return Array.from(
      new Set(
        listing
          .split(/\r?\n/)
          .map((line) => line.trim().split(/\s+/).at(-1) ?? "")
          .filter((name) => /^\d+$/.test(name)),
      ),
    );
  } catch {
    return [];
  }
}

async function runCurl(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || `curl exited with status ${code}`));
    });
  });
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(fullPath);
      if (entry.isFile()) return [fullPath];
      return [];
    }),
  );
  return files.flat();
}

function ftpConfig(options: GithubActionReportOptions): FtpConfig {
  const host = required(options, "ftp-host", "FEATURE_SPEC_FTP_HOST");
  const user = required(options, "ftp-user", "FEATURE_SPEC_FTP_USER");
  const password = required(
    options,
    "ftp-password",
    "FEATURE_SPEC_FTP_PASSWORD",
  );
  const baseUrl = required(options, "base-url", "FEATURE_SPEC_REPORT_BASE_URL");
  const remoteDir = value(options, "ftp-remote-dir", "FEATURE_SPEC_FTP_REMOTE_DIR") ??
    ".";
  const buildNumber = value(options, "build-number", "GITHUB_RUN_NUMBER") ??
    value(options, "build-number", "FEATURE_SPEC_BUILD_NUMBER") ??
    "local";
  const secure = booleanValue(
    value(options, "ftp-secure", "FEATURE_SPEC_FTP_SECURE"),
  );
  const port = value(options, "ftp-port", "FEATURE_SPEC_FTP_PORT");

  if (!/^\d+$/.test(buildNumber)) {
    throw new Error(`Build number must be numeric for FTP publishing: ${buildNumber}`);
  }

  return { host, user, password, port, secure, remoteDir, baseUrl, buildNumber };
}

function publishMode(value: string): PublishMode {
  if (value === "ftp" || value === "artifact") return value;
  throw new Error(`Unknown report publish mode: ${value}`);
}

function required(
  options: GithubActionReportOptions,
  key: string,
  envKey: string,
) {
  const result = value(options, key, envKey);
  if (!result) throw new Error(`Missing required option --${key} or ${envKey}.`);
  return result;
}

function value(
  options: GithubActionReportOptions,
  key: string,
  envKey: string,
) {
  return options[key] ?? process.env[envKey];
}

function booleanValue(value: string | undefined) {
  return value === "true" || value === "1" || value === "yes";
}

function ftpUrl(config: FtpConfig, remotePath: string) {
  const protocol = config.secure ? "ftps" : "ftp";
  const port = config.port ? `:${config.port}` : "";
  return `${protocol}://${config.host}${port}/${remotePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/")}`;
}

function pathJoin(...parts: string[]) {
  const joined = parts
    .flatMap((part) => part.split("/"))
    .filter((part, index) => part || index === 0)
    .join("/");
  return joined || ".";
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
  <title>Feature spec reports</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
    li { margin: 0.35rem 0; }
  </style>
</head>
<body>
  <h1>Feature spec reports</h1>
  <p>Generated ${escapeHtml(generatedAt)}.</p>
  <ol>
${rows}
  </ol>
</body>
</html>
`;
}

function buildUrl(baseUrl: string, build: string) {
  return `${trimTrailingSlash(baseUrl)}/${encodeURIComponent(build)}/`;
}

function indexUrl(baseUrl: string) {
  return `${trimTrailingSlash(baseUrl)}/`;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

async function writeGithubSummary(markdown: string) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  await mkdir(join(summaryPath, ".."), { recursive: true });
  const existing = await readTextIfExists(summaryPath);
  await writeFile(summaryPath, `${existing}${markdown}`, "utf8");
}

async function writeGithubOutput(values: Record<string, string>) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const existing = await readTextIfExists(outputPath);
  await writeFile(outputPath, `${existing}${lines}\n`, "utf8");
}

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}
