import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { log, logError } from "../shared/log.ts";
import { runForever } from "../shared/loop.ts";
import { EVENT_TYPES, type MediaEntry } from "../shared/types.ts";
import { authenticate, getMediaList } from "../shared/vigi/control-api.ts";

import { type Config, loadConfig } from "./config.ts";
import {
  hasLocalCopy,
  markDownloadFailed,
  markDownloadFinished,
  markDownloadStarted,
  mediaFileName,
  mediaFilePath,
} from "./media-store.ts";
import { muxToMp4 } from "./mux.ts";
import { createNotifier } from "./notify.ts";
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

const config = loadConfig();
const controlApi = {
  host: config.host,
  port: config.apiPort,
  rejectUnauthorized: config.rejectUnauthorized,
};
const workDir = path.join(config.targetDir, ".work");
const notifier = createNotifier(config.notifications);

async function check(): Promise<void> {
  await mkdir(config.targetDir, { recursive: true });
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  const stok = await authenticate(controlApi, config.username, config.password);

  const endTime = Math.floor(Date.now() / 1000); // Seconds since the epoch.
  const startTime = endTime - Math.round(config.checkPreviousHours * 3600);
  const entries = await getMediaList(controlApi, stok, {
    startTime,
    endTime,
    eventTypes: EVENT_TYPES,
  });

  const missing = entries.filter(
    (entry) => !hasLocalCopy(config.targetDir, entry),
  );
  log(
    `${entries.length} recording(s) on the device, ${missing.length} missing from ${config.targetDir}`,
  );

  if (missing.length > 0) {
    notifier.downloadsStarted();
  }

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

  if (missing.length > 0) {
    notifier.downloadsFinished({
      downloaded: missing.length - failures,
      failed: failures,
    });
  }

  if (failures > 0) {
    // A failure stops the service, so the summary cannot wait for the quiet period.
    await notifier.flush();
    throw new Error(`${failures} recording(s) could not be downloaded`);
  }
}

await runForever(config.checkIntervalMs, check);
