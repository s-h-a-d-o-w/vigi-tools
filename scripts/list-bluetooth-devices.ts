#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SCAN_SECONDS = 10;
const DEVICE_PREFIX = "Device ";

async function bluetoothctl(args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("bluetoothctl", [...args], {
      timeout: (SCAN_SECONDS + 5) * 1000,
    });

    return stdout;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        "`bluetoothctl` not found - install BlueZ to list Bluetooth devices",
        {
          cause: error,
        },
      );
    }

    throw error;
  }
}

async function main(): Promise<void> {
  console.log(`Scanning for ${SCAN_SECONDS} seconds...`);
  await bluetoothctl(["--timeout", String(SCAN_SECONDS), "scan", "le"]);

  const stdout = await bluetoothctl(["devices"]);
  const devices = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(DEVICE_PREFIX))
    .map((line) => line.slice(DEVICE_PREFIX.length));

  if (devices.length === 0) {
    console.log("No Bluetooth devices found.");

    return;
  }

  console.log(`\n${devices.length} device(s):`);
  for (const device of devices) {
    console.log(`  ${device}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
