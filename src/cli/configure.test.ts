import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PathLike } from "node:fs";
import type { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { createInterface, Interface } from "node:readline/promises";
import type { Writable } from "node:stream";

import { configure } from "./configure.ts";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn<(file: PathLike) => boolean>(),
  writeFile:
    vi.fn<(file: string, data: string, options: object) => Promise<void>>(),
  chmod: vi.fn<(file: string, mode: number) => Promise<void>>(),
  createInterface: vi.fn<(options: { output: Writable }) => Interface>(),
  question: vi.fn<(query: string) => Promise<string>>(),
  close: vi.fn<() => void>(),
}));

vi.mock(import("node:fs"), () => ({ existsSync: mocks.existsSync }));
vi.mock(import("node:fs/promises"), () => ({
  writeFile: mocks.writeFile as unknown as typeof writeFile,
  chmod: mocks.chmod as unknown as typeof chmod,
}));
vi.mock(import("node:readline/promises"), () => ({
  // The real signature carries overloads that configure.ts does not use.
  createInterface: mocks.createInterface as unknown as typeof createInterface,
}));

const CWD = "/srv/vigi";
const FILE = path.join(CWD, ".env.presence");

/** One reply per field of the presence schema, in the order it is walked. */
const ANSWERS = [
  "camera.example", // VIGI_HOST
  "hunter2", // PASSWORD (secret)
  "", // USERNAME
  "", // API_PORT
  "", // TLS_REJECT_UNAUTHORIZED
  "phone, tablet", // PRESENCE_DEVICES
  "", // CHECK_INTERVAL_MS
  "", // PING_TIMEOUT_MS
];

/** Everything that reached the terminal. */
const terminal: string[] = [];

/**
 * Answers the prompts in order, falling back to an empty line. Replies are
 * echoed onto the interface's output stream, the way readline echoes typing.
 */
function answer(...replies: string[]): void {
  const queue = [...replies];

  mocks.question.mockImplementation(() => {
    const reply = queue.shift() ?? "";
    mocks.createInterface.mock.lastCall?.[0].output.write(`${reply}\n`);

    return Promise.resolve(reply);
  });
}

/** What `configure` handed to `writeFile`. */
function written(): string {
  return mocks.writeFile.mock.lastCall?.[1] ?? "";
}

describe(configure, () => {
  beforeEach(() => {
    vi.resetAllMocks();
    terminal.length = 0;
    vi.spyOn(process, "cwd").mockReturnValue(CWD);
    vi.spyOn(console, "log").mockReturnValue(undefined);
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      terminal.push(String(chunk));
      return true;
    });

    mocks.existsSync.mockReturnValue(false);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.chmod.mockResolvedValue(undefined);
    mocks.createInterface.mockReturnValue({
      question: mocks.question,
      close: mocks.close,
    } as unknown as Interface);
    answer(...ANSWERS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the answers and comments out the accepted defaults", async () => {
    await configure("presence");

    expect(mocks.writeFile).toHaveBeenCalledWith(FILE, expect.any(String), {
      mode: 0o600,
    });
    expect(written()).toContain(
      "# Hostname or IP address of the camera\nVIGI_HOST=camera.example",
    );
    expect(written()).toContain("PRESENCE_DEVICES=phone, tablet");
    expect(written()).toContain(
      "# Camera account to log in as\n# USERNAME=admin",
    );
    expect(written().endsWith("\n")).toBe(true);
  });

  it("keeps the file readable by its owner only", async () => {
    await configure("presence");

    expect(mocks.chmod).toHaveBeenCalledWith(FILE, 0o600);
  });

  it("offers the default in the prompt and trims what is typed", async () => {
    answer(" camera.example ", ...ANSWERS.slice(1));

    await configure("presence");

    expect(mocks.question).toHaveBeenCalledWith("API_PORT [20443]: ");
    expect(written()).toContain("VIGI_HOST=camera.example\n");
  });

  it("repeats a required question until it is answered", async () => {
    answer("", "", ...ANSWERS);

    await configure("presence");

    const asked = mocks.question.mock.calls.filter(
      ([query]) => query === "VIGI_HOST: ",
    );
    expect(asked).toHaveLength(3);
    expect(written()).toContain("VIGI_HOST=camera.example\n");
  });

  it("keeps secrets out of the scrollback", async () => {
    await configure("presence");

    expect(terminal.join("")).toContain("PASSWORD: ");
    expect(terminal.join("")).not.toContain("hunter2");
    expect(terminal.join("")).toContain("camera.example");
    expect(written()).toContain("PASSWORD=hunter2");
  });

  it("leaves an existing file alone unless the overwrite is confirmed", async () => {
    mocks.existsSync.mockReturnValue(true);
    answer("n");

    await configure("presence");

    expect(mocks.question).toHaveBeenCalledWith(
      `${FILE} exists. Overwrite? [y/N] `,
    );
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledWith();
  });

  it("overwrites an existing file once that is confirmed", async () => {
    mocks.existsSync.mockReturnValue(true);
    answer("Y", ...ANSWERS);

    await configure("presence");

    expect(mocks.writeFile).toHaveBeenCalledWith(FILE, expect.any(String), {
      mode: 0o600,
    });
  });

  it("closes the interface when a question fails", async () => {
    mocks.question.mockRejectedValue(new Error("stdin closed"));

    await expect(configure("presence")).rejects.toThrow("stdin closed");
    expect(mocks.close).toHaveBeenCalledWith();
  });
});
