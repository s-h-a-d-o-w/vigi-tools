import process from "node:process";

import type { EnvField } from "./env-schema.ts";

/**
 * Reads variables through a schema, so that defaults live in exactly one place
 * - the place that also documents them for `vigi-tools configure`.
 */
export function createEnvReader(schema: EnvField[]) {
  function read(name: string): string | undefined {
    const field = schema.find((entry) => entry.name === name);

    if (field === undefined) {
      throw new Error(`Environment variable ${name} is not part of the schema`);
    }

    const value = process.env[name] ?? field.default;

    if (value === undefined || value.trim() === "") {
      return undefined;
    }

    const problem = field.validate?.(value);

    if (problem !== undefined) {
      throw new Error(`Environment variable ${name} is invalid: ${problem}`);
    }

    return value;
  }

  function string(name: string): string {
    const value = read(name);

    if (value === undefined) {
      throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
  }

  function number(name: string): number {
    const raw = string(name);
    const value = Number(raw);

    if (!Number.isFinite(value)) {
      throw new TypeError(
        `Environment variable ${name} must be a number but was "${raw}"`,
      );
    }

    return value;
  }

  function boolean(name: string): boolean {
    return read(name) === "true";
  }

  /** Splits a comma-separated variable, dropping empty entries. */
  function list(name: string): string[] {
    const entries = string(name)
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");

    if (entries.length === 0) {
      throw new Error(
        `Environment variable ${name} must list at least one entry`,
      );
    }

    return entries;
  }

  return { boolean, list, number, optionalString: read, string };
}

export type EnvReader = ReturnType<typeof createEnvReader>;
