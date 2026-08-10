import { type Mock, vi } from "vitest";

import type { runForever } from "./loop.ts";
import type { ControlApiOptions } from "./vigi/control-api.ts";

/** The environment `loadDeviceConfig` reads, as the service tests stub it. */
const DEVICE_ENV = {
  VIGI_HOST: "camera.example",
  API_PORT: "4443",
  USERNAME: "operator",
  PASSWORD: "hunter2",
} as const;

/** What the control API receives once `DEVICE_ENV` has been loaded. */
export const CONTROL_API: ControlApiOptions = {
  host: DEVICE_ENV.VIGI_HOST,
  port: Number(DEVICE_ENV.API_PORT),
  rejectUnauthorized: false,
};

export const { USERNAME, PASSWORD } = DEVICE_ENV;

export type RunForeverMock = Mock<typeof runForever>;

/** Stubs the device settings every service needs, plus any tool-specific ones. */
export function stubDeviceEnv(overrides: Record<string, string> = {}): void {
  for (const [name, value] of Object.entries({ ...DEVICE_ENV, ...overrides })) {
    vi.stubEnv(name, value);
  }
}

/**
 * Services hand their check to `runForever` while their entry point is being
 * imported, so booting one means importing it again with a fresh module
 * registry.
 */
export async function bootService(
  runForeverMock: RunForeverMock,
  importEntryPoint: () => Promise<unknown>,
): Promise<() => Promise<void>> {
  vi.resetModules();
  await importEntryPoint();

  const check = runForeverMock.mock.lastCall?.[1];
  if (check === undefined) {
    throw new Error("the service never started its check loop");
  }

  return check;
}
