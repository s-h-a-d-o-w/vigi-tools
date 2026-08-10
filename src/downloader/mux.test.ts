import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { spawn } from "node:child_process";
import type { rename, rm } from "node:fs/promises";

import type { DownloadResult } from "./vigi/download.ts";
import { muxToMp4 } from "./mux.ts";

type FakeChild = EventEmitter & {
  stderr: EventEmitter & { setEncoding: (encoding: string) => void };
};

const mocks = vi.hoisted(() => ({
  spawn:
    vi.fn<
      (file: string, args: readonly string[], options: unknown) => unknown
    >(),
  rename: vi.fn<typeof rename>(),
  rm: vi.fn<typeof rm>(),
}));

vi.mock(import("node:child_process"), () => ({
  // The real signature carries overloads that mux.ts does not use.
  spawn: mocks.spawn as unknown as typeof spawn,
}));
vi.mock(import("node:fs/promises"), async (importOriginal) => ({
  ...(await importOriginal()),
  rename: mocks.rename,
  rm: mocks.rm,
}));

const STREAMS: DownloadResult = {
  videoPath: "/work/file-1.h264",
  audioPath: "/work/file-1.audio",
  av: {
    videoCodec: "H264",
    audioCodec: "G711alaw",
    audioSampleRate: 8000,
    audioChannels: 1,
  },
};

const OUTPUT = "/recordings/file-1.mp4";
const PARTIAL = `${OUTPUT}.part`;

function createChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stderr = Object.assign(new EventEmitter(), {
    setEncoding: vi.fn<(encoding: string) => void>(),
  });

  return child;
}

/** Answers the next `spawn` with a process that ends the given way. */
function ffmpegEnds(outcome: {
  code?: number;
  error?: Error;
  stderr?: string;
}): void {
  mocks.spawn.mockImplementation(() => {
    const child = createChild();

    setImmediate(() => {
      if (outcome.stderr !== undefined) {
        child.stderr.emit("data", outcome.stderr);
      }

      if (outcome.error === undefined) {
        child.emit("close", outcome.code ?? 0);
      } else {
        child.emit("error", outcome.error);
      }
    });

    return child;
  });
}

/** The arguments ffmpeg was started with. */
function ffmpegArguments(): readonly string[] {
  return mocks.spawn.mock.lastCall?.[1] ?? [];
}

describe(muxToMp4, () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.rename.mockResolvedValue(undefined);
    mocks.rm.mockResolvedValue(undefined);
    ffmpegEnds({ code: 0 });
  });

  it("copies the video stream instead of re-encoding it", async () => {
    await muxToMp4({ ...STREAMS, audioPath: undefined }, OUTPUT);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining(["-f", "h264", "-i", STREAMS.videoPath]),
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    expect(ffmpegArguments()).toContain("copy");
    expect(ffmpegArguments()).not.toContain("aac");
  });

  it("re-encodes A-law audio to AAC", async () => {
    await muxToMp4(STREAMS, OUTPUT);

    expect(ffmpegArguments().join(" ")).toContain(
      "-f alaw -ar 8000 -ac 1 -i /work/file-1.audio -c:a aac",
    );
  });

  it("re-encodes mu-law audio to AAC", async () => {
    await muxToMp4(
      { ...STREAMS, av: { ...STREAMS.av, audioCodec: "G711 mu-law" } },
      OUTPUT,
    );

    expect(ffmpegArguments().join(" ")).toContain("-f mulaw");
  });

  it("drops audio ffmpeg cannot be told how to read", async () => {
    await muxToMp4(
      { ...STREAMS, av: { ...STREAMS.av, audioCodec: "G726" } },
      OUTPUT,
    );

    expect(ffmpegArguments()).not.toContain(STREAMS.audioPath);
  });

  it("names the container explicitly because the target is a partial file", async () => {
    await muxToMp4(STREAMS, OUTPUT);

    expect(ffmpegArguments().slice(-4)).toStrictEqual([
      "+faststart",
      "-f",
      "mp4",
      PARTIAL,
    ]);
  });

  it("only publishes the recording once ffmpeg succeeded", async () => {
    await muxToMp4(STREAMS, OUTPUT);

    expect(mocks.rename).toHaveBeenCalledWith(PARTIAL, OUTPUT);
    expect(mocks.rm).not.toHaveBeenCalled();
  });

  it("reports ffmpeg's last words when it exits with a failure", async () => {
    ffmpegEnds({ code: 1, stderr: "Invalid data found" });

    await expect(muxToMp4(STREAMS, OUTPUT)).rejects.toThrow(
      "ffmpeg exited with code 1:\nInvalid data found",
    );
  });

  it("removes the partial file and keeps the target untouched on failure", async () => {
    ffmpegEnds({ code: 1 });

    await expect(muxToMp4(STREAMS, OUTPUT)).rejects.toThrow(
      "ffmpeg exited with code 1",
    );

    expect(mocks.rm).toHaveBeenCalledWith(PARTIAL, { force: true });
    expect(mocks.rename).not.toHaveBeenCalled();
  });

  it("fails when ffmpeg cannot be started at all", async () => {
    ffmpegEnds({ error: new Error("spawn ffmpeg ENOENT") });

    await expect(muxToMp4(STREAMS, OUTPUT)).rejects.toThrow(
      "spawn ffmpeg ENOENT",
    );
    expect(mocks.rm).toHaveBeenCalledWith(PARTIAL, { force: true });
  });
});
