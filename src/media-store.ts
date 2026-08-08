import { existsSync } from "node:fs";
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

export function mediaFileName(entry: MediaEntry): string {
  const parts = [
    timestampLabel(entry.startTime),
    sanitizeSegment(entry.eventType),
    sanitizeSegment(entry.fileId),
  ];

  return `${parts.join("_")}.mp4`;
}

export function mediaFilePath(directory: string, entry: MediaEntry): string {
  return path.join(directory, mediaFileName(entry));
}

export function hasLocalCopy(directory: string, entry: MediaEntry): boolean {
  return existsSync(mediaFilePath(directory, entry));
}
