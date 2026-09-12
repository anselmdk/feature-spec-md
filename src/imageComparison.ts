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

/**
 * Treats tiny rasterisation noise as visually equivalent while retaining a
 * conservative guard against hiding real UI changes. The thresholds are based
 * on decoded RGBA pixels, so PNG compression and metadata do not affect them.
 */
export async function pngsAreVisuallyEquivalent(
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
    let changedPixels = 0;
    let totalDifference = 0;
    for (let offset = 0; offset < previous.data.length; offset += 4) {
      let pixelDifference = 0;
      for (let channel = 0; channel < 4; channel += 1) {
        pixelDifference += Math.abs(
          previous.data[offset + channel] - current.data[offset + channel],
        );
      }
      totalDifference += pixelDifference;
      if (pixelDifference > 8) changedPixels += 1;
    }
    const pixelCount = previous.width * previous.height;
    return (
      changedPixels / pixelCount <= 0.001 &&
      totalDifference / (pixelCount * 4) <= 1.5
    );
  } catch {
    return undefined;
  }
}

async function readPng(filePath: string) {
  return PNG.sync.read(await readFile(filePath));
}
