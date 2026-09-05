import type { Configuration } from "lint-staged";

export default {
  "**/*.*{ts,js}": ["pnpm lint", () => "pnpm typecheck", () => "pnpm test"],
  "**/*": [
    "pnpm oxfmt --no-error-on-unmatched-pattern",
    () => "cross-env KNIP_DISABLE_RAW_TRANSFER=1 pnpm knip",
  ],
} satisfies Configuration;
