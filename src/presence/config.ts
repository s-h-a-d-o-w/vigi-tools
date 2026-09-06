import { loadDeviceConfig, loadSesConfig } from "../shared/config.ts";
import { createEnvReader, type EnvReader } from "../shared/env.ts";
import type { SesConfig } from "../shared/ses.ts";

import { envSchema } from "./env-schema.ts";

/** How often a nearby device's low battery indication is read. */
const BATTERY_CHECK_INTERVAL_MS = 12 * 3_600_000;

export type BatteryWarningConfig = SesConfig & {
  checkIntervalMs: number;
};

/** Battery warnings stay off until a recipient is configured. */
function loadBatteryWarningConfig(
  env: EnvReader,
): BatteryWarningConfig | undefined {
  const ses = loadSesConfig(env);

  if (ses === undefined) {
    return undefined;
  }

  return {
    ...ses,
    checkIntervalMs: BATTERY_CHECK_INTERVAL_MS,
  };
}

export function loadConfig() {
  const env = createEnvReader(envSchema);

  return {
    ...loadDeviceConfig(),
    devices: env.list("PRESENCE_DEVICES"),
    checkIntervalSeconds: env.number("CHECK_INTERVAL_SECONDS"),
    batteryWarning: loadBatteryWarningConfig(env),
  };
}
