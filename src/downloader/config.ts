import path from "node:path";
import process from "node:process";

import { loadDeviceConfig, loadSesConfig } from "../shared/config.ts";
import { createEnvReader } from "../shared/env.ts";
import type { SesConfig } from "../shared/ses.ts";

import { envSchema } from "./env-schema.ts";

export type Config = ReturnType<typeof loadConfig>;

const env = createEnvReader(envSchema);

export type NotifyConfig = SesConfig & {
  host: string;
  quietPeriodMs: number;
};

/** Notifications stay off until a recipient is configured. */
function loadNotifyConfig(host: string): NotifyConfig | undefined {
  const ses = loadSesConfig(env);

  if (ses === undefined) {
    return undefined;
  }

  return {
    ...ses,
    host,
    quietPeriodMs: env.number("NOTIFY_QUIET_PERIOD_SECONDS") * 1_000,
  };
}

export function loadConfig() {
  const device = loadDeviceConfig();

  return {
    ...device,
    rtspPort: env.number("RTSP_PORT"),
    targetDir: path.resolve(process.cwd(), env.string("TARGET_DIR")),
    checkPreviousHours: env.number("CHECK_PREVIOUS_HOURS"),
    checkIntervalMs: env.number("CHECK_INTERVAL_SECONDS") * 1_000,
    notifications: loadNotifyConfig(device.host),
  };
}
