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

import type { EnvField } from "../shared/env-schema.ts";

import { envFilePath } from "./env-file.ts";
import { tools, type ToolName } from "./tools.ts";

/**
 * Users shouldn't have to escape characters or add quotes around passwords themselves, so we add quotes.
 */
function quote(value: string): string {
  const mark = ["'", '"', "`"].find((candidate) => !value.includes(candidate));

  return mark === undefined ? value : `${mark}${value}${mark}`;
}

function renderField(field: EnvField, value: string | undefined): string {
  // Secrets tend to hold characters that only survive inside quotes.
  const rendered =
    value !== undefined && field.secret === true ? quote(value) : value;

  const assignment =
    rendered === undefined
      ? `# ${field.name}=${field.default ?? ""}`
      : `${field.name}=${rendered}`;

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

/** Combines a field's own rule with whether it may be left empty at all. */
function validator(field: EnvField, optional: boolean) {
  if (optional && field.validate === undefined) {
    return undefined;
  }

  return (value: string | undefined): string | undefined => {
    if (value === undefined || value.trim() === "") {
      return optional ? undefined : required(value);
    }

    return field.validate?.(value.trim());
  };
}

/** Required fields come first, fields that depend on another one last. */
function promptOrder(field: EnvField): number {
  if (field.requires !== undefined) {
    return 2;
  }

  return field.default === undefined ? 0 : 1;
}

function isAnswered(answers: NodeJS.Dict<string>, name: string): boolean {
  const answer = answers[name];

  return answer !== undefined && answer !== "";
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

  // Fields are asked in the order they can be answered in: required ones first,
  // then the optional ones and last those that only apply once another field
  // has a value.
  const fields = tools[tool].envSchema.toSorted(
    (a, b) => promptOrder(a) - promptOrder(b),
  );
  const inputs: string[] = [];
  const answers: NodeJS.Dict<string> = {};

  for (const field of fields) {
    // A masked prompt cannot be pre-filled, so an empty secret keeps what the file had.
    const current = existing[field.name];
    const keepable = field.secret === true ? current : undefined;
    const optional = field.default !== undefined || keepable !== undefined;
    const message = field.description;

    if (field.requires !== undefined && !isAnswered(answers, field.requires)) {
      inputs.push(renderField(field, undefined));
      continue;
    }

    const answer = await (field.secret === true
      ? password({
          message:
            keepable === undefined
              ? message
              : `${message} (leave empty to keep the current one)`,
          mask: "*",
          validate: validator(field, optional),
        })
      : text({
          message,
          initialValue: current,
          placeholder: field.default,
          validate: validator(field, optional),
        }));

    if (isCancel(answer)) {
      cancel("Nothing was written.");
      return;
    }

    const value = answer.trim();
    const resolved = value === "" ? keepable : value;

    answers[field.name] = resolved;
    inputs.push(renderField(field, resolved));
  }

  await writeFile(file, `${inputs.join("\n\n")}\n`, { mode: 0o600 });
  await chmod(file, 0o600);

  outro(`Wrote config. Run with: vigi-tools ${tool}`);
}
