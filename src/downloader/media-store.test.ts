import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MediaEntry } from "#shared/types.ts";

import {
  hasLocalCopy,
  markDownloadFailed,
  markDownloadFinished,
  markDownloadStarted,
  mediaFileName,
  mediaFilePath,
  sanitizeSegment,
} from "./media-store.ts";

type Marker = {
  size: number;
  started: string;
  finished?: string;
  failed?: string;
  reason?: string;
};

// 2023-11-14T22:13:20Z, which the tests below read back in UTC.
const ENTRY: MediaEntry = {
  fileId: "file-1",
  startTime: 1_700_000_000,
  endTime: 1_700_000_060,
  size: 12_000_000,
  eventType: "MotionDetection",
  mediaType: "video",
};

const BASE_NAME = "2023-11-14_22-13-20_MotionDetection_file-1";
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u;

describe("media store", () => {
  let directory = "";

  function readMarker(): Promise<Marker> {
    return readFile(path.join(directory, `${BASE_NAME}.json`), "utf8").then(
      (contents) => JSON.parse(contents) as Marker,
    );
  }

  beforeEach(async () => {
    // The file names carry local time, so the tests pin the zone.
    vi.stubEnv("TZ", "UTC");
    directory = await mkdtemp(path.join(tmpdir(), "media-store-"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  describe(sanitizeSegment, () => {
    it("keeps characters that are safe in a file name", () => {
      expect(sanitizeSegment("file-1.part_2")).toBe("file-1.part_2");
    });

    it("replaces anything path-ish the device sent", () => {
      expect(sanitizeSegment("../../etc/passwd")).toBe(".._.._etc_passwd");
    });

    it("falls back to a placeholder for an empty segment", () => {
      expect(sanitizeSegment("")).toBe("unnamed");
    });
  });

  describe(mediaFileName, () => {
    it("builds a sortable name from the start time, event and file id", () => {
      expect(mediaFileName(ENTRY)).toBe(`${BASE_NAME}.mp4`);
    });

    it("sanitizes the parts the device controls", () => {
      expect(
        mediaFileName({
          ...ENTRY,
          eventType: "Motion/Detection",
          fileId: "a b",
        }),
      ).toBe("2023-11-14_22-13-20_Motion_Detection_a_b.mp4");
    });
  });

  describe(mediaFilePath, () => {
    it("puts the recording into the given directory", () => {
      expect(mediaFilePath("/recordings", ENTRY)).toBe(
        `/recordings/${BASE_NAME}.mp4`,
      );
    });
  });

  describe("download markers", () => {
    it("records the reported size and a start timestamp", async () => {
      await markDownloadStarted(directory, ENTRY);

      const marker = await readMarker();

      expect(marker.size).toBe(ENTRY.size);
      expect(marker.started).toMatch(TIMESTAMP);
      expect(marker.finished).toBeUndefined();
    });

    it("keeps the start timestamp when the download finishes", async () => {
      await markDownloadStarted(directory, ENTRY);
      const { started } = await readMarker();

      await markDownloadFinished(directory, ENTRY);
      const marker = await readMarker();

      expect(marker.size).toBe(ENTRY.size);
      expect(marker.started).toBe(started);
      expect(marker.finished).toMatch(TIMESTAMP);
    });

    it("records why a download failed", async () => {
      await markDownloadStarted(directory, ENTRY);

      await markDownloadFailed(directory, ENTRY, "ffmpeg exited with code 1");
      const marker = await readMarker();

      expect(marker.failed).toMatch(TIMESTAMP);
      expect(marker.reason).toBe("ffmpeg exited with code 1");
    });

    it("writes a complete marker even when the entry was never claimed", async () => {
      await markDownloadFinished(directory, ENTRY);

      const marker = await readMarker();

      expect(marker.size).toBe(ENTRY.size);
      expect(marker.started).toMatch(TIMESTAMP);
      expect(marker.finished).toMatch(TIMESTAMP);
    });
  });

  describe(hasLocalCopy, () => {
    it("reports a recording nothing is known about as missing", () => {
      // `toBe(false)` and `toBeFalsy()` are both rejected by oxlint.
      expect(hasLocalCopy(directory, ENTRY)).not.toBe(true);
    });

    it("accepts a recording that was downloaded before markers existed", async () => {
      await writeFile(mediaFilePath(directory, ENTRY), "mp4");

      expect(hasLocalCopy(directory, ENTRY)).toBe(true);
    });

    it("accepts a claimed recording so a concurrent run does not retry it", async () => {
      await markDownloadStarted(directory, ENTRY);

      expect(hasLocalCopy(directory, ENTRY)).toBe(true);
    });

    it("does not retry a recording that failed", async () => {
      await markDownloadFailed(directory, ENTRY, "socket hang up");

      expect(hasLocalCopy(directory, ENTRY)).toBe(true);
    });

    it("tolerates the size the device reports growing slightly", async () => {
      await markDownloadStarted(directory, ENTRY);

      expect(
        hasLocalCopy(directory, { ...ENTRY, size: ENTRY.size + 8 * 1_024 }),
      ).toBe(true);
    });

    it("treats a much larger recording as a different one", async () => {
      await markDownloadStarted(directory, ENTRY);

      expect(
        hasLocalCopy(directory, { ...ENTRY, size: ENTRY.size + 8_193 }),
      ).not.toBe(true);
    });

    it("falls back to the file itself when the marker is unreadable", async () => {
      await writeFile(path.join(directory, `${BASE_NAME}.json`), "{ broken");

      expect(hasLocalCopy(directory, ENTRY)).not.toBe(true);

      await writeFile(mediaFilePath(directory, ENTRY), "mp4");

      expect(hasLocalCopy(directory, ENTRY)).toBe(true);
    });
  });
});
