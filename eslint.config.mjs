import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { fileURLToPath } from "node:url";
import path from "node:path";
import noRawPalette from "./eslint-rules/no-raw-palette.mjs";
import { PALETTE_FILES, PALETTE_IGNORES } from "./eslint-rules/no-raw-palette.config.mjs";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git worktrees checked out under the repo must not be linted from the root.
    ".claude/**",
    "worktrees/**",
    "node_modules/**",
  ]),
  {
    files: PALETTE_FILES,
    ignores: PALETTE_IGNORES,
    plugins: { design: { rules: { "no-raw-palette": noRawPalette } } },
    rules: {
      "design/no-raw-palette": ["error", { root: configDir }],
    },
  },
]);

export default eslintConfig;
