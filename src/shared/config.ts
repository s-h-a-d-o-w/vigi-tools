import { createEnvReader, type EnvReader } from "./env.ts";
import { deviceEnvSchema } from "./env-schema.ts";
import type { SesConfig } from "./ses.ts";

/** The connection settings every tool needs. */
export function loadDeviceConfig() {
  const env = createEnvReader(deviceEnvSchema);

  return {
    host: env.string("VIGI_HOST"),
    username: env.string("USERNAME"),
    password: env.string("PASSWORD"),
    apiPort: env.number("API_PORT"),
    // Cameras ship with a self-signed certificate, so verification is off unless
    // the certificate has been replaced with one the host trusts.
    rejectUnauthorized: env.boolean("TLS_REJECT_UNAUTHORIZED"),
  };
}

/** Notifications stay off until a recipient is configured. */
export function loadSesConfig(env: EnvReader): SesConfig | undefined {
  const recipient = env.optionalString("NOTIFY_EMAIL_TO")?.trim();

  if (recipient === undefined) {
    return undefined;
  }

  return {
    accessKeyId: env.string("AWS_ACCESS_KEY_ID"),
    recipient,
    region: env.string("AWS_REGION"),
    secretAccessKey: env.string("AWS_SECRET_ACCESS_KEY"),
    sender: env.string("NOTIFY_EMAIL_FROM"),
  };
}
