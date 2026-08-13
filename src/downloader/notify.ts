import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

import { logError } from "../shared/log.ts";

import type { NotifyConfig } from "./config.ts";

export type BatchResult = { downloaded: number; failed: number };

export type Notifier = {
  /** A check is about to transfer `count` recordings. */
  downloadsStarted: () => void;
  /** A check finished its transfers, which starts the quiet period. */
  downloadsFinished: (result: BatchResult) => void;
  /** Sends a still pending summary right away and waits for delivery. */
  flush: () => Promise<void>;
};

const DISABLED_NOTIFIER: Notifier = {
  downloadsStarted: () => undefined,
  downloadsFinished: () => undefined,
  flush: () => Promise.resolve(),
};

// Narrowing the optional configuration does not survive into the callbacks
// below, so the configured case gets its own non-optional parameter.
function createSesNotifier(config: NotifyConfig): Notifier {
  const client = new SESv2Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  // A batch spans every check that keeps downloading, so the summary is only
  // sent once no download has happened for a whole quiet period.
  let batch: BatchResult | undefined;
  let quietTimer: NodeJS.Timeout | undefined;
  let delivery = Promise.resolve();

  function send(subject: string, body: string): void {
    delivery = delivery
      .then(async () => {
        await client.send(
          new SendEmailCommand({
            FromEmailAddress: config.sender,
            Destination: { ToAddresses: [config.recipient] },
            Content: {
              Simple: {
                Subject: { Data: subject },
                Body: { Text: { Data: body } },
              },
            },
          }),
        );
      })
      .catch((error: unknown) => {
        logError(
          `  notification failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  function sendSummary(): void {
    if (batch === undefined) {
      return;
    }

    send(
      `STOP activity on camera ${config.host}`,
      `${batch.downloaded} recording(s) downloaded, ${batch.failed} failed.`,
    );
    batch = undefined;
  }

  return {
    downloadsStarted: () => {
      if (quietTimer !== undefined) {
        clearTimeout(quietTimer);
        quietTimer = undefined;
      }

      if (batch === undefined) {
        batch = { downloaded: 0, failed: 0 };
        send(
          `START activity on camera ${config.host}`,
          `Recording(s) are being downloaded.`,
        );
      }
    },

    downloadsFinished: (result) => {
      if (batch === undefined) {
        return;
      }

      batch = {
        downloaded: batch.downloaded + result.downloaded,
        failed: batch.failed + result.failed,
      };
      quietTimer = setTimeout(() => {
        quietTimer = undefined;
        sendSummary();
      }, config.quietPeriodMs);
    },

    flush: async () => {
      if (quietTimer !== undefined) {
        clearTimeout(quietTimer);
        quietTimer = undefined;
        sendSummary();
      }

      await delivery;
    },
  };
}

export function createNotifier(config: NotifyConfig | undefined): Notifier {
  return config === undefined ? DISABLED_NOTIFIER : createSesNotifier(config);
}
