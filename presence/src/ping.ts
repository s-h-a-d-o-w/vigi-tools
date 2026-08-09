import { execFile } from "node:child_process";

// Rejects anything that could be mistaken for a ping option or a shell token.
const VIGI_HOST_PATTERN = /^[a-z\d][a-z\d.:_-]*$/iu;

function pingHost(host: string, timeoutMs: number): Promise<boolean> {
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));

  return new Promise((resolve) => {
    execFile(
      "ping",
      ["-n", "-c", "1", "-W", String(timeoutSeconds), host],
      { timeout: timeoutMs + 1000 },
      (error) => {
        resolve(error === null);
      },
    );
  });
}

/** True as soon as any of the devices answers a ping. */
export async function anyDevicePresent(
  devices: readonly string[],
  timeoutMs: number,
): Promise<string | undefined> {
  for (const device of devices) {
    if (!VIGI_HOST_PATTERN.test(device)) {
      throw new Error(`"${device}" is not a valid hostname or IP address`);
    }
  }

  const results = await Promise.all(
    devices.map(async (device) => ({
      device,
      present: await pingHost(device, timeoutMs),
    })),
  );

  return results.find((result) => result.present)?.device;
}
