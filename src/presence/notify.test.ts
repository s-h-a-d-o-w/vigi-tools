import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesConfig } from "../shared/ses.ts";

import { createBatteryWarner } from "./notify.ts";

const PHONE = "AA:BB:CC:DD:EE:FF";
const BEACON = "11:22:33:44:55:66";

const CONFIG: SesConfig = {
  accessKeyId: "AKIAEXAMPLE",
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
  });

  it("does nothing without a configuration", async () => {
    await createBatteryWarner(undefined).check([PHONE]);

    expect(mocks.createMailer).not.toHaveBeenCalled();
    expect(mocks.isBatteryLow).not.toHaveBeenCalled();
  });

  it("reads the battery of every device", async () => {
    reports(false);

    await createBatteryWarner(CONFIG).check([PHONE, BEACON]);

    expect(mocks.isBatteryLow).toHaveBeenCalledTimes(2);
    expect(mocks.isBatteryLow).toHaveBeenCalledWith(PHONE);
    expect(mocks.isBatteryLow).toHaveBeenCalledWith(BEACON);
  });

  it("stays quiet while a beacon does not flag its battery", async () => {
    reports(false);

    await createBatteryWarner(CONFIG).check([PHONE]);

    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("warns once a beacon flags its battery as low", async () => {
    reports(true);

    await createBatteryWarner(CONFIG).check([PHONE]);

    expect(mocks.log).toHaveBeenCalledWith(`  ${PHONE} battery is low!`);
    expect(subject(1)).toBe(`Low battery on presence device ${PHONE}`);
    expect(mocks.send.mock.calls[0]?.[1]).toContain("flagged as being low");
  });

  it("warns about every device whose battery is low", async () => {
    reports(true);

    await createBatteryWarner(CONFIG).check([PHONE, BEACON]);

    expect(subject(1)).toBe(`Low battery on presence device ${PHONE}`);
    expect(subject(2)).toBe(`Low battery on presence device ${BEACON}`);
  });

  it("does not repeat the warning while the battery stays low", async () => {
    reports(true);
    const warner = createBatteryWarner(CONFIG);

    await warner.check([PHONE]);
    await warner.check([PHONE]);

    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it("warns again after the battery has been replaced", async () => {
    reports(true);
    const warner = createBatteryWarner(CONFIG);

    await warner.check([PHONE]);
    reports(false);
    await warner.check([PHONE]);
    reports(true);
    await warner.check([PHONE]);

    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("notes a device that does not report battery status", async () => {
    mocks.isBatteryLow.mockResolvedValue(undefined);

    await createBatteryWarner(CONFIG).check([PHONE]);

    expect(mocks.log).toHaveBeenCalledWith(
      `  ${PHONE} does not report battery status`,
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps checking when one device's battery cannot be read", async () => {
    mocks.isBatteryLow.mockRejectedValueOnce(new Error("not available"));
    mocks.isBatteryLow.mockResolvedValue(true);

    await expect(
      createBatteryWarner(CONFIG).check([PHONE, BEACON]),
    ).resolves.toBeUndefined();
    expect(mocks.logError).toHaveBeenCalledWith(
      `  battery check for ${PHONE} failed: not available`,
    );
    expect(subject(1)).toBe(`Low battery on presence device ${BEACON}`);
  });
});
