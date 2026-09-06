import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

import { logError } from "./log.ts";

/** The SES identity and credentials a tool sends its mails through. */
export type SesConfig = {
  accessKeyId: string;
  recipient: string;
  region: string;
  secretAccessKey: string;
  sender: string;
};

export type Mailer = {
  /**
   * Queues a mail. Delivery happens in the background because a service must
   * keep doing its job when SES is unreachable.
   */
  send: (subject: string, body: string) => void;
  /** Waits for every queued mail to have been handed to SES. */
  flush: () => Promise<void>;
};

export function createMailer(config: SesConfig): Mailer {
  const client = new SESv2Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  // Mails are chained onto one promise so that they arrive in the order they
  // were queued in.
  let delivery = Promise.resolve();

  return {
    send: (subject, body) => {
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
    },

    flush: () => delivery,
  };
}
