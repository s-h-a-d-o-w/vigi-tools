import { envSchema as downloaderEnvSchema } from "../downloader/env-schema.ts";
import { envSchema as presenceEnvSchema } from "../presence/env-schema.ts";
import type { EnvField } from "../shared/env-schema.ts";

export const TOOLS = {
  downloader: {
    description: "syncs recordings from the camera into a local directory",
    envSchema: downloaderEnvSchema,
  },
  presence: {
    description:
      "turns motion detection off while a known device is on the network",
    envSchema: presenceEnvSchema,
  },
} satisfies Record<string, { description: string; envSchema: EnvField[] }>;

export type ToolName = keyof typeof TOOLS;

export function isToolName(value: string | undefined): value is ToolName {
  return value !== undefined && Object.hasOwn(TOOLS, value);
}
