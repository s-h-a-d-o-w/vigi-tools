import { chmod, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { build, type BuildOptions } from "esbuild";

const TOOLS = ["downloader", "presence"];

const root = import.meta.dirname;
const distDir = path.join(root, "dist");

const common: BuildOptions = {
  bundle: true,
  format: "esm",
  platform: "node",
  // 32-bit Raspberry Pi OS (armhf) tops out at Node 22.
  target: "node22",
};

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

// The CLI loads these at runtime, so each one stays a separate bundle.
for (const tool of TOOLS) {
  await build({
    ...common,
    entryPoints: [path.join(root, tool, "src", "index.ts")],
    outfile: path.join(distDir, tool, "index.mjs"),
  });
}

const cli = path.join(distDir, "cli.mjs");

await build({
  ...common,
  entryPoints: [path.join(root, "cli", "src", "index.ts")],
  outfile: cli,
  banner: { js: "#!/usr/bin/env node" },
});
await chmod(cli, 0o755);
