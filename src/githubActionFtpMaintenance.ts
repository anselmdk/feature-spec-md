import { appendFile } from "node:fs/promises";
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
  const requestedPaths = csv(
    options.paths ?? process.env.FEATURE_SPEC_FTP_PATHS,
  );
  if (mode === "cleanup" && maxBuildsToScan !== undefined) {
    throw new Error(
      "--max-builds-to-scan is only supported for report and dry-run modes.",
    );
  }
  const inventory = await inventoryRemoteDirectory(
    config.remoteDir,
    config,
    maxBuildsToScan,
  );
  const freeBytes = await remoteFreeBytes(config.remoteDir, config);
  const cleanupPaths =
    mode === "report"
      ? []
      : cleanupCandidates(
          inventory,
          config.remoteDir,
          keepBuilds,
          requestedPaths,
        );

  if (mode === "cleanup" && !requestedPaths.length && keepBuilds < 1) {
    throw new Error("Cleanup requires --keep-builds of at least 1 or --paths.");
  }
  if (mode === "cleanup") {
    await deletePaths(cleanupPaths, inventory, config);
  }

  const afterInventory =
    mode === "cleanup"
      ? await inventoryRemoteDirectory(config.remoteDir, config)
      : inventory;
  const summary = formatSummary({
    config,
    mode,
    keepBuilds,
    maxBuildsToScan,
    requestedPaths,
    inventory,
    cleanupPaths,
    freeBytes,
    afterInventory,
  });
  await writeSummary(summary, options, cleanupPaths);
  console.log(summary);
  return { summary, inventory, cleanupPaths, freeBytes };
}

export function parseFtpSizeResponse(response: string) {
  const match = response.match(/(?:^|\s)(\d+)\s*$/m);
  return match ? Number(match[1]) : undefined;
}

export function parseFtpHeadSize(response: string) {
  const match = response.match(/^Size:\s*(\d+)\s*$/im);
  return match ? Number(match[1]) : parseFtpSizeResponse(response);
}

async function inventoryRemoteDirectory(
  remoteDir: string,
  config: FtpConnectionConfig,
  maxBuildsToScan?: number,
): Promise<FtpInventoryEntry[]> {
  const entries: FtpInventoryEntry[] = [];
  await visit(remoteDir);
  return entries.sort((a, b) => a.path.localeCompare(b.path));

  async function visit(directory: string) {
    const listing = await listRemoteDirectory(directory, config, {
      fallbackToDefaultListing: false,
    });
    const names = listing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/).at(-1) ?? "")
      .filter((name) => name && name !== "." && name !== "..");
    const buildRoot = pathJoin(remoteDir, "build");
    const selectedNames =
      directory === buildRoot && maxBuildsToScan !== undefined
        ? Array.from(new Set(names))
            .filter((name) => /^\d+$/.test(name))
            .sort((a, b) => Number(b) - Number(a))
            .slice(0, maxBuildsToScan)
        : Array.from(new Set(names));
    await runWithConcurrency(
      selectedNames,
      config.concurrency,
      async (name) => {
        const child = pathJoin(directory, name);
        try {
          await listRemoteDirectory(child, config, {
            fallbackToDefaultListing: false,
          });
          entries.push({ path: child, kind: "directory", sizeBytes: 0 });
          await visit(child);
        } catch {
          const sizeBytes = (await remoteFileSize(child, config)) ?? 0;
          entries.push({ path: child, kind: "file", sizeBytes });
        }
      },
    );
  }
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

function cleanupCandidates(
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
    .slice(keepBuilds)
    .map((name) => pathJoin(buildRoot, name));
  return Array.from(new Set([...oldBuilds, ...exact]));
}

async function deletePaths(
  paths: string[],
  inventory: FtpInventoryEntry[],
  config: FtpConnectionConfig,
) {
  for (const target of paths) {
    const descendants = inventory
      .filter(
        (entry) => entry.path === target || entry.path.startsWith(`${target}/`),
      )
      .sort((a, b) => b.path.length - a.path.length);
    for (const entry of descendants) {
      await deleteRemote(entry.path, entry.kind, config);
    }
    if (!descendants.length) {
      await deleteRemote(target, "file", config);
    }
  }
}

async function deleteRemote(
  remotePath: string,
  kind: FtpInventoryEntry["kind"],
  config: FtpConnectionConfig,
) {
  const command = kind === "directory" ? "RMD" : "DELE";
  await runCurl(
    ftpArgs(
      config,
      ["--quote", `${command} ${remotePath}`, "--list-only"],
      config.remoteDir,
    ),
  );
}

function formatSummary(input: {
  config: FtpConnectionConfig;
  mode: FtpMaintenanceMode;
  keepBuilds: number;
  maxBuildsToScan?: number;
  requestedPaths: string[];
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
    `- Build scan: **${input.maxBuildsToScan === undefined ? "all numbered builds" : `newest ${input.maxBuildsToScan} numbered build${input.maxBuildsToScan === 1 ? "" : "s"}`}**`,
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
      ? `The following paths ${input.mode === "cleanup" ? "were deleted" : "would be deleted"}:`
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
  return [
    "--silent",
    "--show-error",
    "--fail",
    "-u",
    `${config.user}:${config.password}`,
    ...args,
    `${protocol}://${config.host}${port}/${encodedPath}`,
  ];
}

function safeChildPath(root: string, value: string) {
  if (!value || value.startsWith("/") || value.split("/").includes("..")) {
    throw new Error(`Cleanup path must be relative to the FTP root: ${value}`);
  }
  return pathJoin(root, value);
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
