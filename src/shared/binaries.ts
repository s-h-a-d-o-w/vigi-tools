import { accessSync, constants } from "node:fs";
import path from "node:path";
import process from "node:process";

function isOnPath(binary: string): boolean {
  return (process.env["PATH"] ?? "")
    .split(path.delimiter)
    .filter((directory) => directory !== "")
    .some((directory) => {
      try {
        accessSync(path.join(directory, binary), constants.X_OK);

        return true;
      } catch {
        return false;
      }
    });
}

/** Fails on startup instead of when a tool first shells out, possibly much later. */
export function requireBinaries(binaries: readonly string[]): void {
  const missing = binaries.filter((binary) => !isOnPath(binary));

  if (missing.length > 0) {
    throw new Error(
      `Missing required executable(s): ${missing.join(", ")} - install them and make sure they are on PATH`,
    );
  }
}
