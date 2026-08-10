import type { Configuration } from "lint-staged";

export default {
  "**/*.*{ts,js}": ["pnpm lint", () => "pnpm typecheck", () => "pnpm test"],
  "**/*": ["pnpm oxfmt --no-error-on-unmatched-pattern", () => "pnpm knip"],
} satisfies Configuration;
