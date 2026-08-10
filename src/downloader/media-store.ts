import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { MediaEntry } from "../shared/types.ts";

/**
 * The device sometimes lists a recording while it is still being written, so a
 * later listing reports a larger size for the same entry. Sizes within this
 * margin are treated as the same recording.
 */
const SIZE_TOLERANCE_BYTES = 8 * 1024;

/** Device-provided strings end up in file names, so anything path-ish is stripped. */
export function sanitizeSegment(value: string): string {
  const sanitized = value.replaceAll(/[^\w.-]/gu, "_");
  return sanitized === "" ? "unnamed" : sanitized;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local-time counterpart of `Date.toISOString()`, truncated to seconds. */
function localTimestamp(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

  return `${day}T${time}`;
}

function timestampLabel(secondsSinceEpoch: number): string {
  return localTimestamp(new Date(secondsSinceEpoch * 1000))
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
 * Sidecar JSON file that records the download state. It is written before the
 * transfer starts so a crashed or concurrent run does not retry the entry.
 */
type Marker = {
  /** Size the device reported when the entry was claimed. */
  size: number;
  started: string;
  finished?: string;
  failed?: string;
  reason?: string;
};

function markerFilePath(directory: string, entry: MediaEntry): string {
  return path.join(directory, `${mediaBaseName(entry)}.json`);
}

function readMarker(markerPath: string): Marker | undefined {
  try {
    return JSON.parse(readFileSync(markerPath, "utf8")) as Marker;
  } catch {
    return undefined;
  }
}

async function writeMarker(markerPath: string, marker: Marker): Promise<void> {
  await writeFile(markerPath, `${JSON.stringify(marker, undefined, 2)}\n`);
}

export async function markDownloadStarted(
  directory: string,
  entry: MediaEntry,
): Promise<void> {
  await writeMarker(markerFilePath(directory, entry), {
    size: entry.size,
    started: localTimestamp(new Date()),
  });
}

export async function markDownloadFinished(
  directory: string,
  entry: MediaEntry,
): Promise<void> {
  const markerPath = markerFilePath(directory, entry);
  const marker = readMarker(markerPath) ?? {
    size: entry.size,
    started: localTimestamp(new Date()),
  };

  await writeMarker(markerPath, {
    ...marker,
    finished: localTimestamp(new Date()),
  });
}

export async function markDownloadFailed(
  directory: string,
  entry: MediaEntry,
  reason: string,
): Promise<void> {
  const markerPath = markerFilePath(directory, entry);
  const marker = readMarker(markerPath) ?? {
    size: entry.size,
    started: localTimestamp(new Date()),
  };

  await writeMarker(markerPath, {
    ...marker,
    failed: localTimestamp(new Date()),
    reason,
  });
}

export function hasLocalCopy(directory: string, entry: MediaEntry): boolean {
  const marker = readMarker(markerFilePath(directory, entry));

  if (marker === undefined) {
    return existsSync(mediaFilePath(directory, entry));
  }

  return Math.abs(marker.size - entry.size) <= SIZE_TOLERANCE_BYTES;
}
