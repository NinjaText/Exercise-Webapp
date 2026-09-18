#!/usr/bin/env node
// Counts raw Tailwind palette classes per file in app/ and components/, using
// the real ESLint rule (via the ESLint Node API) so the count is exact — not an
// approximation — and can never drift from what `npm run lint` reports.
//
// The per-file baseline is gone (spec §3.5 end state): the repo sits at zero, so
// this is now a plain regression guard — it exits non-zero if ANY raw palette
// class is reintroduced, and names the offending files.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../eslint-rules/no-raw-palette.mjs";
import { PALETTE_FILES, PALETTE_IGNORES } from "../eslint-rules/no-raw-palette.config.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");

const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: PALETTE_FILES,
      ignores: PALETTE_IGNORES,
      languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { design: { rules: { "no-raw-palette": rule } } },
      rules: {
        // Empty baseline: every raw-palette hit is reported, so the count per
        // file is exact.
        "design/no-raw-palette": ["error", { root: ROOT, baseline: {} }],
      },
    },
  ],
});

const results = await eslint.lintFiles(PALETTE_FILES);

const counts = {};
let total = 0;
for (const result of results) {
  const n = result.messages.filter((m) => m.ruleId === "design/no-raw-palette").length;
  if (n > 0) {
    const rel = path.relative(ROOT, result.filePath).split(path.sep).join("/");
    counts[rel] = n;
    total += n;
  }
}

console.log(`Raw palette classes: ${total} across ${Object.keys(counts).length} files`);

if (total > 0) {
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [f, n] of top) console.log(`  ${String(n).padStart(4)}  ${f}`);
  console.log(
    "\nRaw palette classes are not allowed (spec §3.5). Use a semantic token —\n" +
      "see lib/ui/status.ts and the role classes in app/globals.css."
  );
  process.exitCode = 1;
}
