import { loadDeviceConfig, loadSesConfig } from "../shared/config.ts";
import { createEnvReader } from "../shared/env.ts";

import { envSchema } from "./env-schema.ts";

/** How often the low battery indication of the devices is read. */
const BATTERY_CHECK_INTERVAL = 12 * 3_600_000;

export function loadConfig() {
  const env = createEnvReader(envSchema);

  return {
    ...loadDeviceConfig(),
    devices: env.list("PRESENCE_DEVICES"),
    checkIntervalSeconds: env.number("CHECK_INTERVAL_SECONDS"),
    batteryCheckInterval: BATTERY_CHECK_INTERVAL,
    // Battery warnings stay off until a recipient is configured.
    batteryWarning: loadSesConfig(env),
  };
}
