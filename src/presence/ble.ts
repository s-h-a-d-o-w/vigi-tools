import { execFile } from "node:child_process";

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

function scan(scanSeconds: number): Promise<string> {
  // bluetoothctl only understands whole seconds, and scanning for less than one
  // finds nothing.
  const seconds = Math.max(1, Math.ceil(scanSeconds));

  return new Promise((resolve, reject) => {
    execFile(
      "bluetoothctl",
      ["--timeout", String(seconds), "scan", "le"],
      // A busy area produces a lot of chatter, and bluetoothctl needs a moment
      // to wind the scan down before the kill timeout applies.
      { timeout: (seconds + 5) * 1000, maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout) => {
        if (error === null) {
          resolve(stdout);

          return;
        }

        reject(
          "code" in error && error.code === "ENOENT"
            ? new Error(
                "`bluetoothctl` not found - install BlueZ to detect Bluetooth devices",
                { cause: error },
              )
            : error,
        );
      },
    );
  });
}

/** The first of the devices that is within Bluetooth LE range. */
export async function anyDevicePresent(
  devices: readonly string[],
  scanSeconds: number,
): Promise<string | undefined> {
  // An address is distinctive enough that anything mentioning it is the device
  // showing up, whether that's a [NEW], a [CHG] or a prompt.
  const scanned = await scan(scanSeconds);
  return devices.find((device) => scanned.includes(device));
}
