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

function requireRoot(command: string, tool: ToolName): void {
  if (process.getuid?.() !== 0) {
    throw new Error(`Run as root, e.g. sudo vigi-tools ${tool} ${command}`);
  }
}

/** npx caches are transient, so a service must not be pointed at one. */
function cliPath(): string {
  const file = fileURLToPath(import.meta.url);

  if (file.split(path.sep).includes("_npx")) {
    throw new Error(
      "A service cannot run from an npx cache. Install it first: sudo npm i -g vigi-tools",
    );
  }

  return file;
}

export function install(tool: ToolName): void {
  requireRoot("install", tool);

  const exec = cliPath();
  const envFile = envFilePath(tool);

  if (!existsSync(envFile)) {
    throw new Error(
      `Missing ${envFile} - run "vigi-tools ${tool} configure" here first`,
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
Restart=always
RestartSec=30
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
  requireRoot("uninstall", tool);

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
