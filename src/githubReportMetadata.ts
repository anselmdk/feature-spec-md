import { execFile } from "node:child_process";
import { readFile, readFileSync } from "node:fs";
import { promisify } from "node:util";
import type { ReportMetadataItem } from "./reportMetadata.js";

const execFileAsync = promisify(execFile);

export type GithubReportMetadataOptions = {
  includeGitFallbacks?: boolean;
};

export async function githubReportMetadata(
  options: GithubReportMetadataOptions = {},
): Promise<ReportMetadataItem[]> {
  const event = await readGithubEvent();
  return buildGithubReportMetadata({
    event,
    repository:
      process.env.GITHUB_REPOSITORY ??
      (options.includeGitFallbacks ? await gitRemoteUrl() : undefined),
    fallbackBranch: options.includeGitFallbacks
      ? await gitValue(["rev-parse", "--abbrev-ref", "HEAD"])
      : undefined,
    fallbackSha: options.includeGitFallbacks
      ? await gitValue(["rev-parse", "HEAD"])
      : undefined,
  });
}

export function githubReportMetadataFromEnv(): ReportMetadataItem[] {
  return buildGithubReportMetadata({
    event: readGithubEventSync(),
    repository: process.env.GITHUB_REPOSITORY,
  });
}

type GithubPullRequestMetadata = {
  number: string;
  branch?: string;
  url?: string;
};

type GithubReportMetadataInput = {
  event?: unknown;
  repository?: string;
  fallbackBranch?: string;
  fallbackSha?: string;
};

function buildGithubReportMetadata({
  event,
  repository,
  fallbackBranch,
  fallbackSha,
}: GithubReportMetadataInput): ReportMetadataItem[] {
  const pullRequest = githubPullRequestFromEvent(event);
  const githubBaseUrl = repository ? githubBaseUrlFromRepository(repository) : undefined;
  const branch = githubBranchFromEnv(pullRequest) ?? fallbackBranch;
  const buildNumber =
    process.env.FEATURE_SPEC_BUILD_NUMBER ??
    process.env.GITHUB_RUN_NUMBER ??
    process.env.BUILD_NUMBER;
  const runId = process.env.GITHUB_RUN_ID;
  const sha = process.env.GITHUB_SHA ?? fallbackSha;
  const prNumber = process.env.FEATURE_SPEC_PR_NUMBER ?? pullRequest?.number;

  const metadata: ReportMetadataItem[] = [];
  if (branch) {
    metadata.push({
      label: "Branch",
      value: branch,
      url: githubBaseUrl ? `${githubBaseUrl}/tree/${encodeGithubPath(branch)}` : undefined,
    });
  }
  if (buildNumber) {
    metadata.push({
      label: "Build",
      value: buildNumber,
      url: githubBaseUrl && runId ? `${githubBaseUrl}/actions/runs/${runId}` : undefined,
    });
  }
  if (sha) {
    metadata.push({
      label: "Commit",
      value: shortSha(sha),
      url: githubBaseUrl ? `${githubBaseUrl}/commit/${sha}` : undefined,
    });
  }
  if (prNumber) {
    metadata.push({
      label: "Pull request",
      value: `#${prNumber}`,
      url: pullRequest?.url ?? (githubBaseUrl ? `${githubBaseUrl}/pull/${prNumber}` : undefined),
    });
  }

  return metadata;
}

async function readGithubEvent(): Promise<unknown> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return undefined;

  try {
    return JSON.parse(await readFileAsync(eventPath, "utf8"));
  } catch {
    return undefined;
  }
}

function readGithubEventSync(): unknown {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return undefined;

  try {
    return JSON.parse(readFileSync(eventPath, "utf8"));
  } catch {
    return undefined;
  }
}

function githubPullRequestFromEvent(
  event: unknown,
): GithubPullRequestMetadata | undefined {
  if (!isRecord(event) || !isRecord(event.pull_request)) return undefined;
  const pullRequest = event.pull_request;
  const number = stringValue(pullRequest.number);
  if (!number) return undefined;

  return {
    number,
    branch: isRecord(pullRequest.head)
      ? stringValue(pullRequest.head.ref)
      : undefined,
    url: stringValue(pullRequest.html_url),
  };
}

function githubBranchFromEnv(pullRequest: GithubPullRequestMetadata | undefined) {
  if (pullRequest?.branch) return pullRequest.branch;
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  const ref = process.env.GITHUB_REF;
  return ref?.replace(/^refs\/(heads|tags)\//, "").replace(/^refs\/pull\/(\d+)\/merge$/, "PR #$1");
}

function githubBaseUrlFromRepository(repository: string) {
  const trimmed = repository.trim().replace(/\.git$/, "");
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  if (trimmed.startsWith("git@github.com:")) {
    return `https://github.com/${trimmed.slice("git@github.com:".length)}`;
  }
  return `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${trimmed}`;
}

async function gitRemoteUrl() {
  return gitValue(["remote", "get-url", "origin"]);
}

async function gitValue(args: string[]) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: process.cwd() });
    const value = stdout.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function readFileAsync(path: string, encoding: BufferEncoding) {
  return new Promise<string>((resolve, reject) => {
    readFile(path, encoding, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function encodeGithubPath(value: string) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function shortSha(value: string) {
  return value.slice(0, 7);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}
