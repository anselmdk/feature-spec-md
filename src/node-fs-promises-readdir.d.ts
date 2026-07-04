import type { Dirent } from "node:fs";
import type { PathLike } from "node:fs";

declare module "node:fs/promises" {
  export function readdir(
    path: PathLike,
    options: { withFileTypes: true },
  ): Promise<Dirent<string>[]>;
}
