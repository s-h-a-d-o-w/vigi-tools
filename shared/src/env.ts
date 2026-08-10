import process from "node:process";

export function requiredString(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `Environment variable ${name} must be a number but was "${raw}"`,
    );
  }

  return value;
}

/** Splits a comma-separated variable, dropping empty entries. */
export function requiredList(name: string): string[] {
  const entries = requiredString(name)
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
