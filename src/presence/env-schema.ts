import { deviceEnvSchema, type EnvField } from "../shared/env-schema.ts";

// A single sighting proves someone is home, but BLE advertisements are easy to
// miss, so absence has to be confirmed by several scans in a row.
export const REQUIRED_ABSENT_SCANS = 4;

// Six colon-separated hex pairs. Rejects anything that could be mistaken for a
// bluetoothctl option or a shell token.
const ADDRESS_PATTERN = /^[\da-f]{2}(?::[\da-f]{2}){5}$/iu;

function validateAddresses(value: string): string | undefined {
  const invalid = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .find((entry) => !ADDRESS_PATTERN.test(entry));

  return invalid === undefined
    ? undefined
    : `"${invalid}" is not a valid Bluetooth address`;
}

export const envSchema: EnvField[] = [
  ...deviceEnvSchema,
  {
    name: "PRESENCE_DEVICES",
    description:
      "Comma-separated Bluetooth LE addresses (e.g. AA:BB:CC:DD:EE:FF) whose presence disables motion detection",
    validate: validateAddresses,
  },
  {
    name: "CHECK_INTERVAL_SECONDS",
    description: `Your device appears within this interval => you're home. It doesn't for ${REQUIRED_ABSENT_SCANS} consecutive intervals => you're away. (Seconds.)`,
    default: "6",
  },
];
