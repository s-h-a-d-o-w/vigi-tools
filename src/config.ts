import path from "node:path";
import process from "node:process";

import { EVENT_TYPES, type EventType } from "./types.ts";

function requiredString(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `Environment variable ${name} must be a number but was "${raw}"`,
    );
  }

  return value;
}

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
    host: requiredString("HOST"),
    username: process.env["USERNAME"] ?? "admin",
    password: requiredString("PASSWORD"),
    apiPort: optionalNumber("API_PORT", 20_443),
    rtspPort: optionalNumber("RTSP_PORT", 554),
    downloadDir: path.resolve(
      process.cwd(),
      process.env["DOWNLOAD_DIR"] ?? "temp",
    ),
    lookbackHours: optionalNumber("LOOKBACK_HOURS", 24),
    eventTypes: optionalEventTypes("EVENT_TYPES"),
    streamIdleTimeoutMs: optionalNumber("STREAM_IDLE_TIMEOUT_MS", 20_000),
    // Cameras ship with a self-signed certificate, so verification is off unless
    // the certificate has been replaced with one the host trusts.
    rejectUnauthorized: process.env["TLS_REJECT_UNAUTHORIZED"] === "true",
  };
}
