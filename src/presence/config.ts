import { loadDeviceConfig } from "../shared/config.ts";
import { createEnvReader } from "../shared/env.ts";

import { envSchema } from "./env-schema.ts";

export function loadConfig() {
  const env = createEnvReader(envSchema);

  return {
    ...loadDeviceConfig(),
    devices: env.list("PRESENCE_DEVICES"),
    checkIntervalSeconds: env.number("CHECK_INTERVAL_SECONDS"),
  };
}
