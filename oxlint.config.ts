import sharedConfig from "@s-h-a-d-o-w/oxlint-config/lint.js";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [sharedConfig],
  env: {
    node: true,
    browser: true,
  },
});
