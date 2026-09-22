import { appendFile } from "node:fs/promises";
import { Client } from "basic-ftp";
import {
  ftpConnectionConfig,
  listRemoteDirectory,
  pathJoin,
  runCurl,
  runWithConcurrency,
  type FtpConnectionConfig,
  type GithubActionOptions,
} from "./githubActionFtp.js";

export type FtpMaintenanceMode =
  | "smoke-test"
  | "report"
  | "dry-run"
  | "cleanup";

export type FtpInventoryEntry = {
  path: string;
  kind: "file" | "directory";
  sizeBytes: number;
};

export type FtpMaintenanceOptions = GithubActionOptions;

export async function runFtpMaintenance(options: FtpMaintenanceOptions) {
  const connection = ftpConnectionConfig(options);
  const config = {
    ...connection,
    concurrency: maintenanceInteger(
      options["ftp-maintenance-concurrency"] ??
        process.env.FEATURE_SPEC_FTP_MAINTENANCE_CONCURRENCY,
      8,
      "FTP maintenance concurrency",
    ),
    connectTimeoutSeconds: maintenanceInteger(
      options["ftp-maintenance-connect-timeout"] ??
        process.env.FEATURE_SPEC_FTP_MAINTENANCE_CONNECT_TIMEOUT,
      10,
      "FTP maintenance connect timeout",
    ),
    maxTimeSeconds: maintenanceInteger(
      options["ftp-maintenance-max-time"] ??
        process.env.FEATURE_SPEC_FTP_MAINTENANCE_MAX_TIME,
      30,
      "FTP maintenance maximum time",
    ),
  } satisfies FtpConnectionConfig;
  const mode = maintenanceMode(
    options.mode ?? process.env.FEATURE_SPEC_FTP_MODE ?? "report",
  );
  if (mode === "smoke-test") {
    const listing = await listRemoteDirectory(config.remoteDir, config, {
      fallbackToDefaultListing: false,
    });
    const entries = listing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const summary = [
      "## FTP storage smoke test",
      "",
      `- Root: \`${config.remoteDir || "/"}\``,
      `- Transport: **${config.secure ? "FTPS" : "FTP"}**`,
      `- Root listing: **reachable** (${entries.length} entries returned)`,
      "- Result: **credentials, transport, and root listing work**",
    ].join("\n");
    await writeSummary(summary, options, []);
    console.log(summary);
    return { summary, inventory: [], cleanupPaths: [], freeBytes: undefined };
  }
  const keepBuilds = positiveInteger(
    options["keep-builds"] ?? process.env.FEATURE_SPEC_FTP_KEEP_BUILDS,
    30,
  );
  const maxBuildsToScan = optionalPositiveInteger(
    options["max-builds-to-scan"] ??
      process.env.FEATURE_SPEC_FTP_MAX_BUILDS_TO_SCAN,
    "Maximum builds to scan",
  );
  const maxBuildsToDelete = positiveInteger(
    options["max-builds-to-delete"] ??
      process.env.FEATURE_SPEC_FTP_MAX_BUILDS_TO_DELETE,
    10,
  );
  const requestedPaths = csv(
    options.paths ?? process.env.FEATURE_SPEC_FTP_PATHS,
  );
  const retentionCleanup =
    (mode === "cleanup" || mode === "dry-run") && !requestedPaths.length;
  const retentionPaths = retentionCleanup
    ? await discoverRetentionCleanupPaths(
        config.remoteDir,
        config,
        keepBuilds,
        maxBuildsToDelete,
      )
    : [];
  const effectivePaths = retentionCleanup
    ? retentionPaths.map((path) => relativeChildPath(config.remoteDir, path))
    : requestedPaths;
  const inventoryRoots = maintenanceInventoryRoots(mode, effectivePaths);
  const inventory =
    retentionCleanup && !effectivePaths.length
      ? []
      : await inventoryRemoteDirectory(
          config.remoteDir,
          config,
          retentionCleanup ? undefined : maxBuildsToScan,
          inventoryRoots,
          effectivePaths,
          effectivePaths.length > 0,
        );
  const freeBytes = await remoteFreeBytes(config.remoteDir, config);
  const cleanupPaths =
    mode === "report"
      ? []
      : retentionCleanup
        ? retentionPaths
        : cleanupCandidates(
            inventory,
            config.remoteDir,
            keepBuilds,
            requestedPaths,
          );
  let completedCleanupPaths = cleanupPaths;

  if (mode === "cleanup" && !requestedPaths.length && keepBuilds < 1) {
    throw new Error("Cleanup requires --keep-builds of at least 1 or --paths.");
  }
  if (mode === "cleanup") {
    await deletePaths(cleanupPaths, inventory, config);
  }

  const afterInventory = mode === "cleanup" ? [] : inventory;
  if (mode === "cleanup") {
    const remainingPaths = await waitForRemotePathsToDisappear(
      cleanupPaths,
      config,
    );
    const pathsWithFiles = await remotePathsContainingFiles(
      remainingPaths,
      config,
    );
    completedCleanupPaths = cleanupPaths.filter(
      (path) => !pathsWithFiles.includes(path),
    );
    const emptyRoots = remainingPaths.filter(
      (path) => !pathsWithFiles.includes(path),
    );
    if (emptyRoots.length) {
      console.warn(
        `FTP retained empty directory names after removing their report files: ${emptyRoots.join(", ")}`,
      );
    }
    if (pathsWithFiles.length) {
      const message = `FTP cleanup did not remove report files from: ${pathsWithFiles.join(", ")}`;
      if (requestedPaths.length) throw new Error(message);
      console.warn(
        `${message}. They will be retried by a later retention run.`,
      );
    }
  }
  const summary = formatSummary({
    config,
    mode,
    keepBuilds,
    maxBuildsToDelete,
    maxBuildsToScan,
    requestedPaths,
    inventoryRoots,
    inventory,
    cleanupPaths: completedCleanupPaths,
    freeBytes,
    afterInventory,
  });
  await writeSummary(summary, options, completedCleanupPaths);
  console.log(summary);
  return {
    summary,
    inventory,
    cleanupPaths: completedCleanupPaths,
    freeBytes,
  };
}

export function parseFtpSizeResponse(response: string) {
  const match = response.match(/(?:^|\s)(\d+)\s*$/m);
  return match ? Number(match[1]) : undefined;
}

export function parseFtpHeadSize(response: string) {
  const match = response.match(/^Size:\s*(\d+)\s*$/im);
  return match ? Number(match[1]) : parseFtpSizeResponse(response);
}

export function maintenanceInventoryRoots(
  mode: FtpMaintenanceMode,
  requestedPaths: string[],
) {
  if (mode === "report" || mode === "smoke-test") return undefined;
  return Array.from(
    new Set([
      "build",
      "pr",
      ...requestedPaths.map((item) => item.split("/")[0]),
    ]),
  );
}

async function inventoryRemoteDirectory(
  remoteDir: string,
  config: FtpConnectionConfig,
  maxBuildsToScan?: number,
  inventoryRoots?: string[],
  requestedPaths: string[] = [],
  restrictToRequestedPaths = false,
): Promise<FtpInventoryEntry[]> {
  const entries: FtpInventoryEntry[] = [];
  const runLimited = concurrencyLimiter(config.concurrency);
  await visit(remoteDir);
  return entries.sort((a, b) => a.path.localeCompare(b.path));

  async function visit(directory: string, knownListing?: string) {
    const listing =
      knownListing ??
      (await runLimited(() =>
        listRemoteDirectory(directory, config, {
          fallbackToDefaultListing: false,
        }),
      ));
    const names = parseMaintenanceListingNames(listing);
    const buildRoot = pathJoin(remoteDir, "build");
    const scopedNames =
      directory === remoteDir && inventoryRoots !== undefined
        ? names.filter((name) => inventoryRoots.includes(name))
        : names;
    const selectedNames = selectMaintenanceNames(
      scopedNames,
      directory,
      remoteDir,
      directory === buildRoot ? maxBuildsToScan : undefined,
      requestedPaths,
      restrictToRequestedPaths,
    );
    await runWithConcurrency(
      selectedNames,
      config.concurrency,
      async (name) => {
        const child = pathJoin(directory, name);
        let childListing: string;
        try {
          childListing = await runLimited(() =>
            listRemoteDirectory(child, config, {
              fallbackToDefaultListing: false,
            }),
          );
        } catch {
          const sizeBytes = await runLimited(() =>
            remoteFileSize(child, config),
          );
          entries.push({
            path: child,
            kind: "file",
            sizeBytes: sizeBytes ?? 0,
          });
          return;
        }
        entries.push({ path: child, kind: "directory", sizeBytes: 0 });
        await visit(child, childListing);
      },
    );
  }
}

export function concurrencyLimiter(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Concurrency limit must be a positive integer: ${limit}`);
  }
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function runLimited<T>(operation: () => Promise<T>) {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      return await operation();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

async function discoverRetentionCleanupPaths(
  remoteDir: string,
  config: FtpConnectionConfig,
  keepBuilds: number,
  maxBuildsToDelete: number,
) {
  const buildRoot = pathJoin(remoteDir, "build");
  const buildNames = await listMaintenanceNames(buildRoot, config);
  const expiredBuilds = selectExpiredBuildBatch(
    buildNames,
    keepBuilds,
    maxBuildsToDelete,
    Number(process.env.GITHUB_RUN_NUMBER ?? 0),
  );
  if (!expiredBuilds.length) return [];

  const expired = new Set(expiredBuilds);
  const prRoot = pathJoin(remoteDir, "pr");
  const pullRequests = (await listMaintenanceNames(prRoot, config)).filter(
    (name) => /^\d+$/.test(name),
  );
  const pullRequestReports: string[] = [];
  await runWithConcurrency(
    pullRequests,
    config.concurrency,
    async (pullRequest) => {
      const directory = pathJoin(prRoot, pullRequest);
      const reportBuilds = await listMaintenanceNames(directory, config);
      for (const build of reportBuilds) {
        if (expired.has(build)) {
          pullRequestReports.push(pathJoin(directory, build));
        }
      }
    },
  );

  const reportsByBuild = new Map<string, string[]>();
  for (const report of pullRequestReports.sort()) {
    const build = pathJoin(report).split("/").at(-1);
    if (build) {
      reportsByBuild.set(build, [...(reportsByBuild.get(build) ?? []), report]);
    }
  }
  return expiredBuilds.map(
    (build) => reportsByBuild.get(build)?.[0] ?? pathJoin(buildRoot, build),
  );
}

async function listMaintenanceNames(
  directory: string,
  config: FtpConnectionConfig,
) {
  const listing = await listRemoteDirectory(directory, config, {
    fallbackToDefaultListing: false,
  });
  return parseMaintenanceListingNames(listing);
}

export function selectExpiredBuildBatch(
  names: string[],
  keepBuilds: number,
  maxBuildsToDelete: number,
  batchIndex = 0,
) {
  const expired = Array.from(new Set(names))
    .filter((name) => /^\d+$/.test(name))
    .sort((a, b) => Number(b) - Number(a))
    .slice(keepBuilds)
    .sort((a, b) => Number(a) - Number(b));
  if (!expired.length) return [];
  const batchCount = Math.ceil(expired.length / maxBuildsToDelete);
  const normalizedBatch =
    ((Math.trunc(batchIndex) % batchCount) + batchCount) % batchCount;
  const start = normalizedBatch * maxBuildsToDelete;
  return expired.slice(start, start + maxBuildsToDelete);
}

export function parseMaintenanceListingNames(listing: string) {
  return listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/).at(-1) ?? "")
    .map((name) => name.split("/").filter(Boolean).at(-1) ?? "")
    .filter((name) => name && name !== "." && name !== "..");
}

export function selectMaintenanceNames(
  names: string[],
  directory: string,
  remoteDir: string,
  maximumNumberedEntries: number | undefined,
  requestedPaths: string[],
  restrictToRequestedPaths = false,
) {
  const availableNames = Array.from(new Set(names));
  const boundedNames =
    maximumNumberedEntries === undefined
      ? availableNames
      : availableNames
          .filter((name) => /^\d+$/.test(name))
          .sort((a, b) => Number(b) - Number(a))
          .slice(0, maximumNumberedEntries);
  const relativeDirectory =
    directory === remoteDir
      ? ""
      : directory.startsWith(`${remoteDir}/`)
        ? directory.slice(remoteDir.length + 1)
        : directory;
  const prefix = relativeDirectory ? `${relativeDirectory}/` : "";
  const requestedNames = requestedPaths.flatMap((requestedPath) => {
    if (!requestedPath.startsWith(prefix)) return [];
    const remainder = requestedPath.slice(prefix.length);
    const child = remainder.split("/")[0];
    return child ? [child] : [];
  });
  const withinRequestedPath = requestedPaths.some(
    (requestedPath) =>
      relativeDirectory === requestedPath ||
      relativeDirectory.startsWith(`${requestedPath}/`),
  );
  if (
    restrictToRequestedPaths &&
    maximumNumberedEntries === undefined &&
    !withinRequestedPath
  ) {
    return Array.from(
      new Set(requestedNames.filter((name) => availableNames.includes(name))),
    );
  }
  return Array.from(
    new Set([
      ...boundedNames,
      ...requestedNames.filter((name) => availableNames.includes(name)),
    ]),
  );
}

async function remoteFileSize(remotePath: string, config: FtpConnectionConfig) {
  try {
    const response = await runCurl(ftpArgs(config, ["--head"], remotePath));
    return parseFtpHeadSize(response);
  } catch {
    return undefined;
  }
}

function maintenanceInteger(
  value: string | undefined,
  fallback: number,
  label: string,
) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive integer: ${value}`);
  }
  return Number(value);
}

function optionalPositiveInteger(value: string | undefined, label: string) {
  if (value === undefined || value === "") return undefined;
  return maintenanceInteger(value, 1, label);
}

async function remoteFreeBytes(remoteDir: string, config: FtpConnectionConfig) {
  for (const command of ["SITE AVAIL", "STAT -f"]) {
    try {
      const response = await runCurl(
        ftpArgs(config, ["--quote", command, "--head"], remoteDir),
      );
      const size = parseFtpSizeResponse(response);
      if (size !== undefined) return size;
    } catch {
      // FTP has no portable free-space command; unsupported servers are normal.
    }
  }
  return undefined;
}

export function cleanupCandidates(
  inventory: FtpInventoryEntry[],
  root: string,
  keepBuilds: number,
  requestedPaths: string[],
) {
  const exact = requestedPaths.map((item) => safeChildPath(root, item));
  const buildRoot = pathJoin(root, "build");
  const builds = inventory
    .filter(
      (entry) =>
        entry.kind === "directory" && entry.path.startsWith(`${buildRoot}/`),
    )
    .map((entry) => entry.path.slice(buildRoot.length + 1).split("/")[0])
    .filter((name) => /^\d+$/.test(name));
  const oldBuilds = Array.from(new Set(builds))
    .sort((a, b) => Number(b) - Number(a))
    .slice(keepBuilds);
  const oldBuildSet = new Set(oldBuilds);
  const oldBuildPaths = oldBuilds.map((name) => pathJoin(buildRoot, name));
  const normalizedRoot = pathJoin(root);
  const oldPullRequestReportPaths = inventory
    .filter((entry) => entry.kind === "directory")
    .map((entry) => {
      const relative = entry.path.startsWith(`${normalizedRoot}/`)
        ? entry.path.slice(normalizedRoot.length + 1)
        : entry.path;
      const match = relative.match(/^pr\/\d+\/(\d+)$/);
      return match && oldBuildSet.has(match[1]) ? entry.path : undefined;
    })
    .filter((path): path is string => path !== undefined);
  return Array.from(
    new Set([...oldBuildPaths, ...oldPullRequestReportPaths, ...exact]),
  );
}

async function deletePaths(
  paths: string[],
  inventory: FtpInventoryEntry[],
  config: FtpConnectionConfig,
) {
  const targets = presentCleanupTargets(paths, inventory);
  if (!targets.length) return;
  for (const group of groupCleanupTargetsByBuild(targets)) {
    const client = new Client(config.maxTimeSeconds * 1000);
    await client.access({
      host: config.host,
      port: config.port ? Number(config.port) : undefined,
      user: config.user,
      password: config.password,
      secure: config.secure ? "implicit" : false,
    });
    try {
      for (const target of group) {
        const normalizedTarget = `/${pathJoin(target)}`;
        const tombstone = `${normalizedTarget}.feature-spec-cleanup-${Date.now()}`;
        await client.cd(normalizedTarget);
        await client.clearWorkingDir();
        await client.cd("/");
        await client.rename(normalizedTarget, tombstone);
      }
    } finally {
      client.close();
    }
  }
}

async function waitForRemotePathsToDisappear(
  paths: string[],
  config: FtpConnectionConfig,
) {
  const deadline = Date.now() + 120_000;
  let remaining = await existingRemotePaths(paths, config);
  while (remaining.length && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    remaining = await existingRemotePaths(paths, config);
  }
  return remaining;
}

async function remotePathsContainingFiles(
  paths: string[],
  config: FtpConnectionConfig,
) {
  if (!paths.length) return [];
  const relativePaths = paths.map((path) =>
    relativeChildPath(config.remoteDir, path),
  );
  const inventory = await inventoryRemoteDirectory(
    config.remoteDir,
    config,
    undefined,
    maintenanceInventoryRoots("cleanup", relativePaths),
    relativePaths,
    true,
  );
  return paths.filter((target) =>
    inventory.some(
      (entry) => entry.kind === "file" && entry.path.startsWith(`${target}/`),
    ),
  );
}

export function presentCleanupTargets(
  paths: string[],
  inventory: FtpInventoryEntry[],
) {
  return paths.filter((target) =>
    inventory.some(
      (entry) => entry.path === target || entry.path.startsWith(`${target}/`),
    ),
  );
}

export function groupCleanupTargetsByBuild(paths: string[]) {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const key = pathJoin(path).split("/").at(-1);
    if (!key) throw new Error(`Cannot group an empty FTP path: ${path}`);
    groups.set(key, [...(groups.get(key) ?? []), path]);
  }
  return Array.from(groups.values());
}

async function existingRemotePaths(
  paths: string[],
  config: FtpConnectionConfig,
) {
  const groups = groupFtpPathsByParent(paths);
  const existing: string[] = [];
  await runWithConcurrency(groups, config.concurrency, async (group) => {
    const available = new Set(await listMaintenanceNames(group.parent, config));
    for (const item of group.items) {
      if (available.has(item.name)) existing.push(item.path);
    }
  });
  return existing.sort();
}

export function groupFtpPathsByParent(paths: string[]) {
  const groups = new Map<string, Array<{ name: string; path: string }>>();
  for (const path of paths) {
    const normalized = pathJoin(path);
    const name = normalized.split("/").at(-1);
    if (!name) throw new Error(`Cannot inspect an empty FTP path: ${path}`);
    const parent = ftpParentPath(normalized);
    groups.set(parent, [...(groups.get(parent) ?? []), { name, path }]);
  }
  return Array.from(groups, ([parent, items]) => ({ parent, items }));
}

function ftpParentPath(remotePath: string) {
  const parts = pathJoin(remotePath).split("/");
  parts.pop();
  return parts.join("/");
}

function formatSummary(input: {
  config: FtpConnectionConfig;
  mode: FtpMaintenanceMode;
  keepBuilds: number;
  maxBuildsToDelete: number;
  maxBuildsToScan?: number;
  requestedPaths: string[];
  inventoryRoots?: string[];
  inventory: FtpInventoryEntry[];
  cleanupPaths: string[];
  freeBytes?: number;
  afterInventory: FtpInventoryEntry[];
}) {
  const lines = [
    "## FTP storage diagnostic",
    "",
    `- Mode: **${input.mode}**`,
    `- Root: \`${input.config.remoteDir || "/"}\``,
    `- Scan scope: **${input.inventoryRoots?.map((item) => `\`${item}\``).join(", ") ?? "all top-level paths"}**`,
    `- Build scan: **${input.maxBuildsToScan === undefined ? "all numbered builds" : `newest ${input.maxBuildsToScan} numbered build${input.maxBuildsToScan === 1 ? "" : "s"}`}**`,
    `- Cleanup batch: **at most ${input.maxBuildsToDelete} expired builds**`,
    `- Files: **${input.inventory.filter((entry) => entry.kind === "file").length}**`,
    `- Used: **${formatBytes(totalBytes(input.inventory))}**`,
    `- Available: **${input.freeBytes === undefined ? "not reported by server" : formatBytes(input.freeBytes)}**`,
    "",
    "### Directory usage",
    "",
    "| Directory | Files | Size |",
    "| --- | ---: | ---: |",
    ...directoryRows(input.inventory, input.config.remoteDir),
    "",
    "### Cleanup",
    "",
    input.cleanupPaths.length
      ? `The following paths ${input.mode === "cleanup" ? "were deleted or were already absent" : "would be deleted"}:`
      : "No cleanup paths selected.",
    ...input.cleanupPaths.map((path) => `- \`${path}\``),
  ];
  if (input.mode === "cleanup") {
    lines.push(
      "",
      `After cleanup: **${formatBytes(totalBytes(input.afterInventory))}** used across **${input.afterInventory.filter((entry) => entry.kind === "file").length}** files.`,
    );
  } else {
    lines.push(
      "",
      `Build retention: keep the newest **${input.keepBuilds}** numbered builds.`,
    );
  }
  return lines.join("\n");
}

function directoryRows(inventory: FtpInventoryEntry[], root: string) {
  const rows = new Map<string, { files: number; bytes: number }>();
  for (const entry of inventory.filter((item) => item.kind === "file")) {
    const relative = entry.path.startsWith(`${root}/`)
      ? entry.path.slice(root.length + 1)
      : entry.path;
    const parts = relative.split("/");
    parts.pop();
    for (let index = 0; index <= parts.length; index += 1) {
      const directory = index
        ? `${root}/${parts.slice(0, index).join("/")}`
        : root || "/";
      const current = rows.get(directory) ?? { files: 0, bytes: 0 };
      current.files += 1;
      current.bytes += entry.sizeBytes;
      rows.set(directory, current);
    }
  }
  return Array.from(rows.entries())
    .sort(([, a], [, b]) => b.bytes - a.bytes)
    .map(
      ([directory, value]) =>
        `| \`${directory || "/"}\` | ${value.files} | ${formatBytes(value.bytes)} |`,
    );
}

function totalBytes(inventory: FtpInventoryEntry[]) {
  return inventory.reduce(
    (sum, entry) => sum + (entry.kind === "file" ? entry.sizeBytes : 0),
    0,
  );
}

function ftpArgs(
  config: FtpConnectionConfig,
  args: string[],
  remotePath: string,
) {
  const protocol = config.secure ? "ftps" : "ftp";
  const port = config.port ? `:${config.port}` : "";
  const encodedPath = remotePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const directorySlash = remotePath.endsWith("/") && encodedPath ? "/" : "";
  return [
    "--silent",
    "--show-error",
    "--fail",
    "--connect-timeout",
    String(config.connectTimeoutSeconds),
    "--max-time",
    String(config.maxTimeSeconds),
    "--retry",
    "1",
    "--retry-all-errors",
    "--retry-delay",
    "1",
    "-u",
    `${config.user}:${config.password}`,
    ...args,
    `${protocol}://${config.host}${port}/${encodedPath}${directorySlash}`,
  ];
}

function safeChildPath(root: string, value: string) {
  if (!value || value.startsWith("/") || value.split("/").includes("..")) {
    throw new Error(`Cleanup path must be relative to the FTP root: ${value}`);
  }
  return pathJoin(root, value);
}

function relativeChildPath(root: string, value: string) {
  const normalizedRoot = pathJoin(root);
  const normalizedValue = pathJoin(value);
  if (!normalizedRoot) return normalizedValue;
  if (!normalizedValue.startsWith(`${normalizedRoot}/`)) {
    throw new Error(`FTP path is outside the configured root: ${value}`);
  }
  return normalizedValue.slice(normalizedRoot.length + 1);
}

function maintenanceMode(value: string | undefined): FtpMaintenanceMode {
  if (
    value === "smoke-test" ||
    value === "report" ||
    value === "dry-run" ||
    value === "cleanup"
  )
    return value;
  throw new Error(`Unknown FTP maintenance mode: ${value ?? ""}`);
}

function positiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value))
    throw new Error(`Expected a non-negative integer: ${value}`);
  return Number(value);
}

function csv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = "B";
  for (const next of units) {
    value /= 1024;
    unit = next;
    if (value < 1024) break;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

async function writeSummary(
  summary: string,
  options: GithubActionOptions,
  cleanupPaths: string[],
) {
  const file = options["summary-file"] ?? process.env.GITHUB_STEP_SUMMARY;
  if (file) await appendFile(file, `${summary}\n`);
  const output = options["output-file"] ?? process.env.GITHUB_OUTPUT;
  if (output)
    await appendFile(
      output,
      `ftp-summary<<FEATURE_SPEC_FTP_SUMMARY\n${summary}\nFEATURE_SPEC_FTP_SUMMARY\n` +
        `ftp-cleanup-paths<<FEATURE_SPEC_FTP_CLEANUP_PATHS\n${JSON.stringify(cleanupPaths)}\nFEATURE_SPEC_FTP_CLEANUP_PATHS\n`,
    );
}
