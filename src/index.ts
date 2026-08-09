import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { type Config, loadConfig } from "./config.ts";
import { log, logError } from "./log.ts";
import {
  hasLocalCopy,
  markDownloadFailed,
  markDownloadFinished,
  markDownloadStarted,
  mediaFileName,
  mediaFilePath,
} from "./media-store.ts";
import { muxToMp4 } from "./mux.ts";
import type { MediaEntry } from "./types.ts";
import { authenticate, getMediaList } from "./vigi/control-api.ts";
import { downloadMedia } from "./vigi/download.ts";

async function fetchEntry(
  config: Config,
  entry: MediaEntry,
  workDir: string,
): Promise<void> {
  const streams = await downloadMedia({
    host: config.host,
    port: config.rtspPort,
    username: config.username,
    password: config.password,
    entry,
    workDir,
    idleTimeoutMs: config.streamIdleTimeoutMs,
  });

  try {
    await muxToMp4(streams, mediaFilePath(config.targetDir, entry));
  } finally {
    await rm(streams.videoPath, { force: true });
    if (streams.audioPath !== undefined) {
      await rm(streams.audioPath, { force: true });
    }
  }

  await markDownloadFinished(config.targetDir, entry);
}

try {
  process.loadEnvFile(path.join(import.meta.dirname, "..", ".env"));
} catch {
  // No .env file - fall back to the ambient environment.
}

const config = loadConfig();
const controlApi = {
  host: config.host,
  port: config.apiPort,
  rejectUnauthorized: config.rejectUnauthorized,
};
const workDir = path.join(config.targetDir, ".work");

await mkdir(config.targetDir, { recursive: true });
await rm(workDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });

const stok = await authenticate(controlApi, config.username, config.password);

const endTime = Math.floor(Date.now() / 1000); // Seconds since the epoch.
const startTime = endTime - Math.round(config.lookbackHours * 3600);
const entries = await getMediaList(controlApi, stok, {
  startTime,
  endTime,
  eventTypes: config.eventTypes,
});

const missing = entries.filter(
  (entry) => !hasLocalCopy(config.targetDir, entry),
);
log(
  `${entries.length} recording(s) on the device, ${missing.length} missing from ${config.targetDir}`,
);

// Claim every entry up front so a concurrent run does not retry them.
for (const entry of missing) {
  await markDownloadStarted(config.targetDir, entry);
}

let failures = 0;

for (const entry of missing) {
  const name = mediaFileName(entry);
  log(
    `Downloading ${name} (${(entry.size / 1_000_000).toFixed(1)} MB reported)`,
  );

  try {
    await fetchEntry(config, entry, workDir);
    log(`  saved ${name}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    failures += 1;
    await markDownloadFailed(config.targetDir, entry, reason);
    logError(`  failure: ${reason}`);
    logError(`  failed entry: ${JSON.stringify(entry)}`);
  }
}

await rm(workDir, { recursive: true, force: true });

if (failures > 0) {
  throw new Error(`${failures} recording(s) could not be downloaded`);
}
