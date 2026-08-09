import path from "node:path";
import process from "node:process";

import { loadDeviceConfig } from "shared/config.ts";
import { optionalNumber, requiredString } from "shared/env.ts";
import { EVENT_TYPES, type EventType } from "shared/types.ts";

function optionalEventTypes(name: string): EventType[] {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return [...EVENT_TYPES];
  }

  const known = new Set<string>(EVENT_TYPES);
  const entries = raw.split(",").map((entry) => entry.trim());

  for (const entry of entries) {
    if (!known.has(entry)) {
      throw new Error(`Unknown event type "${entry}" in ${name}`);
    }
  }

  return entries as EventType[];
}

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig() {
  return {
    ...loadDeviceConfig(),
    rtspPort: optionalNumber("RTSP_PORT", 554),
    targetDir: path.resolve(process.cwd(), requiredString("TARGET_DIR")),
    lookbackHours: optionalNumber("LOOKBACK_HOURS", 24),
    eventTypes: optionalEventTypes("EVENT_TYPES"),
    streamIdleTimeoutMs: optionalNumber("STREAM_IDLE_TIMEOUT_MS", 20_000),
  };
}
