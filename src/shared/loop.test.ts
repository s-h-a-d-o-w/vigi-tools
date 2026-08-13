import { afterEach, describe, expect, it, vi } from "vitest";

import { runForever } from "./loop.ts";

const mocks = vi.hoisted(() => ({
  logError: vi.fn<(message: string) => void>(),
}));

vi.mock(import("./log.ts"), () => ({
  logError: mocks.logError,
}));

// Fake timers only patch the global timers, so route the promise-based
// `setTimeout` through them to make the interval observable.
vi.mock(import("node:timers/promises"), () => ({
  setTimeout: ((ms: number) =>
    new Promise((resolve) => {
      globalThis.setTimeout(resolve, ms);
    })) as unknown as typeof import("node:timers/promises").setTimeout,
}));

describe(runForever, () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("runs again after the configured interval", async () => {
    vi.useFakeTimers();
    const check = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    void runForever(35_000, check);
    await vi.advanceTimersByTimeAsync(0);

    expect(check).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(34_999);
    expect(check).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(2);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("stops instead of retrying a failed attempt", async () => {
    vi.useFakeTimers();
    const check = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error("doAuth failed"));

    const loop = runForever(35_000, check);

    await expect(loop).rejects.toThrow("doAuth failed");
    expect(mocks.logError).toHaveBeenCalledWith("Mock failed: doAuth failed");

    await vi.advanceTimersByTimeAsync(100_000);
    expect(check).toHaveBeenCalledOnce();
  });
});
