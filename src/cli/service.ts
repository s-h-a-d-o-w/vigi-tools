import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { envFilePath } from "./env-file.ts";
import type { ToolName } from "./tools.ts";

function unitName(tool: ToolName): string {
  return `vigi-${tool}.service`;
}

function unitPath(tool: ToolName): string {
  return `/etc/systemd/system/${unitName(tool)}`;
}

function systemctl(args: string[]): void {
  execFileSync("systemctl", args, { stdio: "inherit" });
}

/** The CLI entry next to this module - npx caches are transient, so not those. */
function cliPath(): string {
  const file = fileURLToPath(import.meta.url);

  if (file.split(path.sep).includes("_npx")) {
    throw new Error(
      "A service cannot run from an npx cache. Install it first: sudo npm i -g vigi-tools",
    );
  }

  return path.join(path.dirname(file), `index${path.extname(file)}`);
}

/**
 * sudo resets PATH, so `sudo vigi-tools ...` usually fails to find the CLI.
 * Re-running ourselves through absolute paths avoids that. sudo keeps the
 * working directory, so the tool still picks up the local .env file.
 */
function elevate(command: "install" | "uninstall", tool: ToolName): boolean {
  if (process.getuid?.() === 0) {
    return false;
  }

  console.log(`Elevating with sudo...`);

  try {
    execFileSync("sudo", [process.execPath, cliPath(), tool, command], {
      stdio: "inherit",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("sudo is not available", {
        cause: error,
      });
    }

    // The elevated run reported whatever went wrong itself.
    process.exitCode = 1;
  }

  return true;
}

export function install(tool: ToolName): void {
  if (elevate("install", tool)) {
    return;
  }

  const exec = cliPath();
  const missing = [envFilePath("shared"), envFilePath(tool)].find(
    (file) => !existsSync(file),
  );

  if (missing !== undefined) {
    throw new Error(
      `Missing ${missing} - run "vigi-tools ${tool} configure" here first`,
    );
  }

  // The service runs as the user who invoked sudo, not as root.
  const user = process.env["SUDO_USER"] ?? "root";
  const group = execFileSync("id", ["-gn", user], { encoding: "utf8" }).trim();

  writeFileSync(
    unitPath(tool),
    `[Unit]
Description=vigi-tools ${tool}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
Group=${group}
WorkingDirectory=${process.cwd()}
ExecStart="${process.execPath}" "${exec}" ${tool}
# No automatic restart: retrying a failing camera call can lock the account for
# ever longer periods.
Restart=no
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`,
    { mode: 0o644 },
  );

  systemctl(["daemon-reload"]);
  systemctl(["enable", "--now", unitName(tool)]);

  console.log(`Installed and started ${unitName(tool)}`);
  console.log(`Follow the logs with: journalctl -u vigi-${tool} -f`);
}

export function uninstall(tool: ToolName): void {
  if (elevate("uninstall", tool)) {
    return;
  }

  try {
    systemctl(["disable", "--now", unitName(tool)]);
  } catch {
    // Not installed - removing the unit file is still worth a try.
  }

  rmSync(unitPath(tool), { force: true });
  systemctl(["daemon-reload"]);
  systemctl(["reset-failed"]);

  console.log(`Removed ${unitName(tool)}`);
}
