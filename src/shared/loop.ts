import { setTimeout } from "node:timers/promises";

import { logError } from "./log.ts";
import { TransientError } from "./transient-error.ts";

/**
 * Runs `fn` right away and then once every `intervalMs` until it fails. A
 * failure ends the loop on purpose: retrying against a camera that rejects us
 * can get the account locked for ever longer periods without anyone noticing.
 * A `TransientError` is the exception: the connection broke before the device
 * had a say, so the next run is left to try again. `startDelayMs` holds the
 * first run back, for loops that depend on groundwork another loop has to lay
 * first.
 */
export async function runForever(
  intervalMs: number,
  fn: () => Promise<void>,
  startDelayMs = 0,
): Promise<void> {
  if (startDelayMs > 0) {
    await setTimeout(startDelayMs);
  }

  while (true) {
    try {
      await fn();
    } catch (error) {
      logError(
        `${fn.name} failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      if (!(error instanceof TransientError)) {
        throw error;
      }
    }

    await setTimeout(intervalMs);
  }
}
