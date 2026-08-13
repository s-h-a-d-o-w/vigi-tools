import { deviceEnvSchema, type EnvField } from "../shared/env-schema.ts";

export const envSchema: EnvField[] = [
  ...deviceEnvSchema,
  {
    name: "PRESENCE_DEVICES",
    description:
      "Comma-separated hostnames or IPs whose presence disables motion detection",
  },
  {
    name: "CHECK_INTERVAL_SECONDS",
    description: "How often device presence is checked (seconds)",
    default: "32",
  },
  {
    name: "PING_TIMEOUT_SECONDS",
    description: "Ping timeout (seconds)",
    default: "4",
  },
];
