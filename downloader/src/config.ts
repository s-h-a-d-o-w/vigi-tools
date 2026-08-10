import path from "node:path";
import process from "node:process";

import { loadDeviceConfig } from "shared/config.ts";
import { optionalNumber, requiredString } from "shared/env.ts";

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig() {
  return {
    ...loadDeviceConfig(),
    rtspPort: optionalNumber("RTSP_PORT", 554),
    targetDir: path.resolve(process.cwd(), requiredString("TARGET_DIR")),
    checkPreviousHours: optionalNumber("CHECK_PREVIOUS_HOURS", 24),
    checkIntervalMs: optionalNumber("CHECK_INTERVAL_MS", 15 * 60_000),
  };
}
