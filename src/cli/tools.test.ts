import { describe, expect, it } from "vitest";

import { deviceEnvSchema } from "#shared/env-schema.ts";

import { isToolName, TOOLS } from "./tools.ts";

describe("tool registry", () => {
  it("describes every tool and reuses the shared device settings", () => {
    expect(Object.keys(TOOLS)).toStrictEqual(["downloader", "presence"]);

    for (const tool of Object.values(TOOLS)) {
      expect(tool.description).not.toBe("");
      expect(tool.envSchema).toStrictEqual(
        expect.arrayContaining(deviceEnvSchema),
      );
    }
  });
});

describe(isToolName, () => {
  it("accepts the name of a bundled tool", () => {
    expect(isToolName("downloader")).toBe(true);
    expect(isToolName("presence")).toBe(true);
  });

  it("rejects commands, missing arguments and inherited properties", () => {
    expect(isToolName("install")).not.toBe(true);
    expect(isToolName(undefined)).not.toBe(true);
    expect(isToolName("toString")).not.toBe(true);
  });
});
