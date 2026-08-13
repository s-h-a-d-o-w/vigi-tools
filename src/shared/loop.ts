import { setTimeout } from "node:timers/promises";

import { logError } from "./log.ts";

/**
 * Runs `fn` right away and then once every `intervalMs` until it fails. A
 * failure ends the loop on purpose: retrying against a camera that rejects us
 * can get the account locked for ever longer periods without anyone noticing.
 */
export async function runForever(
  intervalMs: number,
  fn: () => Promise<void>,
): Promise<void> {
  while (true) {
    try {
      await fn();
    } catch (error) {
      logError(
        `${fn.name} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    await setTimeout(intervalMs);
  }
}
