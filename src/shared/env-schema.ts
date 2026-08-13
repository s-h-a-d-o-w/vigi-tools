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
