import { bluetoothctl } from "./bluetoothctl.ts";

function scan(scanSeconds: number): Promise<string> {
  // bluetoothctl only understands whole seconds, and scanning for less than one
  // finds nothing.
  const seconds = Math.max(1, Math.ceil(scanSeconds));

  return bluetoothctl(
    ["--timeout", String(seconds), "scan", "le"],
    // bluetoothctl needs a moment to wind the scan down before the kill timeout
    // applies.
    (seconds + 5) * 1000,
  );
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
