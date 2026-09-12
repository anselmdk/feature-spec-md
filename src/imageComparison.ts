import { readFile } from "node:fs/promises";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export const defaultScreenshotChangeThreshold = 0.001;

export async function pngsAreVisuallyEquivalent(
  previousPath: string,
  currentPath: string,
  changeThreshold = defaultScreenshotChangeThreshold,
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

    const pixelCount = previous.width * previous.height;
    if (pixelCount === 0) return true;
    const changedPixels = pixelmatch(
      previous.data,
      current.data,
      undefined,
      previous.width,
      previous.height,
      {
        // Ignore small color and anti-aliasing differences before applying the
        // whole-image changed-pixel threshold below.
        threshold: 0.1,
      },
    );
    return changedPixels / pixelCount <= changeThreshold;
  } catch {
    // A report must remain publishable when a file has an unexpected encoding.
    // The caller retains the conservative byte-hash result in that case.
    return undefined;
  }
}

async function readPng(filePath: string) {
  return PNG.sync.read(await readFile(filePath));
}
