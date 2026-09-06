import { log, logError } from "../shared/log.ts";
import { createMailer } from "../shared/ses.ts";

import { isBatteryLow } from "./battery.ts";
import type { BatteryWarningConfig } from "./config.ts";

export type BatteryWarner = {
  /**
   * Reads the battery of the device that is currently nearby, unless it has
   * been read recently. Never rejects: a battery that cannot be read is worth
   * a log line, not the end of the service.
   */
  check: (address: string) => Promise<void>;
};

const DISABLED_WARNER: BatteryWarner = {
  check: () => Promise.resolve(),
};

// Narrowing the optional configuration does not survive into the callback
// below, so the configured case gets its own non-optional parameter.
function createSesWarner(config: BatteryWarningConfig): BatteryWarner {
  const mailer = createMailer(config);
  const lastCheck = new Map<string, number>();

  // A device stays on this list until its battery recovers, so a replaced
  // battery arms the warning again while a low one only warns once.
  const warned = new Set<string>();

  async function check(address: string): Promise<void> {
    const previous = lastCheck.get(address);

    if (
      previous !== undefined &&
      Date.now() - previous < config.checkIntervalMs
    ) {
      return;
    }

    lastCheck.set(address, Date.now());

    const low = await isBatteryLow(address);

    if (low === undefined) {
      log(`  ${address} does not report battery status`);
      return;
    }

    log(`  ${address} battery ${low ? "low" : "fine"}`);

    if (!low) {
      warned.delete(address);
      return;
    }

    if (warned.has(address)) {
      return;
    }

    warned.add(address);
    mailer.send(
      `Low battery on presence device ${address}`,
      `The battery of ${address} is flagged as low by the device itself.`,
    );
  }

  return {
    check: async (address) => {
      try {
        await check(address);
      } catch (error) {
        logError(
          `  battery check for ${address} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

export function createBatteryWarner(
  config: BatteryWarningConfig | undefined,
): BatteryWarner {
  return config === undefined ? DISABLED_WARNER : createSesWarner(config);
}
