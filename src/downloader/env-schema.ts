import { deviceEnvSchema, type EnvField } from "../shared/env-schema.ts";

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
  {
    name: "NOTIFY_EMAIL_TO",
    description:
      "E-mail address to send notifications to (requires AWS keys and an SES-verified address!)",
    default: "",
  },
  {
    name: "NOTIFY_EMAIL_FROM",
    description: "SES-verified address the notifications are sent from",
    requires: "NOTIFY_EMAIL_TO",
  },
  {
    name: "AWS_REGION",
    description:
      "AWS region the SES identity lives in (see https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html)",
    requires: "NOTIFY_EMAIL_TO",
  },
  {
    name: "AWS_ACCESS_KEY_ID",
    description: "Access key of an AWS user that may send via SES",
    requires: "NOTIFY_EMAIL_TO",
  },
  {
    name: "AWS_SECRET_ACCESS_KEY",
    description: "Secret key belonging to AWS_ACCESS_KEY_ID",
    secret: true,
    requires: "NOTIFY_EMAIL_TO",
  },
  {
    name: "NOTIFY_QUIET_PERIOD_MS",
    description:
      'How long after the last download the "no more activity" notification is sent (ms)',
    default: "120000",
    requires: "NOTIFY_EMAIL_TO",
  },
];
