import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  SendEmailCommandInput,
  SESv2ClientConfig,
} from "@aws-sdk/client-sesv2";

import type { NotifyConfig } from "./config.ts";
import { createNotifier } from "./notify.ts";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn<(config: SESv2ClientConfig) => void>(),
  createCommand: vi.fn<(input: SendEmailCommandInput) => void>(),
  send: vi.fn<(command: unknown) => Promise<void>>(),
  log: vi.fn<(message: string) => void>(),
  logError: vi.fn<(message: string) => void>(),
}));

vi.mock(import("@aws-sdk/client-sesv2"), () => {
  // A command only has to record what it was built with.
  function SendEmailCommand(input: SendEmailCommandInput): void {
    mocks.createCommand(input);
  }

  return {
    SESv2Client: class {
      send = mocks.send;

      constructor(config: SESv2ClientConfig) {
        mocks.createClient(config);
      }
    },
    SendEmailCommand,
  } as unknown as typeof import("@aws-sdk/client-sesv2");
});
vi.mock(import("../shared/log.ts"), () => ({
  log: mocks.log,
  logError: mocks.logError,
}));

const CONFIG: NotifyConfig = {
  host: "camera.local",
  region: "eu-central-1",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "s3cret",
  sender: "camera@example.com",
  recipient: "owner@example.com",
  quietPeriodMs: 120_000,
};

/** The input of the nth `SendEmailCommand` that was handed to the client. */
function sentMail(nth: number): SendEmailCommandInput {
  const input = mocks.createCommand.mock.calls[nth - 1]?.[0];
  if (input === undefined) {
    throw new Error(
      `only ${mocks.createCommand.mock.calls.length} mail(s) sent`,
    );
  }

  return input;
}

function subjectOf(input: SendEmailCommandInput): string | undefined {
  return input.Content?.Simple?.Subject?.Data;
}

function bodyOf(input: SendEmailCommandInput): string | undefined {
  return input.Content?.Simple?.Body?.Text?.Data;
}

describe(createNotifier, () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.send.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing without a configuration", async () => {
    const notifier = createNotifier(undefined);

    notifier.downloadsStarted();
    notifier.downloadsFinished({ downloaded: 2, failed: 0 });
    await notifier.flush();

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends the first mail once downloads begin", async () => {
    const notifier = createNotifier(CONFIG);

    notifier.downloadsStarted();
    await notifier.flush();

    expect(mocks.createClient).toHaveBeenCalledWith({
      region: CONFIG.region,
      credentials: {
        accessKeyId: CONFIG.accessKeyId,
        secretAccessKey: CONFIG.secretAccessKey,
      },
    });
    expect(sentMail(1)).toStrictEqual({
      FromEmailAddress: CONFIG.sender,
      Destination: { ToAddresses: [CONFIG.recipient] },
      Content: {
        Simple: {
          Subject: { Data: "START activity on camera camera.local" },
          Body: { Text: { Data: "Recording(s) are being downloaded." } },
        },
      },
    });
  });

  it("stays quiet while later checks keep downloading", async () => {
    const notifier = createNotifier(CONFIG);

    notifier.downloadsStarted();
    notifier.downloadsFinished({ downloaded: 2, failed: 0 });
    notifier.downloadsStarted();
    await notifier.flush();

    expect(mocks.createCommand).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({}),
    );
    expect(subjectOf(sentMail(1))).toBe(
      "START activity on camera camera.local",
    );
  });

  it("summarizes the whole batch once the quiet period has passed", async () => {
    vi.useFakeTimers();
    const notifier = createNotifier(CONFIG);

    notifier.downloadsStarted();
    notifier.downloadsFinished({ downloaded: 2, failed: 0 });
    await vi.advanceTimersByTimeAsync(60_000);

    notifier.downloadsStarted();
    notifier.downloadsFinished({ downloaded: 0, failed: 1 });
    await vi.advanceTimersByTimeAsync(CONFIG.quietPeriodMs - 1_000);

    expect(mocks.createCommand).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({}),
    );

    await vi.advanceTimersByTimeAsync(1_000);

    expect(subjectOf(sentMail(2))).toBe("STOP activity on camera camera.local");
    expect(bodyOf(sentMail(2))).toBe("2 recording(s) downloaded, 1 failed.");
  });

  it("starts a new batch after a summary was sent", async () => {
    vi.useFakeTimers();
    const notifier = createNotifier(CONFIG);

    notifier.downloadsStarted();
    notifier.downloadsFinished({ downloaded: 1, failed: 0 });
    await vi.advanceTimersByTimeAsync(CONFIG.quietPeriodMs);

    notifier.downloadsStarted();
    await vi.advanceTimersByTimeAsync(0);

    expect(subjectOf(sentMail(3))).toBe(
      "START activity on camera camera.local",
    );
    expect(bodyOf(sentMail(3))).toBe("Recording(s) are being downloaded.");
  });

  it("sends a pending summary right away when flushed", async () => {
    vi.useFakeTimers();
    const notifier = createNotifier(CONFIG);

    notifier.downloadsStarted();
    notifier.downloadsFinished({ downloaded: 0, failed: 1 });
    await notifier.flush();

    expect(bodyOf(sentMail(2))).toBe("0 recording(s) downloaded, 1 failed.");
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("keeps running when SES rejects a mail", async () => {
    mocks.send.mockRejectedValue(new Error("Throttling"));
    const notifier = createNotifier(CONFIG);

    notifier.downloadsStarted();
    await notifier.flush();

    expect(mocks.logError).toHaveBeenCalledWith(
      "  notification failed: Throttling",
    );
  });
});
