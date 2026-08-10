import { chmod, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";

const TOOLS = ["downloader", "presence"];
const TOOL_FILES = ["install.sh", "uninstall.sh", ".env.schema"];

const root = import.meta.dirname;
const distDir = path.join(root, "dist");

async function copyScript(from: string, to: string): Promise<void> {
  await copyFile(from, to);
  await chmod(to, 0o755);
}

async function buildTool(tool: string): Promise<void> {
  const outDir = path.join(distDir, tool);

  await mkdir(outDir, { recursive: true });

  await build({
    entryPoints: [path.join(root, tool, "src", "index.ts")],
    outfile: path.join(outDir, "index.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    // 32-bit Raspberry Pi OS (armhf) tops out at Node 22.
    target: "node22",
  });

  for (const file of TOOL_FILES) {
    const target = path.join(outDir, file);

    if (file.endsWith(".sh")) {
      await copyScript(path.join(root, tool, file), target);
    } else {
      await copyFile(path.join(root, tool, file), target);
    }
  }
}

const sharedDir = path.join(distDir, "shared");

await mkdir(sharedDir, { recursive: true });
await copyScript(
  path.join(root, "shared", "systemd.sh"),
  path.join(sharedDir, "systemd.sh"),
);

for (const tool of TOOLS) {
  await buildTool(tool);
}
