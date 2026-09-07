#!/usr/bin/env node

import process from "node:process";

import { configure } from "./configure.ts";
import { loadEnvFile } from "./env-file.ts";
import { install, uninstall } from "./service.ts";
import { isToolName, tools, type ToolName } from "./tools.ts";

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
  uninstall   stop and remove that service (asks for sudo)`;
}

async function runTool(tool: ToolName): Promise<void> {
  loadEnvFile(tool);

  await tools[tool].run();
}

async function main(): Promise<void> {
  const [tool, command] = process.argv.slice(2);

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
