import path from "node:path";
import process from "node:process";

import { loadDeviceConfig } from "../shared/config.ts";
import { createEnvReader } from "../shared/env.ts";

import { envSchema } from "./env-schema.ts";

export type Config = ReturnType<typeof loadConfig>;

const env = createEnvReader(envSchema);

export type NotifyConfig = {
  host: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sender: string;
  recipient: string;
  quietPeriodMs: number;
};

/** Notifications stay off until a recipient is configured. */
function loadNotifyConfig(host: string): NotifyConfig | undefined {
  const recipient = env.optionalString("NOTIFY_EMAIL_TO")?.trim();

  if (recipient === undefined) {
    return undefined;
  }

  return {
    host,
    recipient,
    sender: env.string("NOTIFY_EMAIL_FROM"),
    region: env.string("AWS_REGION"),
    accessKeyId: env.string("AWS_ACCESS_KEY_ID"),
    secretAccessKey: env.string("AWS_SECRET_ACCESS_KEY"),
    quietPeriodMs: env.number("NOTIFY_QUIET_PERIOD_SECONDS") * 1000,
  };
}

export function loadConfig() {
  const device = loadDeviceConfig();

  return {
    ...device,
    rtspPort: env.number("RTSP_PORT"),
    targetDir: path.resolve(process.cwd(), env.string("TARGET_DIR")),
    checkPreviousHours: env.number("CHECK_PREVIOUS_HOURS"),
    checkIntervalMs: env.number("CHECK_INTERVAL_SECONDS") * 1000,
    notifications: loadNotifyConfig(device.host),
  };
}
