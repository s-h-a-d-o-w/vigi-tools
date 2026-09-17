import process from "node:process";

import { loadSesConfig } from "./config.ts";
import { createEnvReader } from "./env.ts";
import { sharedEnvSchema } from "./env-schema.ts";
import { logError } from "./log.ts";
import { createMailer, type Mailer } from "./ses.ts";

// Only set once a tool has been started: the CLI itself fails before any
// environment was read, and then there is nobody to report to.
let mailer: Mailer | undefined;
let toolName = "";

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  return String(error);
}

/**
 * Mails a crash report when notifications are configured and waits for the
 * delivery, so that the caller may exit afterwards.
 */
export async function reportFatalError(error: unknown): Promise<void> {
  if (mailer === undefined) {
    return;
  }

  mailer.send(`CRASH of vigi-tools ${toolName}`, describe(error));
  await mailer.flush();
}

function reportAndExit(crash: unknown): void {
  logError(describe(crash));

  // Node would have ended the process here, so the report is all that is left
  // to do - whether it worked or not.
  void reportFatalError(crash).finally(() => {
    process.exit(1);
  });
}

/**
 * Makes the crashes that bypass every `try` - a throw from a callback, a
 * rejection nobody awaited - end up in a mail instead of only in the journal.
 */
export function installCrashReporter(tool: string): void {
  const config = loadSesConfig(createEnvReader(sharedEnvSchema));

  toolName = tool;
  mailer = config === undefined ? undefined : createMailer(config);

  process.on("uncaughtException", reportAndExit);
  process.on("unhandledRejection", reportAndExit);
}
