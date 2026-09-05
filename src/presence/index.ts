import { log } from "../shared/log.ts";
import { runForever } from "../shared/loop.ts";
import {
  authenticate,
  type ControlApiOptions,
  setMotionDetectionSwitch,
} from "../shared/vigi/control-api.ts";

import { anyDevicePresent } from "./ble.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const controlApi: ControlApiOptions = {
  host: config.host,
  port: config.apiPort,
  rejectUnauthorized: config.rejectUnauthorized,
};

// Undefined until the first successful switch, so the initial state is always
// written to the device rather than assumed.
let appliedState: boolean | undefined;

async function check(): Promise<void> {
  const presentDevice = await anyDevicePresent(
    config.devices,
    config.checkIntervalSeconds,
  );
  const shouldDetect = presentDevice === undefined;

  log(
    presentDevice === undefined ? "nobody home" : `${presentDevice} is nearby`,
  );

  if (shouldDetect === appliedState) {
    return;
  }

  const stok = await authenticate(controlApi, config.username, config.password);
  await setMotionDetectionSwitch(controlApi, stok, shouldDetect);
  appliedState = shouldDetect;
  log(`  motion detection turned ${shouldDetect ? "on" : "off"}`);
}

// The scan inside `check` already lasts a full interval, so no extra wait.
await runForever(0, check);
