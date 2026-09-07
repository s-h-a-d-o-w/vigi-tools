import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { mkdir, rm } from "node:fs/promises";

import {
  bootService,
  CONTROL_API,
  PASSWORD,
  stubDeviceEnv,
  USERNAME,
} from "#shared/testing.ts";
import { EVENT_TYPES, type MediaEntry } from "#shared/types.ts";
import type { ControlApiOptions } from "#shared/vigi/control-api.ts";

import type { BatchResult, Notifier } from "./notify.ts";
import type { DownloadOptions, DownloadResult } from "./vigi/download.ts";

const mocks = vi.hoisted(() => ({
  authenticate:
    vi.fn<
      (
        options: ControlApiOptions,
        username: string,
        password: string,
      ) => Promise<string>
    >(),
  getMediaList: vi.fn<
    (
      options: ControlApiOptions,
      stok: string,
      query: {
        startTime: number;
        endTime: number;
        eventTypes: readonly string[];
      },
    ) => Promise<MediaEntry[]>
  >(),
  downloadMedia: vi.fn<(options: DownloadOptions) => Promise<DownloadResult>>(),
  muxToMp4:
    vi.fn<(streams: DownloadResult, outputPath: string) => Promise<void>>(),
  hasLocalCopy: vi.fn<(directory: string, entry: MediaEntry) => boolean>(),
  markDownloadStarted:
    vi.fn<(directory: string, entry: MediaEntry) => Promise<void>>(),
  markDownloadFinished:
    vi.fn<(directory: string, entry: MediaEntry) => Promise<void>>(),
  markDownloadFailed:
    vi.fn<
      (directory: string, entry: MediaEntry, reason: string) => Promise<void>
    >(),
  mediaFileName: vi.fn<(entry: MediaEntry) => string>(),
  mediaFilePath: vi.fn<(directory: string, entry: MediaEntry) => string>(),
  mkdir:
    vi.fn<
      (target: string, options: { recursive: boolean }) => Promise<undefined>
    >(),
  rm: vi.fn<typeof rm>(),
  runForever:
    vi.fn<(intervalMs: number, check: () => Promise<void>) => Promise<void>>(),
  createNotifier: vi.fn<() => Notifier>(),
  downloadsStarted: vi.fn<() => void>(),
  downloadsFinished: vi.fn<(result: BatchResult) => void>(),
  flush: vi.fn<() => Promise<void>>(),
  log: vi.fn<(message: string) => void>(),
  logError: vi.fn<(message: string) => void>(),
}));

vi.mock(import("./media-store.ts"), () => ({
  hasLocalCopy: mocks.hasLocalCopy,
  markDownloadStarted: mocks.markDownloadStarted,
  markDownloadFinished: mocks.markDownloadFinished,
  markDownloadFailed: mocks.markDownloadFailed,
  mediaFileName: mocks.mediaFileName,
  mediaFilePath: mocks.mediaFilePath,
}));
vi.mock(import("./mux.ts"), () => ({ muxToMp4: mocks.muxToMp4 }));
vi.mock(import("./notify.ts"), () => ({
  createNotifier: mocks.createNotifier,
}));
vi.mock(import("./vigi/download.ts"), () => ({
  downloadMedia: mocks.downloadMedia,
}));
vi.mock(import("#shared/vigi/control-api.ts"), () => ({
  authenticate: mocks.authenticate,
  getMediaList: mocks.getMediaList,
}));
vi.mock(import("#shared/loop.ts"), () => ({ runForever: mocks.runForever }));
vi.mock(import("#shared/log.ts"), () => ({
  log: mocks.log,
  logError: mocks.logError,
}));
vi.mock(import("node:fs/promises"), async (importOriginal) => ({
  ...(await importOriginal()),
  // The real signature is overloaded, which a mock cannot mirror.
  mkdir: mocks.mkdir as unknown as typeof mkdir,
  rm: mocks.rm,
}));

const TARGET_DIR = "/recordings";
const WORK_DIR = "/recordings/.work";

const ENTRY_ONE: MediaEntry = {
  fileId: "file-1",
  startTime: 1_700_000_000,
  endTime: 1_700_000_060,
  size: 12_000_000,
  eventType: "MotionDetection",
  mediaType: "video",
};

const ENTRY_TWO: MediaEntry = {
  ...ENTRY_ONE,
  fileId: "file-2",
  startTime: 1_700_000_500,
  endTime: 1_700_000_560,
};

function streamsFor(entry: MediaEntry): DownloadResult {
  return {
    videoPath: `${WORK_DIR}/${entry.fileId}.h264`,
    audioPath: `${WORK_DIR}/${entry.fileId}.audio`,
    av: {
      videoCodec: "H264",
      audioCodec: "G711alaw",
      audioSampleRate: 8_000,
      audioChannels: 1,
    },
  };
}

/** Boots a fresh copy of the service and hands back its check callback. */
function startService(): Promise<() => Promise<void>> {
  return bootService(mocks.runForever, () => import("./index.ts"));
}

describe("downloader service", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.authenticate.mockResolvedValue("stok-1");
    mocks.getMediaList.mockResolvedValue([ENTRY_ONE, ENTRY_TWO]);
    mocks.downloadMedia.mockImplementation((options) =>
      Promise.resolve(streamsFor(options.entry)),
    );
    mocks.muxToMp4.mockResolvedValue(undefined);
    mocks.hasLocalCopy.mockReturnValue(false);
    mocks.markDownloadStarted.mockResolvedValue(undefined);
    mocks.markDownloadFinished.mockResolvedValue(undefined);
    mocks.markDownloadFailed.mockResolvedValue(undefined);
    mocks.mediaFileName.mockImplementation((entry) => `${entry.fileId}.mp4`);
    mocks.mediaFilePath.mockImplementation(
      (directory, entry) => `${directory}/${entry.fileId}.mp4`,
    );
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.rm.mockResolvedValue(undefined);
    mocks.runForever.mockResolvedValue(undefined);
    mocks.flush.mockResolvedValue(undefined);
    mocks.createNotifier.mockReturnValue({
      downloadsStarted: mocks.downloadsStarted,
      downloadsFinished: mocks.downloadsFinished,
      flush: mocks.flush,
    });

    stubDeviceEnv({
      TARGET_DIR,
      RTSP_PORT: "1554",
      CHECK_PREVIOUS_HOURS: "2",
      CHECK_INTERVAL_SECONDS: "60",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("checks for new recordings on the configured schedule", async () => {
    await startService();

    expect(mocks.runForever).toHaveBeenCalledWith(60_000, expect.any(Function));
  });

  it("asks the device for the recordings of the configured window", async () => {
    vi.useFakeTimers({ now: 1_700_000_600_000 });
    const check = await startService();

    await check();

    expect(mocks.authenticate).toHaveBeenCalledWith(
      CONTROL_API,
      USERNAME,
      PASSWORD,
    );
    expect(mocks.getMediaList).toHaveBeenCalledWith(CONTROL_API, "stok-1", {
      startTime: 1_700_000_600 - 2 * 3_600,
      endTime: 1_700_000_600,
      eventTypes: EVENT_TYPES,
    });
  });

  it("recreates the work directory before and clears it after a run", async () => {
    const check = await startService();

    await check();

    expect(mocks.mkdir).toHaveBeenNthCalledWith(1, TARGET_DIR, {
      recursive: true,
    });
    expect(mocks.mkdir).toHaveBeenNthCalledWith(2, WORK_DIR, {
      recursive: true,
    });
    expect(mocks.rm).toHaveBeenNthCalledWith(1, WORK_DIR, {
      recursive: true,
      force: true,
    });
    expect(mocks.rm).toHaveBeenLastCalledWith(WORK_DIR, {
      recursive: true,
      force: true,
    });
  });

  it("skips recordings that are already on disk", async () => {
    mocks.hasLocalCopy.mockImplementation(
      (_directory, entry) => entry.fileId === ENTRY_ONE.fileId,
    );
    const check = await startService();

    await check();

    expect(mocks.downloadMedia).toHaveBeenCalledWith(
      expect.objectContaining({ entry: ENTRY_TWO }),
    );
    expect(mocks.downloadMedia).not.toHaveBeenCalledWith(
      expect.objectContaining({ entry: ENTRY_ONE }),
    );
    expect(mocks.log).toHaveBeenCalledWith(
      `2 recording(s) on the device, 1 missing from ${TARGET_DIR}`,
    );
  });

  it("claims every missing recording before downloading any of them", async () => {
    const check = await startService();

    await check();

    expect(mocks.markDownloadStarted).toHaveBeenNthCalledWith(
      2,
      TARGET_DIR,
      ENTRY_TWO,
    );
    expect(
      Math.max(...mocks.markDownloadStarted.mock.invocationCallOrder),
    ).toBeLessThan(mocks.downloadMedia.mock.invocationCallOrder[0] ?? 0);
  });

  it("pulls each recording over RTSP with the configured credentials", async () => {
    mocks.getMediaList.mockResolvedValue([ENTRY_ONE]);
    const check = await startService();

    await check();

    expect(mocks.downloadMedia).toHaveBeenCalledWith({
      host: CONTROL_API.host,
      port: 1_554,
      username: USERNAME,
      password: PASSWORD,
      entry: ENTRY_ONE,
      workDir: WORK_DIR,
    });
  });

  it("muxes the streams into the target directory and marks the entry done", async () => {
    mocks.getMediaList.mockResolvedValue([ENTRY_ONE]);
    const check = await startService();

    await check();

    expect(mocks.muxToMp4).toHaveBeenCalledWith(
      streamsFor(ENTRY_ONE),
      `${TARGET_DIR}/file-1.mp4`,
    );
    expect(mocks.markDownloadFinished).toHaveBeenCalledWith(
      TARGET_DIR,
      ENTRY_ONE,
    );
  });

  it("removes the raw streams once they have been muxed", async () => {
    mocks.getMediaList.mockResolvedValue([ENTRY_ONE]);
    const check = await startService();

    await check();

    expect(mocks.rm).toHaveBeenCalledWith(`${WORK_DIR}/file-1.h264`, {
      force: true,
    });
    expect(mocks.rm).toHaveBeenCalledWith(`${WORK_DIR}/file-1.audio`, {
      force: true,
    });
  });

  it("removes the raw streams even when muxing fails", async () => {
    mocks.getMediaList.mockResolvedValue([ENTRY_ONE]);
    mocks.muxToMp4.mockRejectedValue(new Error("ffmpeg exited with code 1"));
    const check = await startService();

    await expect(check()).rejects.toThrow(
      "1 recording(s) could not be downloaded",
    );

    expect(mocks.rm).toHaveBeenCalledWith(`${WORK_DIR}/file-1.h264`, {
      force: true,
    });
    expect(mocks.markDownloadFinished).not.toHaveBeenCalled();
  });

  it("records why a recording could not be fetched", async () => {
    mocks.getMediaList.mockResolvedValue([ENTRY_ONE]);
    mocks.downloadMedia.mockRejectedValue(new Error("socket hang up"));
    const check = await startService();

    await expect(check()).rejects.toThrow(
      "1 recording(s) could not be downloaded",
    );

    expect(mocks.markDownloadFailed).toHaveBeenCalledWith(
      TARGET_DIR,
      ENTRY_ONE,
      "socket hang up",
    );
    expect(mocks.logError).toHaveBeenCalledWith("  failure: socket hang up");
  });

  it("keeps going after a recording failed and reports the total", async () => {
    mocks.downloadMedia
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockRejectedValueOnce(new Error("no response"));
    const check = await startService();

    await expect(check()).rejects.toThrow(
      "2 recording(s) could not be downloaded",
    );

    expect(mocks.markDownloadFailed).toHaveBeenNthCalledWith(
      2,
      TARGET_DIR,
      ENTRY_TWO,
      "no response",
    );
  });

  it("finishes the remaining recordings after one of them failed", async () => {
    mocks.downloadMedia.mockRejectedValueOnce(new Error("socket hang up"));
    const check = await startService();

    await expect(check()).rejects.toThrow(
      "1 recording(s) could not be downloaded",
    );

    expect(mocks.markDownloadFinished).toHaveBeenCalledWith(
      TARGET_DIR,
      ENTRY_TWO,
    );
  });

  it("stays quiet when there is nothing to download", async () => {
    mocks.hasLocalCopy.mockReturnValue(true);
    const check = await startService();

    await check();

    expect(mocks.downloadMedia).not.toHaveBeenCalled();
    expect(mocks.markDownloadStarted).not.toHaveBeenCalled();
    expect(mocks.downloadsStarted).not.toHaveBeenCalled();
    expect(mocks.downloadsFinished).not.toHaveBeenCalled();
  });

  it("notifies when a batch of downloads begins and ends", async () => {
    const check = await startService();

    await check();

    expect(mocks.downloadsStarted).toHaveBeenCalledOnce();
    expect(mocks.downloadsFinished).toHaveBeenCalledExactlyOnceWith({
      downloaded: 2,
      failed: 0,
    });
    expect(mocks.flush).not.toHaveBeenCalled();
  });

  it("flushes the summary before a failure stops the service", async () => {
    mocks.downloadMedia.mockRejectedValue(new Error("socket hang up"));
    const check = await startService();

    await expect(check()).rejects.toThrow(
      "2 recording(s) could not be downloaded",
    );

    expect(mocks.downloadsFinished).toHaveBeenCalledExactlyOnceWith({
      downloaded: 0,
      failed: 2,
    });
    expect(mocks.flush).toHaveBeenCalledWith();
  });
});
