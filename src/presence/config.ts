import { loadDeviceConfig } from "../shared/config.ts";
import { createEnvReader } from "../shared/env.ts";

import { envSchema } from "./env-schema.ts";

export function loadConfig() {
  const env = createEnvReader(envSchema);

  return {
    ...loadDeviceConfig(),
    devices: env.list("PRESENCE_DEVICES"),
    checkIntervalMs: env.number("CHECK_INTERVAL_SECONDS") * 1000,
    scanSeconds: env.number("BLE_SCAN_SECONDS"),
  };
}
