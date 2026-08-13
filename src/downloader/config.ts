import path from "node:path";
import process from "node:process";

import { loadDeviceConfig } from "../shared/config.ts";
import { optionalNumber, requiredString } from "../shared/env.ts";

export type Config = ReturnType<typeof loadConfig>;

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
  const recipient = process.env["NOTIFY_EMAIL_TO"]?.trim();

  if (recipient === undefined || recipient === "") {
    return undefined;
  }

  return {
    host,
    recipient,
    sender: requiredString("NOTIFY_EMAIL_FROM"),
    region: requiredString("AWS_REGION"),
    accessKeyId: requiredString("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requiredString("AWS_SECRET_ACCESS_KEY"),
    quietPeriodMs: optionalNumber("NOTIFY_QUIET_PERIOD_SECONDS", 120) * 1000,
  };
}

export function loadConfig() {
  const device = loadDeviceConfig();

  return {
    ...device,
    rtspPort: optionalNumber("RTSP_PORT", 554),
    targetDir: path.resolve(process.cwd(), requiredString("TARGET_DIR")),
    checkPreviousHours: optionalNumber("CHECK_PREVIOUS_HOURS", 24),
    checkIntervalMs: optionalNumber("CHECK_INTERVAL_SECONDS", 35) * 1000,
    notifications: loadNotifyConfig(device.host),
  };
}
