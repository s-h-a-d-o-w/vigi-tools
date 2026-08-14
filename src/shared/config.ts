import { createEnvReader } from "./env.ts";
import { deviceEnvSchema } from "./env-schema.ts";

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
