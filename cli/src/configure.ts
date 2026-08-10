import { existsSync } from "node:fs";
import { chmod, writeFile } from "node:fs/promises";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

import type { EnvField } from "shared/env-schema.ts";

import { envFilePath } from "./env-file.ts";
import { TOOLS, type ToolName } from "./tools.ts";

function renderField(field: EnvField, value: string | undefined): string {
  const assignment =
    value === undefined
      ? `# ${field.name}=${field.default ?? ""}`
      : `${field.name}=${value}`;

  return `# ${field.description}\n${assignment}`;
}

export async function configure(tool: ToolName): Promise<void> {
  const file = envFilePath(tool);

  // Secrets are typed into a muted stream so they stay out of the scrollback.
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) {
        process.stdout.write(chunk);
      }

      callback();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });

  async function ask(query: string, secret = false): Promise<string> {
    if (!secret) {
      return (await rl.question(query)).trim();
    }

    process.stdout.write(query);
    muted = true;

    try {
      return (await rl.question("")).trim();
    } finally {
      muted = false;
      process.stdout.write("\n");
    }
  }

  try {
    if (
      existsSync(file) &&
      (await ask(`${file} exists. Overwrite? [y/N] `)).toLowerCase() !== "y"
    ) {
      console.log("Nothing was written.");
      return;
    }

    console.log(
      `\nConfiguring ${tool}. Press enter to accept the value in brackets.\n`,
    );

    const sections: string[] = [];

    for (const field of TOOLS[tool].envSchema) {
      const suffix = field.default === undefined ? "" : ` [${field.default}]`;
      let value = "";

      for (;;) {
        console.log(`# ${field.description}`);
        value = await ask(`${field.name}${suffix}: `, field.secret === true);

        if (value !== "" || field.default !== undefined) {
          break;
        }

        console.log("  This one is required.\n");
      }

      sections.push(renderField(field, value === "" ? undefined : value));
      console.log("");
    }

    await writeFile(file, `${sections.join("\n\n")}\n`, { mode: 0o600 });
    await chmod(file, 0o600);

    console.log(`Wrote ${file}`);
    console.log(`Start it with: vigi-tools ${tool}`);
  } finally {
    rl.close();
  }
}
