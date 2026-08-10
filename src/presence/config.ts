import { loadDeviceConfig } from "../shared/config.ts";
import { optionalNumber, requiredList } from "../shared/env.ts";

export function loadConfig() {
  return {
    ...loadDeviceConfig(),
    devices: requiredList("PRESENCE_DEVICES"),
    checkIntervalMs: optionalNumber("CHECK_INTERVAL_MS", 60_000),
    pingTimeoutSeconds: optionalNumber("PING_TIMEOUT_SECONDS", 4),
  };
}
