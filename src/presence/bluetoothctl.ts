import { execFile } from "node:child_process";

// A busy area produces a lot of chatter, so the buffer has to be generous.
const MAX_OUTPUT_BYTES = 8 * 1_024 * 1_024;

/** Runs bluetoothctl non-interactively and resolves with everything it printed. */
export function bluetoothctl(
  args: readonly string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "bluetoothctl",
      [...args],
      { timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout) => {
        if (error === null) {
          resolve(stdout);

          return;
        }

        reject(
          "code" in error && error.code === "ENOENT"
            ? new Error(
                "`bluetoothctl` not found - install BlueZ to talk to Bluetooth devices",
                { cause: error },
              )
            : error,
        );
      },
    );
  });
}
