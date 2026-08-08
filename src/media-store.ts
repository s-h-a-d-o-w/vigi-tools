import { existsSync } from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MediaEntry } from "./types.ts";

/** Device-provided strings end up in file names, so anything path-ish is stripped. */
export function sanitizeSegment(value: string): string {
  const sanitized = value.replaceAll(/[^\w.-]/gu, "_");
  return sanitized === "" ? "unnamed" : sanitized;
}

function timestampLabel(secondsSinceEpoch: number): string {
  return new Date(secondsSinceEpoch * 1000)
    .toISOString()
    .slice(0, 19)
    .replaceAll(":", "-")
    .replace("T", "_");
}

function mediaBaseName(entry: MediaEntry): string {
  const parts = [
    timestampLabel(entry.startTime),
    sanitizeSegment(entry.eventType),
    sanitizeSegment(entry.fileId),
  ];

  return parts.join("_");
}

export function mediaFileName(entry: MediaEntry): string {
  return `${mediaBaseName(entry)}.mp4`;
}

export function mediaFilePath(directory: string, entry: MediaEntry): string {
  return path.join(directory, mediaFileName(entry));
}

/**
 * Sidecar text file that records the download timestamps. It is written before
 * the transfer starts so a crashed or concurrent run does not retry the entry.
 */
function markerFilePath(directory: string, entry: MediaEntry): string {
  return path.join(directory, `${mediaBaseName(entry)}.txt`);
}

export async function markDownloadStarted(
  directory: string,
  entry: MediaEntry,
): Promise<void> {
  await writeFile(
    markerFilePath(directory, entry),
    `started: ${new Date().toISOString()}\n`,
  );
}

export async function markDownloadFinished(
  directory: string,
  entry: MediaEntry,
): Promise<void> {
  await appendFile(
    markerFilePath(directory, entry),
    `finished: ${new Date().toISOString()}\n`,
  );
}

export async function markDownloadFailed(
  directory: string,
  entry: MediaEntry,
  reason: string,
): Promise<void> {
  await appendFile(
    markerFilePath(directory, entry),
    `failed: ${new Date().toISOString()} ${reason.replaceAll(/\s+/gu, " ")}\n`,
  );
}

export function hasLocalCopy(directory: string, entry: MediaEntry): boolean {
  return (
    existsSync(mediaFilePath(directory, entry)) ||
    existsSync(markerFilePath(directory, entry))
  );
}
