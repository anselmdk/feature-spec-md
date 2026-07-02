import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeGithubSummary(markdown: string) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  await mkdir(dirname(summaryPath), { recursive: true });
  const existing = await readTextIfExists(summaryPath);
  await writeFile(summaryPath, `${existing}${markdown}`, "utf8");
}

export async function writeGithubOutput(values: Record<string, string>) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = Object.entries(values).map(([key, value]) => outputLine(key, value));
  const existing = await readTextIfExists(outputPath);
  await writeFile(outputPath, `${existing}${lines.join("\n")}\n`, "utf8");
}

function outputLine(key: string, value: string) {
  if (!value.includes("\n")) return `${key}=${value}`;
  const delimiter = `feature_spec_md_${Math.random().toString(36).slice(2)}`;
  return `${key}<<${delimiter}\n${value}\n${delimiter}`;
}

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}
