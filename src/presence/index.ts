import { log } from "../shared/log.ts";
import { runForever } from "../shared/loop.ts";
import {
  authenticate,
  type ControlApiOptions,
  setMotionDetectionSwitch,
} from "../shared/vigi/control-api.ts";

import { anyDevicePresent } from "./ble.ts";
import { loadConfig } from "./config.ts";
import { REQUIRED_ABSENT_SCANS } from "./env-schema.ts";
import { createBatteryWarner } from "./notify.ts";

const config = loadConfig();
const controlApi: ControlApiOptions = {
  host: config.host,
  port: config.apiPort,
  rejectUnauthorized: config.rejectUnauthorized,
};
const batteryWarner = createBatteryWarner(config.batteryWarning);

// Undefined until the first successful switch, so the initial state is always
// written to the device rather than assumed.
let appliedState: boolean | undefined;
let absentScans = 0;

async function check(): Promise<void> {
  const presentDevice = await anyDevicePresent(
    config.devices,
    config.checkIntervalSeconds,
  );

  absentScans = presentDevice === undefined ? absentScans + 1 : 0;
  if (absentScans > 0 && absentScans < REQUIRED_ABSENT_SCANS) {
    log(`  ${absentScans}/${REQUIRED_ABSENT_SCANS} absent scans`);
    return;
  }

  log(
    presentDevice === undefined ? `nobody home` : `${presentDevice} is nearby`,
  );

  const shouldDetect = absentScans >= REQUIRED_ABSENT_SCANS;
  if (shouldDetect !== appliedState) {
    const stok = await authenticate(
      controlApi,
      config.username,
      config.password,
    );
    await setMotionDetectionSwitch(controlApi, stok, shouldDetect);
    appliedState = shouldDetect;
    log(`  motion detection turned ${appliedState ? "on" : "off"}`);
  }
}

async function checkBatteries(): Promise<void> {
  await batteryWarner.check(config.devices);
}

// The scan inside `check` already lasts a full interval, so no extra wait. The
// batteries are read on their own, much slower schedule, because they outlive
// any number of presence scans.
await Promise.all([
  runForever(0, check),
  runForever(config.batteryCheckInterval, checkBatteries),
]);
