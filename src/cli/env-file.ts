import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import type { ToolName } from "./tools.ts";

/** Settings every tool shares live in one file, the rest per tool. */
export type EnvScope = ToolName | "shared";

export function envFilePath(scope: EnvScope): string {
  return path.join(process.cwd(), `.env.${scope}`);
}

/**
 * Falls back to the ambient environment when there is no file. Node never
 * overwrites a variable that is already set, so the more specific file is read
 * first and the ambient environment wins over both.
 */
export function loadEnvFile(tool: ToolName): void {
  for (const scope of [tool, "shared"] as const) {
    const file = envFilePath(scope);

    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }
}
