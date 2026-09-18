import { Agent, request } from "node:https";

import { TransientError } from "../transient-error.ts";
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

// Without this, an unreachable device leaves a long-running caller hanging forever.
const REQUEST_TIMEOUT_MS = 15_000;

// VIGI-SPEC.md, Appendix 1 (OpenAPI and Stream interface error codes).
const ERROR_MESSAGES = new Map<number, string>([
  [-10_000, "Unknown error"],
  [-10_001, "Json parse failed"],
  [-10_002, "Unauthorized Error"],
  [-10_003, "Method not supported"],
  [-10_004, "No method in request"],
  [-10_005, "No params in request"],
  [-10_006, "Parameter value not exist"],
  [-10_007, "Multiple request has no requests"],
  [-10_008, "Requests in multipleRequest is not an array"],
  [-10_009, "Payload format error"],
  [-10_010, "Parameter error"],
  [-10_011, "The number of clients used for playback reached the limit"],
  [-10_012, "Client id is occupied or invalid"],
  [-10_013, "Storage device does not exist"],
  [-10_014, "Failed to search for events"],
  [-10_015, "The request failed, please restart the request"],
  [-10_016, "The motor arrives at the stalled rotor"],
  [-10_020, "Authentication failed or password error"],
  [
    -10_021,
    "Authentication failed because the number of supported clients is exceeded",
  ],
  [-10_022, "The number of retries has been exceeded, and it has been locked"],
  [-10_030, "Unsupported directives"],
  [-501, "Json error"],
  [-502, "Json parse error"],
  [-52_410, "Json already talking"],
  [-52_405, "Session up to limit"],
]);

function describeErrorCode(code: unknown): string {
  return ERROR_MESSAGES.get(Number(code)) ?? `unknown errCode ${String(code)}`;
}

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
        timeout: REQUEST_TIMEOUT_MS,
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

    clientRequest.on("timeout", () => {
      clientRequest.destroy(
        new Error(`no response within ${REQUEST_TIMEOUT_MS} ms`),
      );
    });
    // Nothing reaching this handler comes from the device rejecting us; the
    // connection itself failed, so the caller is free to try again later.
    clientRequest.on("error", (error: Error) => {
      reject(
        new TransientError(`POST ${path} failed: ${error.message}`, {
          cause: error,
        }),
      );
    });
    clientRequest.end(body);
  });
}

type Challenge = {
  algorithm: string;
  method: string;
  nonce: string;
  realm: string;
  uri: string;
};

function readChallenge(result: Record<string, unknown>): Challenge | undefined {
  const fields = asRecord(result["authenticate"]);
  if (fields === undefined) {
    return undefined;
  }

  return {
    algorithm: asText(fields["algorithm"]) ?? "MD5",
    method: asText(fields["method"]) ?? "",
    nonce: asText(fields["nonce"]) ?? "",
    realm: asText(fields["realm"]) ?? "",
    uri: asText(fields["uri"]) ?? "",
  };
}

function answerChallenge(
  challenge: Challenge,
  username: string,
  password: string,
): { nonce: string; response: string } {
  const { algorithm, method, nonce, realm, uri } = challenge;

  const a1 = digestHash(algorithm, `${username}:${realm}:${password}`);
  const a2 = digestHash(algorithm, `${method}:${uri}`);

  return { nonce, response: digestHash(algorithm, `${a1}:${nonce}:${a2}`) };
}

// The device reports failed attempts as `time` out of `max_time` and locks the
// account once they meet (errCode -10022), so we always stop one short.
function attemptsLeft(result: Record<string, unknown>): number {
  const used = Number(result["time"] ?? Number.NaN);
  const max = Number(result["max_time"] ?? Number.NaN);

  return Number.isFinite(used) && Number.isFinite(max)
    ? max - used
    : Number.POSITIVE_INFINITY;
}

const MAX_HANDSHAKE_ATTEMPTS = 2;

async function login(
  options: ControlApiOptions,
  username: string,
  password: string,
): Promise<string> {
  let result = await post(options, "/", {
    method: "doAuth",
    // The device rejects the request unless `params` is present and JSON null.
    // oxlint-disable-next-line unicorn/no-null
    params: null,
  });

  for (let attempt = 1; ; attempt += 1) {
    const challenge = readChallenge(result);
    if (challenge === undefined) {
      throw new Error(
        `doAuth did not return a challenge: ${describeErrorCode(result["errCode"])} (${JSON.stringify(result)})`,
      );
    }

    result = await post(options, "/", {
      method: "doAuth",
      params: answerChallenge(challenge, username, password),
    });

    const { stok } = result;
    if (typeof stok === "string" && stok !== "") {
      return stok;
    }

    // A rejection comes back shaped exactly like the opening challenge
    // (VIGI-SPEC.md, 2.2.1), carrying a new nonce. The device only keeps one
    // pending nonce, so this is what a wrong password and someone else
    // starting a handshake between our two requests both look like. Answering
    // the fresh nonce is the only way to tell them apart, but each try counts
    // towards the lockout, so we give up while an attempt is still spare.
    if (
      attempt >= MAX_HANDSHAKE_ATTEMPTS ||
      readChallenge(result) === undefined ||
      attemptsLeft(result) <= 1
    ) {
      throw new Error(
        `doAuth failed: ${describeErrorCode(result["errCode"])} (${JSON.stringify(result)})`,
      );
    }
  }
}

// A token lives for half an hour (VIGI-SPEC.md, 4.1.1). Re-running the
// handshake on every check instead would occupy a fresh session slot each time
// and widen the window for the nonce race above, so tokens are kept and
// refreshed early enough that no call starts with one about to lapse.
const TOKEN_TTL_MS = 25 * 60_000;

type Session = { expiresAt: number; stok: string };

const sessions = new Map<string, Session>();
const handshakes = new Map<string, Promise<string>>();

function sessionKey(options: ControlApiOptions): string {
  return `${options.host}:${options.port}`;
}

function forgetSession(options: ControlApiOptions): void {
  sessions.delete(sessionKey(options));
}

/** Returns a session token (`stok`), reusing the current one while it lasts. */
export function authenticate(
  options: ControlApiOptions,
  username: string,
  password: string,
): Promise<string> {
  const key = sessionKey(options);

  const session = sessions.get(key);
  if (session !== undefined && session.expiresAt > Date.now()) {
    return Promise.resolve(session.stok);
  }

  // Two overlapping callers would otherwise invalidate each other's nonce.
  const pending = handshakes.get(key);
  if (pending !== undefined) {
    return pending;
  }

  const handshake = login(options, username, password)
    .then((stok) => {
      sessions.set(key, { expiresAt: Date.now() + TOKEN_TTL_MS, stok });
      return stok;
    })
    .finally(() => {
      handshakes.delete(key);
    });

  handshakes.set(key, handshake);

  return handshake;
}

const UNAUTHORIZED = -10_002;

function assertOk(
  options: ControlApiOptions,
  result: Record<string, unknown>,
  method: string,
): void {
  const errorCode = Number(result["errCode"] ?? 0);
  if (errorCode === 0) {
    return;
  }

  const message = `${method} failed: ${describeErrorCode(errorCode)} (${JSON.stringify(result)})`;

  // The device dropped the token ahead of its advertised lifetime. Nothing was
  // rejected about our credentials, so the next run may simply log in again.
  if (errorCode === UNAUTHORIZED) {
    forgetSession(options);
    throw new TransientError(message);
  }

  throw new Error(message);
}

/** Turns motion detection on or off, preserving the device's other motion settings. */
export async function setMotionDetectionSwitch(
  options: ControlApiOptions,
  stok: string,
  enabled: boolean,
): Promise<void> {
  const path = `/stok=${encodeURIComponent(stok)}`;

  const current = await post(options, path, {
    method: "getMotionDetectionSwitch",
  });

  assertOk(options, current, "getMotionDetectionSwitch");

  // The device rejects the write with errCode -10009 unless `sensitivity` is
  // sent alongside `enabled`, so we just echo back everything it just reported.
  const settings = asRecord(current["result"]);
  if (settings === undefined) {
    throw new Error("getMotionDetectionSwitch did not return any settings");
  }

  const result = await post(options, path, {
    method: "setMotionDetectionSwitch",
    params: { ...settings, enabled: enabled ? "on" : "off" },
  });

  assertOk(options, result, "setMotionDetectionSwitch");
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
    assertOk(options, result, "getMediaList");

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
