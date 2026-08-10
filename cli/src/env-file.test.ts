import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

import type { PathLike } from "node:fs";
import path from "node:path";
import process from "node:process";

import { envFilePath, loadEnvFile } from "./env-file.ts";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn<(file: PathLike) => boolean>(),
}));

vi.mock(import("node:fs"), () => ({ existsSync: mocks.existsSync }));

const CWD = "/srv/vigi";

describe("env file", () => {
  let loadEnvFileSpy: MockInstance<(file?: string) => void>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process, "cwd").mockReturnValue(CWD);
    loadEnvFileSpy = vi
      .spyOn(process, "loadEnvFile")
      .mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives every tool its own file in the current directory", () => {
    expect(envFilePath("downloader")).toBe(path.join(CWD, ".env.downloader"));
    expect(envFilePath("presence")).toBe(path.join(CWD, ".env.presence"));
  });

  it("loads the file of the tool that is starting", () => {
    mocks.existsSync.mockReturnValue(true);

    loadEnvFile("presence");

    expect(loadEnvFileSpy).toHaveBeenCalledWith(
      path.join(CWD, ".env.presence"),
    );
  });

  it("keeps the ambient environment when there is no file", () => {
    mocks.existsSync.mockReturnValue(false);

    loadEnvFile("presence");

    expect(loadEnvFileSpy).not.toHaveBeenCalled();
  });
});
