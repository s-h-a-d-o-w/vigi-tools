import { afterEach, describe, expect, it, vi } from "vitest";

import { stubDeviceEnv } from "#shared/testing.ts";

import { loadConfig } from "./config.ts";

describe(loadConfig, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("trims the listed addresses", () => {
    stubDeviceEnv({
      PRESENCE_DEVICES: "AA:BB:CC:DD:EE:FF, 11:22:33:44:55:66",
      CHECK_INTERVAL_SECONDS: "30",
    });

    expect(loadConfig()).toMatchObject({
      devices: ["AA:BB:CC:DD:EE:FF", "11:22:33:44:55:66"],
      checkIntervalSeconds: 30,
    });
  });

  it.each([
    "--help",
    "phone; rm -rf /",
    "$(whoami)",
    "192.168.0.10",
    "AA:BB:CC:DD:EE",
  ])('rejects "%s" as a device address', (device) => {
    stubDeviceEnv({ PRESENCE_DEVICES: `AA:BB:CC:DD:EE:FF,${device}` });

    expect(loadConfig).toThrow(`"${device}" is not a valid Bluetooth address`);
  });
});
