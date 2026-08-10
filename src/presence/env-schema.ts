import { deviceEnvSchema, type EnvField } from "#shared/env-schema.ts";

export const envSchema: EnvField[] = [
  ...deviceEnvSchema,
  {
    name: "PRESENCE_DEVICES",
    description:
      "Comma-separated hostnames or IPs whose presence disables motion detection",
  },
  {
    name: "CHECK_INTERVAL_MS",
    description: "How often device presence is checked",
    default: "60000",
  },
  {
    name: "PING_TIMEOUT_MS",
    description: "Ping timeout",
    default: "4000",
  },
];
