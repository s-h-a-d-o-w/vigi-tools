import { setTimeout } from "node:timers/promises";

import { logError } from "./log.ts";

/**
 * Runs `fn` right away and then once every `intervalMs`, forever. Failures
 * are logged rather than thrown so a single bad run cannot end the service.
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
    }

    await setTimeout(intervalMs);
  }
}
