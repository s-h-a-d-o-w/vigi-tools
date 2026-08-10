import { existsSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

import {
  cancel,
  intro,
  isCancel,
  log,
  outro,
  password,
  text,
} from "@clack/prompts";

import type { EnvField } from "#shared/env-schema.ts";

import { envFilePath } from "./env-file.ts";
import { TOOLS, type ToolName } from "./tools.ts";

function renderField(field: EnvField, value: string | undefined): string {
  const assignment =
    value === undefined
      ? `# ${field.name}=${field.default ?? ""}`
      : `${field.name}=${value}`;

  return `# ${field.description}\n${assignment}`;
}

/** What a previous run wrote, so the prompts can start from those values. */
async function readExisting(file: string): Promise<NodeJS.Dict<string>> {
  if (!existsSync(file)) {
    return {};
  }

  return parseEnv(await readFile(file, "utf8"));
}

function required(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === ""
    ? "This one is required."
    : undefined;
}

export async function configure(tool: ToolName): Promise<void> {
  const file = envFilePath(tool);
  const existing = await readExisting(file);

  intro(`Creating .env.${tool}`);

  if (existsSync(file)) {
    log.warn(
      `${file} exists. Its values are filled in below and it will be overwritten.`,
    );
  }

  // Sort required fields first so the user is prompted for them before the optional ones.
  const fields = TOOLS[tool].envSchema.toSorted(
    (a, b) => Number(a.default !== undefined) - Number(b.default !== undefined),
  );
  const inputs: string[] = [];

  for (const field of fields) {
    // A masked prompt cannot be pre-filled, so an empty secret keeps what the file had.
    const current = existing[field.name];
    const keepable = field.secret === true ? current : undefined;
    const optional = field.default !== undefined || keepable !== undefined;
    const message = field.description;

    const answer = await (field.secret === true
      ? password({
          message:
            keepable === undefined
              ? message
              : `${message} (leave empty to keep the current one)`,
          mask: "*",
          validate: optional ? undefined : required,
        })
      : text({
          message,
          initialValue: current,
          placeholder: field.default,
          validate: optional ? undefined : required,
        }));

    if (isCancel(answer)) {
      cancel("Nothing was written.");
      return;
    }

    const value = answer.trim();

    inputs.push(renderField(field, value === "" ? keepable : value));
  }

  await writeFile(file, `${inputs.join("\n\n")}\n`, { mode: 0o600 });
  await chmod(file, 0o600);

  outro(`Wrote config. Run with: vigi-tools ${tool}`);
}
