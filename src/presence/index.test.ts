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
        timeoutSeconds: number,
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

vi.mock(import("./ping.ts"), () => ({
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

const TOKEN_LIFETIME_MS = 20 * 60 * 1000;

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
      PRESENCE_DEVICES: "phone, tablet",
      CHECK_INTERVAL_MS: "30000",
      PING_TIMEOUT_SECONDS: "3",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("checks presence on the configured schedule", async () => {
    const check = await startService();

    await check();

    expect(mocks.runForever).toHaveBeenCalledWith(30_000, expect.any(Function));
    expect(mocks.anyDevicePresent).toHaveBeenCalledWith(["phone", "tablet"], 3);
  });

  it("turns motion detection on when nobody is home", async () => {
    const check = await startService();

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

  it("turns motion detection off when a device is on the network", async () => {
    mocks.anyDevicePresent.mockResolvedValue("tablet");
    const check = await startService();

    await check();

    expect(mocks.setMotionDetectionSwitch).toHaveBeenCalledWith(
      CONTROL_API,
      "stok-1",
      false,
    );
    expect(mocks.log).toHaveBeenCalledWith("tablet is on the network");
  });

  it("only writes to the camera when the state changes", async () => {
    const check = await startService();

    await check();
    await check();
    mocks.anyDevicePresent.mockResolvedValue("phone");
    await check();
    await check();

    expect(mocks.setMotionDetectionSwitch).toHaveBeenCalledTimes(2);
    expect(mocks.setMotionDetectionSwitch).toHaveBeenNthCalledWith(
      2,
      CONTROL_API,
      "stok-1",
      false,
    );
  });

  it("reuses the session token until it expires", async () => {
    vi.useFakeTimers();
    const check = await startService();

    await check();
    mocks.anyDevicePresent.mockResolvedValue("phone");
    await check();

    expect(mocks.authenticate).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(TOKEN_LIFETIME_MS + 1000);
    mocks.anyDevicePresent.mockResolvedValue(undefined);
    await check();

    expect(mocks.authenticate).toHaveBeenCalledTimes(2);
    expect(mocks.setMotionDetectionSwitch).toHaveBeenLastCalledWith(
      CONTROL_API,
      "stok-2",
      true,
    );
  });

  it("retries with a fresh token when the camera rejects the cached one", async () => {
    mocks.setMotionDetectionSwitch.mockRejectedValueOnce(
      new Error("invalid stok"),
    );
    const check = await startService();

    await check();

    expect(mocks.authenticate).toHaveBeenCalledTimes(2);
    expect(mocks.setMotionDetectionSwitch).toHaveBeenNthCalledWith(
      1,
      CONTROL_API,
      "stok-1",
      true,
    );
    expect(mocks.setMotionDetectionSwitch).toHaveBeenNthCalledWith(
      2,
      CONTROL_API,
      "stok-2",
      true,
    );
  });

  it("retries the same state after the camera stayed unreachable", async () => {
    mocks.setMotionDetectionSwitch
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockRejectedValueOnce(new Error("socket hang up"));
    const check = await startService();

    await expect(check()).rejects.toThrow("socket hang up");

    await check();

    expect(mocks.setMotionDetectionSwitch).toHaveBeenCalledTimes(3);
    expect(mocks.setMotionDetectionSwitch).toHaveBeenLastCalledWith(
      CONTROL_API,
      "stok-2",
      true,
    );
  });
});
