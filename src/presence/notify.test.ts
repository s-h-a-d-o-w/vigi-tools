import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BatteryWarningConfig } from "./config.ts";
import { createBatteryWarner } from "./notify.ts";

const PHONE = "AA:BB:CC:DD:EE:FF";
const HOUR_MS = 3_600_000;

const CONFIG: BatteryWarningConfig = {
  accessKeyId: "AKIAEXAMPLE",
  checkIntervalMs: 12 * HOUR_MS,
  recipient: "owner@example.com",
  region: "eu-central-1",
  secretAccessKey: "s3cret",
  sender: "camera@example.com",
};

const mocks = vi.hoisted(() => ({
  isBatteryLow: vi.fn<(address: string) => Promise<boolean | undefined>>(),
  send: vi.fn<(subject: string, body: string) => void>(),
  createMailer: vi.fn<(config: unknown) => unknown>(),
  log: vi.fn<(message: string) => void>(),
  logError: vi.fn<(message: string) => void>(),
}));

vi.mock(import("./battery.ts"), () => ({
  isBatteryLow: mocks.isBatteryLow,
}));
vi.mock(import("../shared/ses.ts"), () => ({
  createMailer: (config: unknown) => {
    mocks.createMailer(config);

    return { send: mocks.send, flush: () => Promise.resolve() };
  },
}));
vi.mock(import("../shared/log.ts"), () => ({
  log: mocks.log,
  logError: mocks.logError,
}));

/** The subject of the nth warning that was sent. */
function subject(nth: number): string | undefined {
  return mocks.send.mock.calls[nth - 1]?.[0];
}

/** Answers every battery read with `low`. */
function reports(low: boolean): void {
  mocks.isBatteryLow.mockResolvedValue(low);
}

describe(createBatteryWarner, () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing without a configuration", async () => {
    await createBatteryWarner(undefined).check(PHONE);

    expect(mocks.createMailer).not.toHaveBeenCalled();
    expect(mocks.isBatteryLow).not.toHaveBeenCalled();
  });

  it("stays quiet while a beacon does not flag its battery", async () => {
    reports(false);

    await createBatteryWarner(CONFIG).check(PHONE);

    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("warns once a beacon flags its battery as low", async () => {
    reports(true);

    await createBatteryWarner(CONFIG).check(PHONE);

    expect(mocks.log).toHaveBeenCalledWith(`  ${PHONE} battery is low!`);
    expect(subject(1)).toBe(`Low battery on presence device ${PHONE}`);
    expect(mocks.send.mock.calls[0]?.[1]).toContain("flagged as low");
  });

  it("only reads the battery once per interval", async () => {
    reports(false);
    const warner = createBatteryWarner(CONFIG);

    await warner.check(PHONE);
    vi.advanceTimersByTime(CONFIG.checkIntervalMs - 1);
    await warner.check(PHONE);

    expect(mocks.isBatteryLow).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(1);
    await warner.check(PHONE);

    expect(mocks.isBatteryLow).toHaveBeenCalledTimes(2);
  });

  it("does not repeat the warning while the battery stays low", async () => {
    reports(true);
    const warner = createBatteryWarner(CONFIG);

    await warner.check(PHONE);
    vi.advanceTimersByTime(CONFIG.checkIntervalMs);
    await warner.check(PHONE);

    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it("warns again after the battery has been replaced", async () => {
    reports(true);
    const warner = createBatteryWarner(CONFIG);

    await warner.check(PHONE);
    reports(false);
    vi.advanceTimersByTime(CONFIG.checkIntervalMs);
    await warner.check(PHONE);
    reports(true);
    vi.advanceTimersByTime(CONFIG.checkIntervalMs);
    await warner.check(PHONE);

    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("notes a device that does not report battery status", async () => {
    mocks.isBatteryLow.mockResolvedValue(undefined);

    await createBatteryWarner(CONFIG).check(PHONE);

    expect(mocks.log).toHaveBeenCalledWith(
      `  ${PHONE} does not report battery status`,
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps the service alive when the battery cannot be read", async () => {
    mocks.isBatteryLow.mockRejectedValue(new Error("not available"));

    await expect(
      createBatteryWarner(CONFIG).check(PHONE),
    ).resolves.toBeUndefined();
    expect(mocks.logError).toHaveBeenCalledWith(
      `  battery check for ${PHONE} failed: not available`,
    );
  });
});
