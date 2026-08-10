import { deviceEnvSchema, type EnvField } from "#shared/env-schema.ts";

export const envSchema: EnvField[] = [
  ...deviceEnvSchema,
  {
    name: "TARGET_DIR",
    description: "Absolute path of the directory recordings are synced into",
  },
  {
    name: "RTSP_PORT",
    description: "Port the camera serves its stream API on",
    default: "554",
  },
  {
    name: "CHECK_INTERVAL_MS",
    description: "How often the camera is checked for new recordings (ms)",
    default: "35000",
  },
  {
    name: "CHECK_PREVIOUS_HOURS",
    description: "How far back each check looks (hours)",
    default: "2",
  },
];
