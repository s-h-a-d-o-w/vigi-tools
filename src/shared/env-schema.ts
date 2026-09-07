/**
 * One environment variable a tool understands. `default` being undefined marks
 * the variable as required.
 */
export type EnvField = {
  name: string;
  description: string;
  default?: string;
  secret?: boolean;
  /** Name of the field that has to have a value for this one to apply. */
  requires?: string;
  /** Returns why the value cannot be used, or undefined when it can. */
  validate?: (value: string) => string | undefined;
};

/** The connection settings every tool in this workspace needs. */
export const deviceEnvSchema: EnvField[] = [
  {
    name: "VIGI_HOST",
    description: "Hostname or IP address of the camera",
  },
  {
    name: "PASSWORD",
    description: "Password of the camera account",
    secret: true,
  },
  {
    name: "USERNAME",
    description: "Camera account to log in as",
    default: "admin",
  },
  {
    name: "API_PORT",
    description: "Port the camera serves its Open API on",
    default: "20443",
  },
  {
    name: "TLS_REJECT_UNAUTHORIZED",
    description:
      "Reject unauthorized TLS certificates? (Requires you to have a valid certificate on the camera, otherwise leave this false.)",
    default: "false",
  },
];

/** What a tool needs to send mail through SES. Off until a recipient is set. */
const notifyEnvSchema: EnvField[] = [
  {
    name: "NOTIFY_EMAIL_TO",
    description:
      "E-mail address to send notifications to (Also requires AWS keys and an SES-verified sender address!)",
    default: "",
  },
  {
    name: "NOTIFY_EMAIL_FROM",
    description: "SES-verified address that e-mail notifications are sent from",
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
];

/**
 * Everything every tool understands the same way. These are configured once
 * into `.env.shared` instead of being repeated per tool.
 */
export const sharedEnvSchema: EnvField[] = [
  ...deviceEnvSchema,
  ...notifyEnvSchema,
];

export function isSharedEnvField(name: string): boolean {
  return sharedEnvSchema.some((field) => field.name === name);
}
