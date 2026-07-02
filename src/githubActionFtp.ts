import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

export type GithubActionOptions = Record<string, string | undefined>;

export type FtpConfig = {
  host: string;
  user: string;
  password: string;
  port?: string;
  secure: boolean;
  remoteDir: string;
  baseUrl: string;
  buildNumber: string;
  prNumber?: string;
};

export function ftpConfig(options: GithubActionOptions): FtpConfig {
  const host = required(options, "ftp-host", "FEATURE_SPEC_FTP_HOST");
  const user = required(options, "ftp-user", "FEATURE_SPEC_FTP_USER");
  const password = required(
    options,
    "ftp-password",
    "FEATURE_SPEC_FTP_PASSWORD",
  );
  const baseUrl = required(options, "base-url", "FEATURE_SPEC_REPORT_BASE_URL");
  const remoteDir = value(options, "ftp-remote-dir", "FEATURE_SPEC_FTP_REMOTE_DIR") ?? "";
  const buildNumber =
    value(options, "build-number", "FEATURE_SPEC_BUILD_NUMBER") ??
    value(options, "build-number", "GITHUB_RUN_NUMBER") ??
    "local";
  const prNumber = value(options, "pr-number", "FEATURE_SPEC_PR_NUMBER");
  const secure = booleanValue(value(options, "ftp-secure", "FEATURE_SPEC_FTP_SECURE"));
  const port = value(options, "ftp-port", "FEATURE_SPEC_FTP_PORT");

  if (!/^\d+$/.test(buildNumber)) {
    throw new Error(`Build number must be numeric for FTP publishing: ${buildNumber}`);
  }
  if (prNumber !== undefined && !/^\d+$/.test(prNumber)) {
    throw new Error(`Pull request number must be numeric for FTP publishing: ${prNumber}`);
  }

  return { host, user, password, port, secure, remoteDir, baseUrl, buildNumber, prNumber };
}

export async function uploadDirectory(
  localDir: string,
  remoteDir: string,
  config: FtpConfig,
) {
  const files = await walkFiles(localDir);
  if (!files.length) {
    throw new Error(`Report directory contains no files: ${localDir}`);
  }

  for (const file of files) {
    const remotePath = pathJoin(
      remoteDir,
      relative(localDir, file).split(sep).join("/"),
    );
    await uploadFile(file, remotePath, config);
  }
}

export async function uploadFile(
  localFile: string,
  remotePath: string,
  config: FtpConfig,
) {
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

export async function downloadRemoteFile(
  remotePath: string,
  localFile: string,
  config: FtpConfig,
) {
  await mkdir(dirname(localFile), { recursive: true });
  await runCurl([
    "--silent",
    "--show-error",
    "--fail",
    "-u",
    `${config.user}:${config.password}`,
    "-o",
    localFile,
    ftpUrl(config, remotePath),
  ]);
}

export async function listRemoteDirectory(remoteDir: string, config: FtpConfig) {
  const directoryUrl = ftpUrl(config, asDirectoryPath(remoteDir));
  const commonArgs = [
    "--silent",
    "--show-error",
    "--fail",
    "-u",
    `${config.user}:${config.password}`,
  ];

  try {
    return await runCurl([...commonArgs, "--list-only", directoryUrl]);
  } catch {
    return runCurl([...commonArgs, directoryUrl]);
  }
}

export async function listRemoteFilesRecursive(
  remoteDir: string,
  config: FtpConfig,
) {
  const files: string[] = [];
  await visit(remoteDir);
  return files.sort();

  async function visit(dir: string) {
    const listing = await listRemoteDirectory(dir, config);
    const entries = parseDirectoryListing(listing);
    for (const entry of entries) {
      if (entry === "." || entry === "..") continue;
      const child = pathJoin(dir, entry);
      if (looksLikeFile(entry)) {
        files.push(child);
        continue;
      }
      try {
        await visit(child);
      } catch {
        files.push(child);
      }
    }
  }
}

export function parseBuildNumbersFromDirectoryListing(listing: string) {
  return listing
    .split(/\r?\n/)
    .flatMap((line) => {
      const hrefBuilds = Array.from(
        line.matchAll(/href=["'][^"']*?(\d+)\/?["']/gi),
        (match) => match[1],
      );
      const lastToken = line.trim().split(/\s+/).at(-1) ?? "";

      return /^\d+$/.test(lastToken) ? [...hrefBuilds, lastToken] : hrefBuilds;
    })
    .filter((name) => /^\d+$/.test(name));
}

export async function listBuildNumbers(remoteDir: string, config: FtpConfig) {
  try {
    const listing = await listRemoteDirectory(remoteDir, config);
    return Array.from(new Set(parseBuildNumbersFromDirectoryListing(listing)));
  } catch {
    return [];
  }
}

export function pathJoin(...parts: string[]) {
  const joined = parts
    .flatMap((part) => part.split("/"))
    .map((part) => part.trim())
    .filter((part) => part && part !== ".")
    .join("/");
  return joined;
}

export function publicUrl(baseUrl: string, ...parts: string[]) {
  const path = parts
    .flatMap((part) => part.split("/"))
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return path ? `${trimTrailingSlash(baseUrl)}/${path}` : trimTrailingSlash(baseUrl);
}

export function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export async function runCurl(args: string[]) {
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

function parseDirectoryListing(listing: string) {
  return listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/).at(-1) ?? "")
    .filter(Boolean);
}

function looksLikeFile(name: string) {
  return /\.[a-z0-9]+$/i.test(name);
}

function ftpUrl(config: FtpConfig, remotePath: string) {
  const protocol = config.secure ? "ftps" : "ftp";
  const port = config.port ? `:${config.port}` : "";
  const hasTrailingSlash = remotePath.endsWith("/");
  const encodedPath = remotePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const directorySlash = hasTrailingSlash ? "/" : "";
  return `${protocol}://${config.host}${port}/${encodedPath}${directorySlash}`;
}

function asDirectoryPath(remotePath: string) {
  const path = pathJoin(remotePath);
  return path ? `${path}/` : "";
}

function required(options: GithubActionOptions, key: string, envKey: string) {
  const result = value(options, key, envKey);
  if (!result) throw new Error(`Missing required option --${key} or ${envKey}.`);
  return result;
}

function value(options: GithubActionOptions, key: string, envKey: string) {
  return options[key] ?? process.env[envKey];
}

function booleanValue(value: string | undefined) {
  return value === "true" || value === "1" || value === "yes";
}
