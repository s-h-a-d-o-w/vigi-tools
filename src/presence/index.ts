import { log } from "../shared/log.ts";
import { runForever } from "../shared/loop.ts";
import {
  authenticate,
  type ControlApiOptions,
  setMotionDetectionSwitch,
} from "../shared/vigi/control-api.ts";

import { loadConfig } from "./config.ts";
import { anyDevicePresent } from "./ping.ts";

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
    config.pingTimeoutSeconds,
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

  const stok = await authenticate(controlApi, config.username, config.password);
  await setMotionDetectionSwitch(controlApi, stok, shouldDetect);
  appliedState = shouldDetect;
  log(`  motion detection turned ${shouldDetect ? "on" : "off"}`);
}

await runForever(config.checkIntervalMs, check);
