import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import type { ToolName } from "./tools.ts";

/** Each tool reads its own file, so several tools can share one directory. */
export function envFilePath(tool: ToolName): string {
  return path.join(process.cwd(), `.env.${tool}`);
}

/** Falls back to the ambient environment when there is no file. */
export function loadEnvFile(tool: ToolName): void {
  const file = envFilePath(tool);

  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}
