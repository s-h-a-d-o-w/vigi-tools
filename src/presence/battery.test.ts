import { beforeEach, describe, expect, it, vi } from "vitest";

import { isBatteryLow } from "./battery.ts";

const BEACON = "AA:BB:CC:DD:EE:FF";

const mocks = vi.hoisted(() => ({
  bluetoothctl:
    vi.fn<(args: readonly string[], timeoutMs: number) => Promise<string>>(),
}));

vi.mock(import("./bluetoothctl.ts"), () => ({
  bluetoothctl: mocks.bluetoothctl,
}));

/** The bluetoothctl commands that were run, without their timeouts. */
function commands(): string[][] {
  return mocks.bluetoothctl.mock.calls.map(([args]) => [...args]);
}

function infoWith(properties: readonly string[]): string {
  return [
    `Device ${BEACON} (public)`,
    "\tConnected: no",
    // Properties are indented with a tab, hex dumps with spaces.
    ...properties.map((property) =>
      property.startsWith(" ") ? property : `\t${property}`,
    ),
    "",
  ].join("\n");
}

/** The lines `bluetoothctl info` prints for a manufacturer data payload. */
function manufacturerData(key: string, hex: string): string[] {
  return [
    `ManufacturerData.Key: ${key}`,
    "ManufacturerData.Value:",
    `  ${hex.padEnd(48)}  ....`,
  ];
}

/** Answers `info` with `properties`, and everything else with nothing. */
function respondWith(properties: readonly string[]): void {
  mocks.bluetoothctl.mockImplementation((args) =>
    Promise.resolve(args[0] === "info" ? infoWith(properties) : ""),
  );
}

describe(isBatteryLow, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("takes the low battery indication of an EYE beacon", async () => {
    // Flags 0xc4: magnetic sensor, low battery and battery voltage.
    respondWith(manufacturerData("0x089a", "01 c4 6c"));

    await expect(isBatteryLow(BEACON)).resolves.toBe(true);
  });

  it("reads a beacon that is not running out as fine", async () => {
    respondWith(manufacturerData("0x089a", "01 84 6c"));

    // Not `toBeFalsy`: undefined stands for "no indication at all" here.
    // oxlint-disable-next-line vitest/prefer-to-be-falsy
    await expect(isBatteryLow(BEACON)).resolves.toBe(false);
  });

  it("reads it without connecting", async () => {
    respondWith(manufacturerData("0x089a", "01 84 6c"));

    await isBatteryLow(BEACON);

    expect(commands()).toStrictEqual([["info", BEACON]]);
  });

  it("ignores manufacturer data of other vendors", async () => {
    respondWith(manufacturerData("0x004c", "02 15 c4 6c"));

    await expect(isBatteryLow(BEACON)).resolves.toBeUndefined();
  });

  it("gives up on a device without manufacturer data", async () => {
    respondWith(["RSSI: -63"]);

    await expect(isBatteryLow(BEACON)).resolves.toBeUndefined();
  });

  it("gives up on a payload of an unknown version", async () => {
    respondWith(manufacturerData("0x089a", "02 c4 6c"));

    await expect(isBatteryLow(BEACON)).resolves.toBeUndefined();
  });
});
