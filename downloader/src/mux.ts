import { spawn } from "node:child_process";
import { rename, rm } from "node:fs/promises";
import process from "node:process";

import type { DownloadResult } from "./vigi/download.ts";

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

  // The output carries a `.part` suffix, so ffmpeg cannot infer the container.
  args.push("-c:v", "copy", "-movflags", "+faststart", "-f", "mp4", targetPath);

  return args;
}

/** Remuxes the raw elementary streams into a playable MP4. */
export async function muxToMp4(
  streams: DownloadResult,
  outputPath: string,
): Promise<void> {
  const ffmpegPath = process.env["FFMPEG_PATH"] ?? "ffmpeg";
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
