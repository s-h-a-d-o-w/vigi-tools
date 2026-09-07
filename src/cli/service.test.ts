import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { execFileSync } from "node:child_process";
import type { PathLike, rmSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { install, uninstall } from "./service.ts";

type ExecFileSync = (
  file: string,
  args: readonly string[],
  options: object,
) => string;

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn<ExecFileSync>(),
  existsSync: vi.fn<(file: PathLike) => boolean>(),
  rmSync: vi.fn<(file: PathLike, options: object) => void>(),
  writeFileSync:
    vi.fn<(file: PathLike, data: string, options: object) => void>(),
}));

vi.mock(import("node:child_process"), () => ({
  // The real signature carries overloads that service.ts does not use.
  execFileSync: mocks.execFileSync as unknown as typeof execFileSync,
}));
vi.mock(import("node:fs"), () => ({
  existsSync: mocks.existsSync,
  rmSync: mocks.rmSync as unknown as typeof rmSync,
  writeFileSync: mocks.writeFileSync as unknown as typeof writeFileSync,
}));

const UNIT_PATH = "/etc/systemd/system/vigi-presence.service";
const CWD = "/srv/vigi";
/** `cliPath` resolves to the CLI entry next to this module. */
const CLI_PATH = fileURLToPath(new URL("index.ts", import.meta.url));

function becomeRoot(): void {
  vi.spyOn(process, "getuid").mockReturnValue(0);
}

/** The unit file `install` handed to `writeFileSync`. */
function writtenUnit(): string {
  return mocks.writeFileSync.mock.lastCall?.[1] ?? "";
}

describe("systemd service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process, "cwd").mockReturnValue(CWD);
    vi.spyOn(process, "getuid").mockReturnValue(1_000);
    vi.spyOn(console, "log").mockReturnValue(undefined);

    mocks.existsSync.mockReturnValue(true);
    mocks.execFileSync.mockReturnValue("pi\n");
    vi.stubEnv("SUDO_USER", "pi");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.exitCode = 0;
  });

  describe(install, () => {
    it("re-runs itself through sudo when not root", () => {
      install("presence");

      expect(mocks.execFileSync).toHaveBeenNthCalledWith(
        1,
        "sudo",
        [process.execPath, CLI_PATH, "presence", "install"],
        { stdio: "inherit" },
      );
      expect(mocks.writeFileSync).not.toHaveBeenCalled();
    });

    it("reports a missing sudo", () => {
      mocks.execFileSync.mockImplementationOnce(() => {
        throw Object.assign(new Error("spawnSync sudo ENOENT"), {
          code: "ENOENT",
        });
      });

      expect(() => install("presence")).toThrow("sudo is not available");
    });

    it("fails when the elevated run fails", () => {
      mocks.execFileSync.mockImplementationOnce(() => {
        throw new Error("Command failed: sudo");
      });

      install("presence");

      expect(process.exitCode).toBe(1);
    });

    it("asks for a configuration before installing one", () => {
      becomeRoot();
      mocks.existsSync.mockReturnValue(false);

      expect(() => install("presence")).toThrow(
        'run "vigi-tools presence configure" here first',
      );
      expect(mocks.writeFileSync).not.toHaveBeenCalled();
    });

    it("writes a unit that runs the tool as the user behind sudo", () => {
      becomeRoot();

      install("presence");

      expect(mocks.execFileSync).toHaveBeenNthCalledWith(
        1,
        "id",
        ["-gn", "pi"],
        { encoding: "utf8" },
      );
      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        UNIT_PATH,
        expect.any(String),
        { mode: 0o644 },
      );
      expect(writtenUnit()).toContain("User=pi\nGroup=pi\n");
      expect(writtenUnit()).toContain(`WorkingDirectory=${CWD}\n`);
      expect(writtenUnit()).toContain(
        `ExecStart="${process.execPath}" "${CLI_PATH}" presence\n`,
      );
    });

    it("falls back to root when sudo did not report a user", () => {
      becomeRoot();
      vi.stubEnv("SUDO_USER", undefined);
      mocks.execFileSync.mockReturnValue("root\n");

      install("presence");

      expect(mocks.execFileSync).toHaveBeenNthCalledWith(
        1,
        "id",
        ["-gn", "root"],
        { encoding: "utf8" },
      );
      expect(writtenUnit()).toContain("User=root\nGroup=root\n");
    });

    it("reloads systemd and starts the service", () => {
      becomeRoot();

      install("presence");

      expect(mocks.execFileSync).toHaveBeenNthCalledWith(
        2,
        "systemctl",
        ["daemon-reload"],
        { stdio: "inherit" },
      );
      expect(mocks.execFileSync).toHaveBeenNthCalledWith(
        3,
        "systemctl",
        ["enable", "--now", "vigi-presence.service"],
        { stdio: "inherit" },
      );
    });
  });

  describe(uninstall, () => {
    it("re-runs itself through sudo when not root", () => {
      uninstall("presence");

      expect(mocks.execFileSync).toHaveBeenNthCalledWith(
        1,
        "sudo",
        [process.execPath, CLI_PATH, "presence", "uninstall"],
        { stdio: "inherit" },
      );
      expect(mocks.rmSync).not.toHaveBeenCalled();
    });

    it("stops the service and removes its unit", () => {
      becomeRoot();

      uninstall("presence");

      expect(mocks.execFileSync).toHaveBeenNthCalledWith(
        1,
        "systemctl",
        ["disable", "--now", "vigi-presence.service"],
        { stdio: "inherit" },
      );
      expect(mocks.rmSync).toHaveBeenCalledWith(UNIT_PATH, { force: true });
      expect(mocks.execFileSync).toHaveBeenNthCalledWith(
        2,
        "systemctl",
        ["daemon-reload"],
        { stdio: "inherit" },
      );
      expect(mocks.execFileSync).toHaveBeenNthCalledWith(
        3,
        "systemctl",
        ["reset-failed"],
        { stdio: "inherit" },
      );
    });

    it("removes a leftover unit even when the service is unknown", () => {
      becomeRoot();
      mocks.execFileSync.mockImplementationOnce(() => {
        throw new Error("Unit vigi-presence.service does not exist");
      });

      expect(() => uninstall("presence")).not.toThrow();
      expect(mocks.rmSync).toHaveBeenCalledWith(UNIT_PATH, { force: true });
    });
  });
});
