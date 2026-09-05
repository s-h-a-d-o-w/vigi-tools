import { beforeEach, describe, expect, it, vi } from "vitest";

import type { execFile } from "node:child_process";

import { anyDevicePresent } from "./ble.ts";

type ExecFile = (
  file: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
  callback: (error: Error | null, stdout: string) => void,
) => void;

const PHONE = "AA:BB:CC:DD:EE:FF";
const TABLET = "11:22:33:44:55:66";
const LAPTOP = "99:88:77:66:55:44";
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

const mocks = vi.hoisted(() => ({
  execFile: vi.fn<ExecFile>(),
}));

vi.mock(import("node:child_process"), () => ({
  // The real signature carries overloads and `__promisify__`, neither of which
  // ble.ts uses.
  execFile: mocks.execFile as unknown as typeof execFile,
}));

/** A scan log in which every address in `advertising` shows up. */
function scanLog(advertising: readonly string[]): string {
  return [
    "Agent registered",
    // Everything BlueZ had cached before the scan, which proves nothing.
    `[NEW] Device ${LAPTOP} Old Laptop`,
    "Discovery started",
    ...advertising.flatMap((address) => [
      `[NEW] Device ${address} Some Device`,
      `[CHG] Device ${address} RSSI: -63`,
    ]),
    `[DEL] Device ${LAPTOP} Old Laptop`,
    "",
  ].join("\n");
}

/** Lets bluetoothctl report the addresses in `advertising`. */
function respondFor(advertising: readonly string[]): void {
  mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
    // `execFile` reports success as a null error, which is what ble.ts checks for.
    // oxlint-disable-next-line unicorn/no-null
    callback(null, scanLog(advertising));
  });
}

describe(anyDevicePresent, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the first configured device that advertises", async () => {
    respondFor([TABLET, PHONE]);

    await expect(anyDevicePresent([PHONE, TABLET], 10)).resolves.toBe(PHONE);
    expect(mocks.execFile).toHaveBeenCalledOnce();
  });

  it("matches addresses regardless of case", async () => {
    respondFor([TABLET]);

    await expect(anyDevicePresent([TABLET.toLowerCase()], 10)).resolves.toBe(
      TABLET.toLowerCase(),
    );
  });

  it("returns undefined when nobody advertises", async () => {
    respondFor([]);

    await expect(
      anyDevicePresent([PHONE, TABLET], 10),
    ).resolves.toBeUndefined();
  });

  it("ignores the devices bluetoothctl had cached before the scan", async () => {
    respondFor([]);

    await expect(anyDevicePresent([LAPTOP], 10)).resolves.toBeUndefined();
  });

  it("scans for the configured number of whole seconds", async () => {
    respondFor([]);

    await anyDevicePresent([PHONE], 10);

    expect(mocks.execFile).toHaveBeenCalledWith(
      "bluetoothctl",
      ["--timeout", "10", "scan", "le"],
      { timeout: 15_000, maxBuffer: MAX_OUTPUT_BYTES },
      expect.any(Function),
    );
  });

  it("never scans for less than a second", async () => {
    respondFor([]);

    await anyDevicePresent([PHONE], 0.2);

    expect(mocks.execFile).toHaveBeenCalledWith(
      "bluetoothctl",
      ["--timeout", "1", "scan", "le"],
      { timeout: 6000, maxBuffer: MAX_OUTPUT_BYTES },
      expect.any(Function),
    );
  });

  it.each([
    "--help",
    "phone; rm -rf /",
    "$(whoami)",
    "192.168.0.10",
    "AA:BB:CC:DD:EE",
  ])('rejects "%s" instead of passing it to bluetoothctl', async (device) => {
    respondFor([]);

    await expect(anyDevicePresent([PHONE, device], 10)).rejects.toThrow(
      `"${device}" is not a valid Bluetooth address`,
    );
    expect(mocks.execFile).not.toHaveBeenCalled();
  });

  it("explains a missing bluetoothctl", async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(
        Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
        "",
      );
    });

    await expect(anyDevicePresent([PHONE], 10)).rejects.toThrow(
      "`bluetoothctl` not found",
    );
  });

  it("fails when the scan never started", async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      // oxlint-disable-next-line unicorn/no-null
      callback(null, "Agent registered\n");
    });

    await expect(anyDevicePresent([PHONE], 10)).rejects.toThrow(
      "bluetoothctl did not start a discovery",
    );
  });
});
