import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import process from "node:process";

const mocks = vi.hoisted(() => ({
  configure: vi.fn<(tool: string) => Promise<void>>(),
  install: vi.fn<(tool: string) => void>(),
  uninstall: vi.fn<(tool: string) => void>(),
  loadEnvFile: vi.fn<(tool: string) => void>(),
}));

vi.mock(import("./configure.ts"), () => ({ configure: mocks.configure }));
vi.mock(import("./service.ts"), () => ({
  install: mocks.install,
  uninstall: mocks.uninstall,
}));
vi.mock(import("./env-file.ts"), () => ({
  loadEnvFile: mocks.loadEnvFile,
  envFilePath: vi.fn<(tool: string) => string>(),
}));

const ORIGINAL_ARGV = process.argv;

/** The entry point runs on import, so every invocation needs a fresh module. */
async function run(...args: string[]): Promise<void> {
  process.argv = ["node", "vigi-tools", ...args];
  vi.resetModules();
  await import("./index.ts");
}

/** Everything the CLI printed to stdout. */
function printed(): string {
  return vi
    .mocked(console.log)
    .mock.calls.map((args) => args.join(" "))
    .join("\n");
}

describe("cli", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockReturnValue(undefined);
    vi.spyOn(console, "error").mockReturnValue(undefined);

    mocks.configure.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.argv = ORIGINAL_ARGV;
    process.exitCode = undefined;
  });

  it("prints the usage without arguments and on request", async () => {
    for (const args of [[], ["--help"], ["-h"]]) {
      vi.mocked(console.log).mockClear();

      await run(...args);

      expect(printed()).toContain("Usage: vigi-tools <tool|command> [tool]");
      expect(printed()).toContain("downloader");
      expect(printed()).toContain("presence");
    }

    expect(process.exitCode).toBeUndefined();
  });

  it("loads the environment of a tool before starting it", async () => {
    // The tool bundle only exists next to the built CLI, so the import that
    // follows fails here - by then the environment has been loaded.
    await run("downloader");

    expect(mocks.loadEnvFile).toHaveBeenCalledWith("downloader");
    expect(mocks.configure).not.toHaveBeenCalled();
  });

  it("hands configure, install and uninstall their tool", async () => {
    await run("configure", "presence");
    await run("install", "downloader");
    await run("uninstall", "presence");

    expect(mocks.configure).toHaveBeenCalledWith("presence");
    expect(mocks.install).toHaveBeenCalledWith("downloader");
    expect(mocks.uninstall).toHaveBeenCalledWith("presence");
    expect(process.exitCode).toBeUndefined();
  });

  it("reports an unknown command with the usage and fails", async () => {
    await run("start");

    expect(vi.mocked(console.error).mock.lastCall?.[0]).toContain(
      "Unknown tool or command: start",
    );
    expect(vi.mocked(console.error).mock.lastCall?.[0]).toContain(
      "Usage: vigi-tools",
    );
    expect(process.exitCode).toBe(1);
  });

  it("fails when a command is missing its tool", async () => {
    await run("install");

    expect(console.error).toHaveBeenCalledWith(
      "install needs a tool: downloader, presence",
    );
    expect(mocks.install).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("fails when a command names something that is not a tool", async () => {
    await run("configure", "camera");

    expect(console.error).toHaveBeenCalledWith(
      "configure needs a tool: downloader, presence",
    );
    expect(mocks.configure).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
