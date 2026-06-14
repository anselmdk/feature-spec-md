import { glob } from "node:fs/promises";

/** Expand user-provided source globs while ignoring generated directories. */
export async function expandFilePatterns(patterns: string[]) {
  return expandPatterns(patterns, [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "test-results/**",
  ]);
}

/** Expand report artifact globs, including files under `test-results`. */
export async function expandArtifactPatterns(patterns: string[]) {
  return expandPatterns(patterns, ["node_modules/**", ".git/**", "dist/**"]);
}

async function expandPatterns(patterns: string[], exclude: string[]) {
  const files = new Set<string>();
  for (const pattern of patterns) {
    for await (const file of glob(pattern, { exclude })) {
      files.add(file);
    }
  }
  return Array.from(files).sort();
}
