import path from "node:path";

import { loadDotEnv } from "shared/env.ts";
import { log } from "shared/log.ts";
import { runForever } from "shared/loop.ts";
import {
  authenticate,
  type ControlApiOptions,
  setMotionDetectionSwitch,
} from "shared/vigi/control-api.ts";

import { loadConfig } from "./config.ts";
import { anyDevicePresent } from "./ping.ts";

// The device expires tokens after half an hour, so refresh well before that.
const TOKEN_LIFETIME_MS = 20 * 60 * 1000;

loadDotEnv(path.join(import.meta.dirname, ".."));

const config = loadConfig();
const controlApi: ControlApiOptions = {
  host: config.host,
  port: config.apiPort,
  rejectUnauthorized: config.rejectUnauthorized,
};

let token: { value: string; issuedAt: number } | undefined;

async function getToken(forceRefresh: boolean): Promise<string> {
  if (
    forceRefresh ||
    token === undefined ||
    Date.now() - token.issuedAt > TOKEN_LIFETIME_MS
  ) {
    token = {
      value: await authenticate(controlApi, config.username, config.password),
      issuedAt: Date.now(),
    };
  }

  return token.value;
}

async function applyMotionDetection(enabled: boolean): Promise<void> {
  try {
    await setMotionDetectionSwitch(controlApi, await getToken(false), enabled);
  } catch (error) {
    // A cached token may have been invalidated by a reboot or another client.
    log(
      `  retrying with a fresh token after: ${error instanceof Error ? error.message : String(error)}`,
    );
    await setMotionDetectionSwitch(controlApi, await getToken(true), enabled);
  }
}

// Undefined until the first successful switch, so the initial state is always
// written to the device rather than assumed.
let appliedState: boolean | undefined;

async function check(): Promise<void> {
  const presentDevice = await anyDevicePresent(
    config.devices,
    config.pingTimeoutMs,
  );
  const shouldDetect = presentDevice === undefined;

  log(
    presentDevice === undefined
      ? "nobody home"
      : `${presentDevice} is on the network`,
  );

  if (shouldDetect === appliedState) {
    return;
  }

  await applyMotionDetection(shouldDetect);
  appliedState = shouldDetect;
  log(`  motion detection turned ${shouldDetect ? "on" : "off"}`);
}

await runForever(config.checkIntervalMs, check);
