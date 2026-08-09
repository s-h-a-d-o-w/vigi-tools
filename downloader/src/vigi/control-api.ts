import { Agent, request } from "node:https";

import type { EventType, MediaEntry } from "../types.ts";
import { digestHash } from "./digest.ts";

// The device closes idle connections immediately, so a pooled socket is often
// already dead by the time Node reuses it ("socket hang up").
const agent = new Agent({ keepAlive: false, maxSockets: 1 });

export type ControlApiOptions = {
  host: string;
  port: number;
  rejectUnauthorized: boolean;
};

const PAGE_SIZE = 10;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function itemAt(value: unknown, index: number): unknown {
  return Array.isArray(value) ? (value as unknown[])[index] : undefined;
}

function asText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return typeof value === "number" ? String(value) : undefined;
}

function post(
  options: ControlApiOptions,
  path: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    const clientRequest = request(
      {
        host: options.host,
        port: options.port,
        path,
        method: "POST",
        agent,
        rejectUnauthorized: options.rejectUnauthorized,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Connection: "close",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown;

          try {
            parsed = JSON.parse(text);
          } catch {
            reject(
              new Error(
                `Expected JSON from ${path} but got: ${text.slice(0, 200)}`,
              ),
            );
            return;
          }

          const record = asRecord(parsed);
          if (record === undefined) {
            reject(new Error(`Expected a JSON object from ${path}`));
            return;
          }

          resolve(record);
        });
      },
    );

    clientRequest.on("error", (error: Error) => {
      reject(
        new Error(`POST ${path} failed: ${error.message}`, { cause: error }),
      );
    });
    clientRequest.end(body);
  });
}

/** Performs the two-step `doAuth` handshake and returns the session token (`stok`). */
export async function authenticate(
  options: ControlApiOptions,
  username: string,
  password: string,
): Promise<string> {
  const challenge = await post(options, "/", {
    method: "doAuth",
    // The device rejects the request unless `params` is present and JSON null.
    // oxlint-disable-next-line unicorn/no-null
    params: null,
  });
  const fields = asRecord(challenge["authenticate"]);

  if (fields === undefined) {
    throw new Error(
      `doAuth did not return a challenge (errCode ${String(challenge["errCode"])})`,
    );
  }

  const algorithm = asText(fields["algorithm"]) ?? "MD5";
  const realm = asText(fields["realm"]) ?? "";
  const nonce = asText(fields["nonce"]) ?? "";

  const a1 = digestHash(algorithm, `${username}:${realm}:${password}`);
  const a2 = digestHash(
    algorithm,
    `${asText(fields["method"]) ?? ""}:${asText(fields["uri"]) ?? ""}`,
  );
  const response = digestHash(algorithm, `${a1}:${nonce}:${a2}`);

  const result = await post(options, "/", {
    method: "doAuth",
    params: { nonce, response },
  });
  const { stok } = result;

  if (typeof stok !== "string" || stok === "") {
    throw new Error(
      `doAuth failed with errCode ${String(result["errCode"])} (${JSON.stringify(result)})`,
    );
  }

  return stok;
}

function toMediaEntries(media: Record<string, unknown>): MediaEntry[] {
  const fileIds = Array.isArray(media["file_id"])
    ? (media["file_id"] as unknown[])
    : [];

  return fileIds.map((fileId, index) => ({
    fileId: asText(fileId) ?? "",
    startTime: Number(itemAt(media["start_time"], index) ?? 0),
    endTime: Number(itemAt(media["end_time"], index) ?? 0),
    size: Number(itemAt(media["size"], index) ?? 0),
    eventType: asText(itemAt(media["event_type"], index)) ?? "",
    mediaType: asText(itemAt(media["media_type"], index)) ?? "video",
  }));
}

/** Fetches every recording in the given window, following the device's pagination. */
export async function getMediaList(
  options: ControlApiOptions,
  stok: string,
  query: {
    startTime: number;
    endTime: number;
    eventTypes: readonly EventType[];
  },
): Promise<MediaEntry[]> {
  const entries: MediaEntry[] = [];
  let startIndex = 0;

  for (;;) {
    const result = await post(options, `/stok=${encodeURIComponent(stok)}`, {
      method: "getMediaList",
      params: {
        start_time: String(query.startTime),
        end_time: String(query.endTime),
        event_type: [...query.eventTypes],
        media_type: ["video"],
        start_index: startIndex,
        max_num: PAGE_SIZE,
      },
    });

    // spec is wrong, it's actually `errCode` not `error_code`
    const errorCode = Number(result["errCode"] ?? 0);
    if (errorCode !== 0) {
      throw new Error(`getMediaList failed with errCode ${errorCode}`);
    }

    // spec is wrong, it's actually `result` not `media`
    const media = asRecord(result["result"]);
    if (media === undefined) {
      break;
    }

    const page = toMediaEntries(media);
    entries.push(...page);

    const total = Number(media["total_num"] ?? 0);
    if (page.length < PAGE_SIZE || (total > 0 && entries.length >= total)) {
      break;
    }

    startIndex += page.length;
  }

  return entries;
}
