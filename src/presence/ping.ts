import { execFile } from "node:child_process";

// Rejects anything that could be mistaken for a ping option or a shell token.
const VIGI_HOST_PATTERN = /^[a-z\d][a-z\d.:_-]*$/iu;

function pingHost(host: string, timeoutSeconds: number): Promise<boolean> {
  // ping only understands whole seconds, and waiting less than one is useless.
  const wait = Math.max(1, Math.ceil(timeoutSeconds));

  return new Promise((resolve) => {
    execFile(
      "ping",
      ["-n", "-c", "1", "-W", String(wait), host],
      { timeout: wait * 1000 + 1000 },
      (error) => {
        resolve(error === null);
      },
    );
  });
}

/** True as soon as any of the devices answers a ping. */
export async function anyDevicePresent(
  devices: readonly string[],
  timeoutSeconds: number,
): Promise<string | undefined> {
  for (const device of devices) {
    if (!VIGI_HOST_PATTERN.test(device)) {
      throw new Error(`"${device}" is not a valid hostname or IP address`);
    }
  }

  const results = await Promise.all(
    devices.map(async (device) => ({
      device,
      present: await pingHost(device, timeoutSeconds),
    })),
  );

  return results.find((result) => result.present)?.device;
}
