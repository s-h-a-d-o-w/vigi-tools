import { deviceEnvSchema, type EnvField } from "../shared/env-schema.ts";

export const envSchema: EnvField[] = [
  ...deviceEnvSchema,
  {
    name: "PRESENCE_DEVICES",
    description:
      "Comma-separated Bluetooth LE addresses (e.g. AA:BB:CC:DD:EE:FF) whose presence disables motion detection",
  },
  {
    name: "CHECK_INTERVAL_SECONDS",
    description: "How often device presence is checked (seconds)",
    default: "32",
  },
  {
    name: "BLE_SCAN_SECONDS",
    description: "How long each Bluetooth LE scan runs (seconds)",
    default: "10",
  },
];
