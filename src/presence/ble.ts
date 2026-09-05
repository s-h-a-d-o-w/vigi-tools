import { execFile } from "node:child_process";

// Six colon-separated hex pairs. Rejects anything that could be mistaken for a
// bluetoothctl option or a shell token.
const ADDRESS_PATTERN = /^[\da-f]{2}(?::[\da-f]{2}){5}$/iu;

// bluetoothctl dumps everything BlueZ has cached before it gets here, so only
// what follows proves that a device advertised during this scan.
const DISCOVERY_MARKER = "Discovery started";

// e.g. "[CHG] Device AA:BB:CC:DD:EE:FF RSSI: -63", possibly behind a prompt.
const DEVICE_LINE_PATTERN =
  /\[(?<event>NEW|CHG|DEL)\]\s+Device\s+(?<address>[\da-f]{2}(?::[\da-f]{2}){5})/iu;

// A crowded room produces thousands of advertisement lines per scan.
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

function scan(scanSeconds: number): Promise<string> {
  // bluetoothctl only understands whole seconds, and scanning for less than one
  // finds nothing.
  const seconds = Math.max(1, Math.ceil(scanSeconds));

  return new Promise((resolve, reject) => {
    execFile(
      "bluetoothctl",
      ["--timeout", String(seconds), "scan", "le"],
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

/** Addresses that were advertising while the scan was running. */
function advertisedAddresses(output: string): Set<string> {
  const discoveryStart = output.indexOf(DISCOVERY_MARKER);

  if (discoveryStart === -1) {
    throw new Error("bluetoothctl did not start a discovery");
  }

  const addresses = new Set<string>();

  for (const line of output.slice(discoveryStart).split("\n")) {
    const groups = DEVICE_LINE_PATTERN.exec(line)?.groups;
    const address = groups?.["address"];

    // [DEL] means BlueZ dropped a device it hasn't heard from in a while.
    if (address !== undefined && groups?.["event"] !== "DEL") {
      addresses.add(address.toUpperCase());
    }
  }

  return addresses;
}

/** The first of the devices that is within Bluetooth LE range. */
export async function anyDevicePresent(
  devices: readonly string[],
  scanSeconds: number,
): Promise<string | undefined> {
  for (const device of devices) {
    if (!ADDRESS_PATTERN.test(device)) {
      throw new Error(`"${device}" is not a valid Bluetooth address`);
    }
  }

  const addresses = advertisedAddresses(await scan(scanSeconds));

  return devices.find((device) => addresses.has(device.toUpperCase()));
}
