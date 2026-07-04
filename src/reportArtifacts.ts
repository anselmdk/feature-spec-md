import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expandFilePatterns } from "./filePatterns.js";

export const publishedSpecRoot = "__feature-spec-md";

export type PublishedSpecManifestItem = {
  filePath: string;
  publishedPath: string;
};

export async function writePublishedFeatureSpecFiles(
  reportDir: string,
  patterns: string[],
) {
  const files = (await expandFilePatterns(patterns)).filter((file) =>
    file.endsWith(".feature.md"),
  );
  const features: PublishedSpecManifestItem[] = [];

  for (const sourcePath of files) {
    const filePath = safeRelativePath(sourcePath);
    const publishedPath = `${publishedSpecRoot}/${filePath}`;
    const target = join(reportDir, publishedPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(sourcePath, "utf8"), "utf8");
    features.push({ filePath, publishedPath });
  }

  const manifestPath = join(reportDir, "__feature-spec-md", "manifest.json");
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), features }, null, 2),
    "utf8",
  );
}

function safeRelativePath(filePath: string) {
  return filePath
    .split(/[\\/]+/)
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}
