import process from "node:process";

import { configure } from "./configure.ts";
import { loadEnvFile } from "./env-file.ts";
import { install, uninstall } from "./service.ts";
import { isToolName, TOOLS, type ToolName } from "./tools.ts";

function usage(): string {
  const tools = Object.entries(TOOLS)
    .map(([name, tool]) => `  ${name.padEnd(12)}${tool.description}`)
    .join("\n");

  return `Usage: vigi-tools <tool|command> [tool]

Tools:
${tools}

Commands:
  <tool>                  run the tool in the foreground
  configure <tool>        write .env.<tool> in the current directory
  install <tool>          run the tool as a systemd service (needs sudo)
  uninstall <tool>        stop and remove that service (needs sudo)`;
}

async function runTool(tool: ToolName): Promise<void> {
  loadEnvFile(tool);

  // Bundled next to this file. The specifier stays dynamic so that the tools
  // are not pulled into the CLI bundle.
  await import(new URL(`${tool}/index.mjs`, import.meta.url).href);
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);

  if (command === undefined || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  if (isToolName(command)) {
    await runTool(command);
    return;
  }

  if (
    command !== "configure" &&
    command !== "install" &&
    command !== "uninstall"
  ) {
    throw new Error(`Unknown tool or command: ${command}\n\n${usage()}`);
  }

  if (!isToolName(argument)) {
    throw new Error(
      `${command} needs a tool: ${Object.keys(TOOLS).join(", ")}`,
    );
  }

  if (command === "configure") {
    await configure(argument);
  } else if (command === "install") {
    install(argument);
  } else {
    uninstall(argument);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
