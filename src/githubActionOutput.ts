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
