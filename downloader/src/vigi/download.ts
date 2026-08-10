import { randomUUID } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import path from "node:path";
import { finished as streamFinished } from "node:stream/promises";

import type { MediaEntry } from "shared/types.ts";
import {
  buildAuthorization,
  parseWwwAuthenticate,
} from "shared/vigi/digest.ts";

import { sanitizeSegment } from "../media-store.ts";
import { H264Depacketizer, parseRtpPacket } from "./rtp.ts";
import { RtspClient } from "./rtsp-client.ts";

type AvConfig = {
  videoCodec: string;
  audioCodec: string | undefined;
  audioSampleRate: number;
  audioChannels: number;
};

export type DownloadResult = {
  videoPath: string;
  audioPath: string | undefined;
  av: AvConfig;
};

export type DownloadOptions = {
  host: string;
  port: number;
  username: string;
  password: string;
  entry: MediaEntry;
  workDir: string;
};

const IDLE_TIMEOUT = 20_000;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return typeof value === "number" ? String(value) : undefined;
}

function parseInterleavedIds(response: Record<string, unknown>): {
  video: number;
  audio: number | undefined;
} {
  const interleaved = Array.isArray(response["interleaved"])
    ? (response["interleaved"] as unknown[])
    : [];
  const first = asRecord(interleaved[0]);
  const raw = asText(first?.["interleaved_id"]) ?? "0-1";
  const parts = raw.split("-").map((part) => Number(part.trim()));
  const [video, audio] = parts;

  return {
    video: video !== undefined && Number.isFinite(video) ? video : 0,
    audio: audio !== undefined && Number.isFinite(audio) ? audio : undefined,
  };
}

/**
 * The device advertises a single interleaved channel but multiplexes video and
 * audio onto it, so the RTP payload type is what actually separates them.
 */
function audioPayloadType(codec: string | undefined): number | undefined {
  const normalized = codec?.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");

  if (normalized === undefined) {
    return undefined;
  }

  if (normalized.includes("alaw")) {
    return 8;
  }

  return normalized.includes("ulaw") || normalized.includes("mulaw")
    ? 0
    : undefined;
}

function parseAvConfig(response: Record<string, unknown>): AvConfig {
  const configs = Array.isArray(response["av_config"])
    ? (response["av_config"] as unknown[])
    : [];
  const first = asRecord(configs[0]) ?? {};
  const rawSampleRate = Number(first["audio_sampling_rate"] ?? 8);

  return {
    videoCodec: asText(first["video_codec"]) ?? "H264",
    audioCodec: asText(first["audio_codec"]),
    // The device reports kHz (e.g. "8") while ffmpeg expects Hz.
    audioSampleRate:
      rawSampleRate < 1000 ? rawSampleRate * 1000 : rawSampleRate,
    audioChannels: Number(first["audio_channels"] ?? 1),
  };
}

/**
 * Opens a MULTITRANS session, depacketizes the interleaved RTP stream and writes
 * the elementary streams into `workDir`.
 */
export async function downloadMedia(
  options: DownloadOptions,
): Promise<DownloadResult> {
  const { host, port, username, password, entry, workDir } = options;
  const uri =
    port === 554
      ? `rtsp://${host}/multitrans`
      : `rtsp://${host}:${port}/multitrans`;

  let onFrame: ((channel: number, payload: Buffer) => void) | undefined;
  let onStreamFinished: (() => void) | undefined;

  const client = new RtspClient({
    host,
    port,
    onFrame: (channel, payload) => onFrame?.(channel, payload),
    onNotification: (body) => {
      // console.warn(`  device notification: ${body.slice(0, 200)}`);

      if (body.includes('"status"') && body.includes('"finished"')) {
        onStreamFinished?.();
      }
    },
  });

  await client.connect();

  try {
    // The device only accepts a body once the connection carries an
    // authenticated session, so the handshake runs on empty requests first.
    const clientUuid = randomUUID();
    const challenge = await client.request("MULTITRANS", uri, {
      "X-Client-UUID": clientUuid,
    });
    const challengeHeader = challenge.headers.get("www-authenticate");

    if (challengeHeader === undefined) {
      throw new Error("Device asked for authentication but sent no challenge");
    }

    const authorization = buildAuthorization({
      challenge: parseWwwAuthenticate(challengeHeader),
      username,
      password,
      method: "MULTITRANS",
      uri,
    });

    const opened = await client.request("MULTITRANS", uri, {
      Authorization: authorization,
      "X-Client-UUID": clientUuid,
    });

    if (opened.statusCode !== 200) {
      throw new Error(`MULTITRANS auth failed: ${opened.statusLine}`);
    }

    const session = (opened.headers.get("session") ?? "").split(";")[0]?.trim();

    if (session === undefined || session === "") {
      throw new Error("Device did not open a MULTITRANS session");
    }

    // Verified against a VIGI C440: `method` is the verb and the module name
    // carries the payload flat. The spec's nested `params` shape is ignored.
    const body = JSON.stringify({
      type: "request",
      seq: 0,
      params: {
        method: "do",
        download: {
          client_id: 1,
          start_time: String(entry.startTime),
          end_time: String(entry.endTime),
          file_id: entry.fileId,
          event_type: [entry.eventType],
          media_type: "video",
        },
      },
    });

    const message = await client.request(
      "MULTITRANS",
      uri,
      {
        Authorization: authorization,
        "X-Client-UUID": clientUuid,
        Session: session,
      },
      body,
    );

    if (message.statusCode !== 200) {
      throw new Error(`MULTITRANS failed: ${message.statusLine}`);
    }

    const envelope = asRecord(JSON.parse(message.body)) ?? {};
    const response = asRecord(envelope["params"]) ?? envelope;
    const errorCode = Number(response["error_code"] ?? 0);

    if (errorCode !== 0) {
      throw new Error(`download failed with error_code ${errorCode}`);
    }

    const av = parseAvConfig(response);
    if (av.videoCodec.toUpperCase() !== "H264") {
      throw new Error(
        `Unsupported video codec ${av.videoCodec}; only H264 is implemented`,
      );
    }

    const channels = parseInterleavedIds(response);
    const audioType = audioPayloadType(av.audioCodec);
    const baseName = sanitizeSegment(entry.fileId);
    const videoPath = path.join(workDir, `${baseName}.h264`);
    const audioPath =
      audioType === undefined
        ? undefined
        : path.join(workDir, `${baseName}.audio`);

    const videoStream = createWriteStream(videoPath);
    const audioStream: WriteStream | undefined =
      audioPath === undefined ? undefined : createWriteStream(audioPath);

    let settle: (() => void) | undefined;
    const completed = new Promise<void>((resolve) => {
      settle = resolve;
    });

    let idleTimer: NodeJS.Timeout | undefined;
    const restartIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => settle?.(), IDLE_TIMEOUT);
    };

    onStreamFinished = () => settle?.();

    const depacketizer = new H264Depacketizer();

    onFrame = (channel, payload) => {
      restartIdleTimer();

      const packet = parseRtpPacket(payload);
      if (packet === undefined) {
        return;
      }

      if (packet.payloadType === audioType || channel === channels.audio) {
        audioStream?.write(packet.payload);
      } else if (channel === channels.video) {
        for (const unit of depacketizer.push(packet.payload)) {
          videoStream.write(unit);
        }
      }
    };

    restartIdleTimer();
    void client.waitForClose().then(() => settle?.());

    await completed;

    clearTimeout(idleTimer);
    onFrame = undefined;
    onStreamFinished = undefined;

    videoStream.end();
    audioStream?.end();
    await Promise.all([
      streamFinished(videoStream),
      audioStream === undefined
        ? Promise.resolve()
        : streamFinished(audioStream),
    ]);

    return { videoPath, audioPath, av };
  } finally {
    client.close();
  }
}
