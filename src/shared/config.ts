import process from "node:process";

import { optionalNumber, requiredString } from "./env.ts";

/** The connection settings every tool needs. */
export function loadDeviceConfig() {
  return {
    host: requiredString("VIGI_HOST"),
    username: process.env["USERNAME"] ?? "admin",
    password: requiredString("PASSWORD"),
    apiPort: optionalNumber("API_PORT", 20_443),
    // Cameras ship with a self-signed certificate, so verification is off unless
    // the certificate has been replaced with one the host trusts.
    rejectUnauthorized: process.env["TLS_REJECT_UNAUTHORIZED"] === "true",
  };
}
