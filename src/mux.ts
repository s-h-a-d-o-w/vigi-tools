import { spawn } from "node:child_process";
import { rename, rm } from "node:fs/promises";

import ffmpegStatic from "ffmpeg-static";

import type { DownloadResult } from "./vigi/download.ts";

// `ffmpeg-static` is CommonJS (`module.exports = path`) but ships ESM-style
// types, so TypeScript infers the namespace object instead of the string.
const ffmpegPath = ffmpegStatic as unknown as string | null;

function audioInputFormat(codec: string): string | undefined {
  const normalized = codec.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");

  if (normalized.includes("alaw")) {
    return "alaw";
  }

  if (normalized.includes("ulaw") || normalized.includes("mulaw")) {
    return "mulaw";
  }

  return undefined;
}

function buildArguments(streams: DownloadResult, targetPath: string): string[] {
  const args = [
    "-y",
    "-fflags",
    "+genpts",
    "-f",
    "h264",
    "-i",
    streams.videoPath,
  ];
  const { audioCodec } = streams.av;
  const format =
    audioCodec === undefined ? undefined : audioInputFormat(audioCodec);

  if (streams.audioPath !== undefined && format !== undefined) {
    args.push(
      "-f",
      format,
      "-ar",
      String(streams.av.audioSampleRate),
      "-ac",
      String(streams.av.audioChannels),
      "-i",
      streams.audioPath,
      "-c:a",
      "aac",
    );
  }

  args.push("-c:v", "copy", "-movflags", "+faststart", targetPath);

  return args;
}

/** Remuxes the raw elementary streams into a playable MP4. */
export async function muxToMp4(
  streams: DownloadResult,
  outputPath: string,
): Promise<void> {
  if (ffmpegPath === null) {
    throw new Error(
      "ffmpeg binary is unavailable - is `ffmpeg-static` installed for this platform?",
    );
  }

  const temporaryPath = `${outputPath}.part`;
  const args = buildArguments(streams, temporaryPath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"] as const,
    });
    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg exited with code ${String(code)}:\n${stderr}`));
    });
  }).catch(async (error: unknown) => {
    await rm(temporaryPath, { force: true });
    throw error;
  });

  await rename(temporaryPath, outputPath);
}
