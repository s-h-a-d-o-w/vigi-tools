import { envSchema as downloaderEnvSchema } from "../downloader/env-schema.ts";
import { envSchema as presenceEnvSchema } from "../presence/env-schema.ts";
import type { EnvField } from "../shared/env-schema.ts";

export const tools = {
  downloader: {
    description: "syncs recordings from the camera into a local directory",
    envSchema: downloaderEnvSchema,
    run: () => import("../downloader/index.ts"),
  },
  presence: {
    description:
      "turns motion detection off while a known BLE device is nearby",
    envSchema: presenceEnvSchema,
    run: () => import("../presence/index.ts"),
  },
} satisfies Record<
  string,
  { description: string; envSchema: EnvField[]; run: () => Promise<unknown> }
>;

export type ToolName = keyof typeof tools;

export function isToolName(value: string | undefined): value is ToolName {
  return value !== undefined && Object.hasOwn(tools, value);
}
