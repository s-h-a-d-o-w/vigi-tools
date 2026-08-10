import { beforeEach, describe, expect, it, vi } from "vitest";

import type { execFile } from "node:child_process";

import { anyDevicePresent } from "./ping.ts";

type ExecFile = (
  file: string,
  args: readonly string[],
  options: { timeout: number },
  callback: (error: Error | null) => void,
) => void;

const mocks = vi.hoisted(() => ({
  execFile: vi.fn<ExecFile>(),
}));

vi.mock(import("node:child_process"), () => ({
  // The real signature carries overloads and `__promisify__`, neither of which
  // ping.ts uses.
  execFile: mocks.execFile as unknown as typeof execFile,
}));

/** Answers pings from `reachable` and reports every other host as silent. */
function respondFor(reachable: readonly string[]): void {
  mocks.execFile.mockImplementation((_file, args, _options, callback) => {
    const host = args.at(-1) ?? "";
    // `execFile` reports success as a null error, which is what ping.ts checks for.
    // oxlint-disable-next-line unicorn/no-null
    callback(reachable.includes(host) ? null : new Error("exit code 1"));
  });
}

describe(anyDevicePresent, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the first configured device that answers", async () => {
    respondFor(["tablet", "laptop"]);

    await expect(
      anyDevicePresent(["phone", "tablet", "laptop"], 4),
    ).resolves.toBe("tablet");
    expect(mocks.execFile).toHaveBeenCalledTimes(3);
  });

  it("returns undefined when nobody answers", async () => {
    respondFor([]);

    await expect(
      anyDevicePresent(["phone", "tablet"], 4),
    ).resolves.toBeUndefined();
  });

  it("passes the timeout to ping in whole seconds", async () => {
    respondFor([]);

    await anyDevicePresent(["phone"], 4);

    expect(mocks.execFile).toHaveBeenCalledWith(
      "ping",
      ["-n", "-c", "1", "-W", "4", "phone"],
      { timeout: 5000 },
      expect.any(Function),
    );
  });

  it("never asks ping to wait less than a second", async () => {
    respondFor([]);

    await anyDevicePresent(["phone"], 0.2);

    expect(mocks.execFile).toHaveBeenCalledWith(
      "ping",
      ["-n", "-c", "1", "-W", "1", "phone"],
      { timeout: 2000 },
      expect.any(Function),
    );
  });

  it.each(["-n", "--help", "phone; rm -rf /", "$(whoami)", ".phone"])(
    'rejects "%s" instead of passing it to ping',
    async (device) => {
      respondFor([]);

      await expect(anyDevicePresent(["phone", device], 4)).rejects.toThrow(
        `"${device}" is not a valid hostname or IP address`,
      );
      expect(mocks.execFile).not.toHaveBeenCalled();
    },
  );

  it("accepts hostnames and IP addresses", async () => {
    respondFor(["192.168.0.10"]);

    await expect(
      anyDevicePresent(["my-phone.local", "192.168.0.10", "fe80::1"], 4),
    ).resolves.toBe("192.168.0.10");
  });
});
