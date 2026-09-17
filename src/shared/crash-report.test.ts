import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

import process from "node:process";

const mocks = vi.hoisted(() => ({
  send: vi.fn<(subject: string, body: string) => void>(),
  flush: vi.fn<() => Promise<void>>(),
  createMailer: vi.fn<(config: unknown) => unknown>(),
  logError: vi.fn<(message: string) => void>(),
}));

vi.mock(import("./ses.ts"), () => ({
  createMailer: (config: unknown) => {
    mocks.createMailer(config);

    return { send: mocks.send, flush: mocks.flush };
  },
}));
vi.mock(import("./log.ts"), () => ({
  log: vi.fn<(message: string) => void>(),
  logError: mocks.logError,
}));

const SES_ENV = {
  NOTIFY_EMAIL_TO: "owner@example.com",
  NOTIFY_EMAIL_FROM: "camera@example.com",
  AWS_REGION: "eu-central-1",
  AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
  AWS_SECRET_ACCESS_KEY: "s3cret",
} as const;

/** The reporter remembers its mailer, so every test needs a fresh module. */
function load(): Promise<typeof import("./crash-report.ts")> {
  vi.resetModules();

  return import("./crash-report.ts");
}

function stubSesEnv(): void {
  for (const [name, value] of Object.entries(SES_ENV)) {
    vi.stubEnv(name, value);
  }
}

let onSpy: MockInstance<typeof process.on>;
let exitSpy: MockInstance<typeof process.exit>;

/** The crash handler that was registered for `event`. */
function handler(event: string): (error: unknown) => void {
  const call = onSpy.mock.calls.find(([name]) => name === event);

  if (call === undefined) {
    throw new Error(`nothing was registered for ${event}`);
  }

  return call[1] as (error: unknown) => void;
}

describe("crash report", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Registering for real would take the crashes of the test run, too.
    onSpy = vi.spyOn(process, "on").mockReturnValue(process);
    exitSpy = vi.spyOn(process, "exit").mockReturnValue(undefined as never);

    mocks.flush.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("stays quiet when notifications are off", async () => {
    vi.stubEnv("NOTIFY_EMAIL_TO", "");
    const { installCrashReporter, reportFatalError } = await load();

    installCrashReporter("presence");
    await reportFatalError(new Error("boom"));

    expect(mocks.createMailer).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("mails a fatal error the CLI caught itself", async () => {
    stubSesEnv();
    const { installCrashReporter, reportFatalError } = await load();

    installCrashReporter("downloader");
    await reportFatalError(new Error("2 recording(s) could not be downloaded"));

    expect(mocks.createMailer).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: SES_ENV.NOTIFY_EMAIL_TO }),
    );
    expect(mocks.send.mock.lastCall?.[0]).toBe(
      "CRASH of vigi-tools downloader",
    );
    expect(mocks.send.mock.lastCall?.[1]).toContain(
      "2 recording(s) could not be downloaded",
    );
    expect(mocks.flush).toHaveBeenCalledOnce();
  });

  it.each(["uncaughtException", "unhandledRejection"])(
    "reports %s and exits",
    async (event) => {
      stubSesEnv();
      const { installCrashReporter } = await load();

      installCrashReporter("presence");
      handler(event)(new Error("nobody awaited me"));
      await vi.waitFor(() => {
        expect(exitSpy).toHaveBeenCalledWith(1);
      });

      expect(mocks.logError.mock.lastCall?.[0]).toContain(
        "Error: nobody awaited me",
      );
      expect(mocks.send.mock.lastCall?.[1]).toContain("nobody awaited me");
      expect(mocks.flush).toHaveBeenCalledOnce();
    },
  );
});
