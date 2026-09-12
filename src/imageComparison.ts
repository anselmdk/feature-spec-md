import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

export async function pngsHaveIdenticalPixels(
  previousPath: string,
  currentPath: string,
) {
  try {
    const [previous, current] = await Promise.all([
      readPng(previousPath),
      readPng(currentPath),
    ]);
    if (
      previous.width !== current.width ||
      previous.height !== current.height
    ) {
      return false;
    }

    return previous.data.equals(current.data);
  } catch {
    // A report must remain publishable when a file has an unexpected encoding.
    // The caller retains the conservative byte-hash result in that case.
    return undefined;
  }
}

async function readPng(filePath: string) {
  return PNG.sync.read(await readFile(filePath));
}
