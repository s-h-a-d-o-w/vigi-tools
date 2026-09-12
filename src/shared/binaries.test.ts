import { describe, expect, it, vi } from "vitest";

import { accessSync } from "node:fs";
import path from "node:path";

import { requireBinaries } from "./binaries.ts";

vi.mock(import("node:fs"), async (importOriginal) => ({
  ...(await importOriginal()),
  accessSync: vi.fn<typeof accessSync>(),
}));

/** Pretends that only the given absolute paths are executable. */
function onlyExecutable(...paths: string[]): void {
  vi.mocked(accessSync).mockImplementation((target) => {
    if (!paths.includes(String(target))) {
      throw new Error("ENOENT");
    }
  });
}

describe(requireBinaries, () => {
  it("accepts binaries found anywhere on PATH", () => {
    vi.stubEnv("PATH", ["/usr/bin", "", "/opt/bin"].join(path.delimiter));
    onlyExecutable("/usr/bin/ffmpeg", "/opt/bin/bluetoothctl");

    expect(() => {
      requireBinaries(["ffmpeg", "bluetoothctl"]);
    }).not.toThrow();

    vi.unstubAllEnvs();
  });

  it("reports every missing binary at once", () => {
    vi.stubEnv("PATH", "/usr/bin");
    onlyExecutable("/usr/bin/ffmpeg");

    expect(() => {
      requireBinaries(["ffmpeg", "bluetoothctl", "socat"]);
    }).toThrow(/bluetoothctl, socat/u);

    vi.unstubAllEnvs();
  });

  it("treats an unset PATH as nothing being available", () => {
    vi.stubEnv("PATH", undefined);
    onlyExecutable();

    expect(() => {
      requireBinaries(["ffmpeg"]);
    }).toThrow(/ffmpeg/u);

    vi.unstubAllEnvs();
  });
});
