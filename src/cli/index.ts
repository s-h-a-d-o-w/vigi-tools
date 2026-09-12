#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { requireBinaries } from "../shared/binaries.ts";

import { configure } from "./configure.ts";
import { loadEnvFile } from "./env-file.ts";
import { install, uninstall } from "./service.ts";
import { isToolName, tools, type ToolName } from "./tools.ts";

/** Works both from `src/cli` and from the built `dist/cli`. */
function version(): string {
  const packageJsonPath = path.join(
    import.meta.dirname,
    "..",
    "..",
    "package.json",
  );
  const packageJson: unknown = JSON.parse(
    readFileSync(packageJsonPath, "utf8"),
  );

  return (packageJson as { version: string }).version;
}

function usage(): string {
  const toolEntries = Object.entries(tools)
    .map(([name, tool]) => `  ${name.padEnd(12)}${tool.description}`)
    .join("\n");

  return `Usage: vigi-tools <tool> [command]

Tools:
${toolEntries}

Commands:
  (none)      run the tool in the foreground
  configure   write .env.shared and .env.<tool> in the current directory
  install     run the tool as a systemd service (asks for sudo)
  uninstall   stop and remove that service (asks for sudo)

Options:
  -h, --help     show this help
  -v, --version  show the version`;
}

async function runTool(tool: ToolName): Promise<void> {
  requireBinaries(tools[tool].requiredBinaries);
  loadEnvFile(tool);

  await tools[tool].run();
}

async function main(): Promise<void> {
  const [tool, command] = process.argv.slice(2);

  if (tool === "--version" || tool === "-v") {
    console.log(version());
    return;
  }

  if (tool === undefined || tool === "--help" || tool === "-h") {
    console.log(usage());
    return;
  }

  if (!isToolName(tool)) {
    throw new Error(`Unknown tool: ${tool}\n\n${usage()}`);
  }

  if (command === undefined) {
    await runTool(tool);
    return;
  }

  if (command === "configure") {
    await configure(tool);
  } else if (command === "install") {
    install(tool);
  } else if (command === "uninstall") {
    uninstall(tool);
  } else {
    throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
