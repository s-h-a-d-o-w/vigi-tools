import { bluetoothctl } from "./bluetoothctl.ts";

const INFO_TIMEOUT_MS = 5_000;

// Beacons of the "EYE" family put their readings into the manufacturer data.
// BlueZ prints the company ID separately from the payload and dumps the
// payload as hex plus an ASCII column:
//   ManufacturerData.Key: 0x089a (2202)
//   ManufacturerData.Value:
//     01 84 6c                                         ..l
const KEY_PATTERN = /ManufacturerData\.Key:[ \t]*(?<key>0x[\da-f]+)/iu;
const VALUE_HEADING = "ManufacturerData.Value:";
const HEX_BYTE_PATTERN = /[\da-f]{2}/giu;
// Where the ASCII column starts, which would otherwise contribute stray bytes.
const HEX_COLUMN_WIDTH = 50;

const EYE_COMPANY_ID = 0x08_9a;
const EYE_VERSION = 0x01;

// The payload is the version, a bitmask of the readings, and then the readings
// that carry a value. The low battery indication is a reading in itself, so the
// flags byte is all it takes - no need to guess how the beacon scales the
// battery voltage that may follow.
const EYE_LOW_BATTERY_FLAG = 0b0100_0000;

/**
 * Whether the bit `flag` stands for is set in `flags`.
 *
 * Dividing by the flag moves its bit into the ones place, which the linter
 * likes better than a bitwise and.
 */
function hasFlag(flags: number, flag: number): boolean {
  return Math.trunc(flags / flag) % 2 === 1;
}

/** The company ID and payload of the manufacturer data in an `info` dump. */
function readManufacturerData(
  info: string,
): { companyId: number; payload: number[] } | undefined {
  const key = KEY_PATTERN.exec(info)?.groups?.["key"];
  const lines = info.split("\n");
  const heading = lines.findIndex((line) => line.includes(VALUE_HEADING));

  if (key === undefined || heading === -1) {
    return undefined;
  }

  const payload: number[] = [];

  for (const line of lines.slice(heading + 1)) {
    const bytes = line.slice(0, HEX_COLUMN_WIDTH).match(HEX_BYTE_PATTERN);

    // The dump indents with spaces, while the next property starts with a tab.
    if (!line.startsWith("  ") || bytes === null) {
      break;
    }

    payload.push(...bytes.map((byte) => Number.parseInt(byte, 16)));
  }

  return { companyId: Number(key), payload };
}

/**
 * Whether `address` flags its battery as low, or undefined when it does not
 * advertise a battery indication at all.
 */
export async function isBatteryLow(
  address: string,
): Promise<boolean | undefined> {
  const data = readManufacturerData(
    await bluetoothctl(["info", address], INFO_TIMEOUT_MS),
  );

  if (data?.companyId !== EYE_COMPANY_ID) {
    return undefined;
  }

  const [version, flags] = data.payload;

  if (version !== EYE_VERSION || flags === undefined) {
    return undefined;
  }

  return hasFlag(flags, EYE_LOW_BATTERY_FLAG);
}
