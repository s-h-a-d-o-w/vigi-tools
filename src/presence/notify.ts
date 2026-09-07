import { log, logError } from "../shared/log.ts";
import { createMailer, type SesConfig } from "../shared/ses.ts";

import { isBatteryLow } from "./battery.ts";

export type BatteryWarner = {
  /**
   * Reads the battery of every device, skipping the ones that are out of range
   * or do not advertise an indication. Never rejects: a battery that cannot be
   * read is worth a log line, not the end of the service.
   */
  check: (addresses: readonly string[]) => Promise<void>;
};

const DISABLED_WARNER: BatteryWarner = {
  check: () => Promise.resolve(),
};

// Narrowing the optional configuration does not survive into the callback
// below, so the configured case gets its own non-optional parameter.
function createSesWarner(config: SesConfig): BatteryWarner {
  const mailer = createMailer(config);

  // A device stays on this list until its battery recovers, so a replaced
  // battery arms the warning again while a low one only warns once.
  const warned = new Set<string>();

  async function check(address: string): Promise<void> {
    const low = await isBatteryLow(address);

    if (low === undefined) {
      log(`  ${address} does not report battery status`);
      return;
    }

    if (!low) {
      warned.delete(address);
      return;
    }

    log(`  ${address} battery is low!`);
    if (warned.has(address)) {
      return;
    }

    warned.add(address);
    mailer.send(
      `Low battery on presence device ${address}`,
      `The battery of ${address} got flagged as being low.`,
    );
    log(`  Sent email notification for ${address}.`);
  }

  return {
    check: async (addresses) => {
      // bluetoothctl is a single shared resource, so the devices are read one
      // after the other rather than all at once.
      for (const address of addresses) {
        try {
          await check(address);
        } catch (error) {
          logError(
            `  battery check for ${address} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    },
  };
}

export function createBatteryWarner(
  config: SesConfig | undefined,
): BatteryWarner {
  return config === undefined ? DISABLED_WARNER : createSesWarner(config);
}
