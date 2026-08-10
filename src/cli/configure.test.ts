import { assert, beforeEach, describe, expect, it, vi } from "vitest";

import type { PasswordOptions, TextOptions, log } from "@clack/prompts";
import type { PathLike } from "node:fs";
import type { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { envSchema } from "../presence/env-schema.ts";

import { configure } from "./configure.ts";

const mocks = vi.hoisted(() => ({
  CANCEL: Symbol("clack:cancel"),
  existsSync: vi.fn<(file: PathLike) => boolean>(),
  readFile: vi.fn<(file: string, encoding: string) => Promise<string>>(),
  writeFile:
    vi.fn<(file: string, data: string, options: object) => Promise<void>>(),
  chmod: vi.fn<(file: string, mode: number) => Promise<void>>(),
  text: vi.fn<(options: TextOptions) => Promise<string | symbol>>(),
  password: vi.fn<(options: PasswordOptions) => Promise<string | symbol>>(),
  cancel: vi.fn<(message?: string) => void>(),
  warn: vi.fn<(message: string) => void>(),
}));

vi.mock(import("node:fs"), () => ({ existsSync: mocks.existsSync }));
vi.mock(import("node:fs/promises"), () => ({
  readFile: mocks.readFile as unknown as typeof readFile,
  writeFile: mocks.writeFile as unknown as typeof writeFile,
  chmod: mocks.chmod as unknown as typeof chmod,
}));
vi.mock(import("@clack/prompts"), () => ({
  intro: vi.fn<(title?: string) => void>(),
  outro: vi.fn<(message?: string) => void>(),
  cancel: mocks.cancel,
  log: { warn: mocks.warn } as unknown as typeof log,
  isCancel: (value: unknown): value is symbol => value === mocks.CANCEL,
  text: mocks.text,
  password: mocks.password,
}));

const CWD = "/srv/vigi";
const FILE = path.join(CWD, ".env.presence");

/** What is typed into the prompt of a field, keyed by variable name. */
const ANSWERS: Record<string, string> = {
  VIGI_HOST: "camera.example",
  PASSWORD: "hunter2",
  PRESENCE_DEVICES: "phone, tablet",
};

/** A bare ENTER, which clack turns into the pre-filled value or an empty string. */
const ENTER = Symbol("enter");

/** The variable a prompt is asking about, which asks with its description. */
function fieldOf(message: string): string {
  return (
    envSchema.find(({ description }) => message.startsWith(description))
      ?.name ?? ""
  );
}

/**
 * Answers every prompt from `replies`, falling back to `ANSWERS` and to a bare
 * ENTER for anything that is left.
 */
function answer(replies: Record<string, string | symbol> = {}): void {
  const pick = (message: string): string | symbol | undefined => {
    const reply = replies[fieldOf(message)] ?? ANSWERS[fieldOf(message)];

    return reply === ENTER ? undefined : reply;
  };

  mocks.text.mockImplementation(({ message, initialValue }) =>
    Promise.resolve(pick(message) ?? initialValue ?? ""),
  );
  mocks.password.mockImplementation(({ message }) =>
    Promise.resolve(pick(message) ?? ""),
  );
}

/** The options a field was asked with. */
function optionsOf(
  prompt: typeof mocks.text | typeof mocks.password,
  field: string,
): TextOptions | PasswordOptions | undefined {
  return prompt.mock.calls
    .map(([options]) => options)
    .find(({ message }) => fieldOf(message) === field);
}

/** What `configure` handed to `writeFile`. */
function written(): string {
  return mocks.writeFile.mock.lastCall?.[1] ?? "";
}

describe(configure, () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process, "cwd").mockReturnValue(CWD);

    mocks.existsSync.mockReturnValue(false);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.chmod.mockResolvedValue(undefined);
    answer();
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

  it("offers the default as a placeholder and trims what is typed", async () => {
    answer({ VIGI_HOST: " camera.example " });

    await configure("presence");

    expect(optionsOf(mocks.text, "API_PORT")).toMatchObject({
      placeholder: "20443",
    });
    expect(written()).toContain("VIGI_HOST=camera.example\n");
  });

  it("masks secrets instead of asking for them in the clear", async () => {
    await configure("presence");

    expect(optionsOf(mocks.password, "PASSWORD")).toMatchObject({ mask: "*" });
    expect(optionsOf(mocks.text, "PASSWORD")).toBeUndefined();
    expect(written()).toContain("PASSWORD=hunter2");
  });

  it("rejects an empty answer where nothing can fill in", async () => {
    await configure("presence");

    const { validate } = optionsOf(mocks.text, "VIGI_HOST") ?? {};
    assert(typeof validate === "function");

    expect(validate("")).toBe("This one is required.");
    expect(validate("camera.example")).toBeUndefined();
    expect(optionsOf(mocks.text, "API_PORT")?.validate).toBeUndefined();
  });

  it("fills the prompts with the values of an existing file", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFile.mockResolvedValue("VIGI_HOST=old.example\nUSERNAME=ops\n");
    answer({ VIGI_HOST: ENTER, USERNAME: ENTER });

    await configure("presence");

    expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining(FILE));
    expect(optionsOf(mocks.text, "VIGI_HOST")).toMatchObject({
      initialValue: "old.example",
    });
    expect(written()).toContain("VIGI_HOST=old.example\n");
    expect(written()).toContain("USERNAME=ops\n");
  });

  it("comments out a pre-filled optional value that is cleared", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFile.mockResolvedValue("USERNAME=ops\n");
    answer({ USERNAME: "" });

    await configure("presence");

    expect(written()).toContain("# USERNAME=admin");
  });

  it("keeps the secret on file when its prompt is left empty", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFile.mockResolvedValue("PASSWORD=old-secret\n");
    answer({ PASSWORD: "" });

    await configure("presence");

    const options = optionsOf(mocks.password, "PASSWORD");
    expect(options?.message).toContain("keep the current one");
    expect(options?.validate).toBeUndefined();
    expect(written()).toContain("PASSWORD=old-secret\n");
  });

  it("writes nothing when a prompt is cancelled", async () => {
    answer({ VIGI_HOST: mocks.CANCEL });

    await configure("presence");

    expect(mocks.cancel).toHaveBeenCalledWith("Nothing was written.");
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
