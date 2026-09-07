import { type EnvField, sharedEnvSchema } from "../shared/env-schema.ts";

export const envSchema: EnvField[] = [
  ...sharedEnvSchema,
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
    name: "CHECK_INTERVAL_SECONDS",
    description: "How often the camera is checked for new recordings (seconds)",
    default: "35",
  },
  {
    name: "CHECK_PREVIOUS_HOURS",
    description: "How far back each check looks (hours)",
    default: "2",
  },
  {
    name: "NOTIFY_QUIET_PERIOD_SECONDS",
    description:
      'How long after the last download the "no more activity" notification is sent (seconds)',
    default: "120",
    requires: "NOTIFY_EMAIL_TO",
  },
];
