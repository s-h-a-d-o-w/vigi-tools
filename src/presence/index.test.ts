import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bootService,
  CONTROL_API,
  PASSWORD,
  stubDeviceEnv,
  USERNAME,
} from "#shared/testing.ts";
import type { ControlApiOptions } from "#shared/vigi/control-api.ts";

const mocks = vi.hoisted(() => ({
  anyDevicePresent:
    vi.fn<
      (
        devices: readonly string[],
        scanSeconds: number,
      ) => Promise<string | undefined>
    >(),
  authenticate:
    vi.fn<
      (
        options: ControlApiOptions,
        username: string,
        password: string,
      ) => Promise<string>
    >(),
  setMotionDetectionSwitch:
    vi.fn<
      (
        options: ControlApiOptions,
        stok: string,
        enabled: boolean,
      ) => Promise<void>
    >(),
  runForever:
    vi.fn<(intervalMs: number, check: () => Promise<void>) => Promise<void>>(),
  log: vi.fn<(message: string) => void>(),
  logError: vi.fn<(message: string) => void>(),
}));

vi.mock(import("./ble.ts"), () => ({
  anyDevicePresent: mocks.anyDevicePresent,
}));
vi.mock(import("#shared/vigi/control-api.ts"), () => ({
  authenticate: mocks.authenticate,
  setMotionDetectionSwitch: mocks.setMotionDetectionSwitch,
}));
vi.mock(import("#shared/loop.ts"), () => ({ runForever: mocks.runForever }));
vi.mock(import("#shared/log.ts"), () => ({
  log: mocks.log,
  logError: mocks.logError,
}));

/** Boots a fresh copy of the service and hands back its check callback. */
function startService(): Promise<() => Promise<void>> {
  return bootService(mocks.runForever, () => import("./index.ts"));
}

describe("presence service", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    let issuedTokens = 0;
    mocks.authenticate.mockImplementation(() => {
      issuedTokens += 1;
      return Promise.resolve(`stok-${issuedTokens}`);
    });
    mocks.setMotionDetectionSwitch.mockResolvedValue(undefined);
    mocks.anyDevicePresent.mockResolvedValue(undefined);
    mocks.runForever.mockResolvedValue(undefined);

    stubDeviceEnv({
      PRESENCE_DEVICES: "AA:BB:CC:DD:EE:FF, 11:22:33:44:55:66",
      CHECK_INTERVAL_SECONDS: "30",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("scans for the whole check interval, back to back", async () => {
    const check = await startService();

    await check();

    expect(mocks.runForever).toHaveBeenCalledWith(0, expect.any(Function));
    expect(mocks.anyDevicePresent).toHaveBeenCalledWith(
      ["AA:BB:CC:DD:EE:FF", "11:22:33:44:55:66"],
      30,
    );
  });

  it("turns motion detection on after four consecutive quiet scans", async () => {
    const check = await startService();

    await check();
    await check();
    await check();

    expect(mocks.setMotionDetectionSwitch).not.toHaveBeenCalled();

    await check();

    expect(mocks.authenticate).toHaveBeenCalledWith(
      CONTROL_API,
      USERNAME,
      PASSWORD,
    );
    expect(mocks.setMotionDetectionSwitch).toHaveBeenCalledWith(
      CONTROL_API,
      "stok-1",
      true,
    );
  });

  it("restarts the absence count when a device shows up again", async () => {
    const check = await startService();

    await check();
    await check();
    await check();
    mocks.anyDevicePresent.mockResolvedValue("AA:BB:CC:DD:EE:FF");
    await check();
    mocks.anyDevicePresent.mockResolvedValue(undefined);
    await check();
    await check();
    await check();

    expect(mocks.setMotionDetectionSwitch).toHaveBeenCalledExactlyOnceWith(
      CONTROL_API,
      "stok-1",
      false,
    );
  });

  it("turns motion detection off when a device is nearby", async () => {
    mocks.anyDevicePresent.mockResolvedValue("11:22:33:44:55:66");
    const check = await startService();

    await check();

    expect(mocks.setMotionDetectionSwitch).toHaveBeenCalledWith(
      CONTROL_API,
      "stok-1",
      false,
    );
    expect(mocks.log).toHaveBeenCalledWith("11:22:33:44:55:66 is nearby");
  });

  it("only toggles motion detection when the state changes", async () => {
    const check = await startService();

    await check();
    await check();
    await check();
    await check();
    await check();
    mocks.anyDevicePresent.mockResolvedValue("AA:BB:CC:DD:EE:FF");
    await check();
    await check();

    expect(mocks.setMotionDetectionSwitch).toHaveBeenCalledTimes(2);
  });
});
