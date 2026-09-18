import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../no-raw-palette.mjs";

// ESLint's RuleTester looks for global describe/it; vitest provides them (globals: true).
RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

tester.run("no-raw-palette", rule, {
  valid: [
    { code: `const a = "bg-info-soft text-warning-foreground";` },
    { code: `const a = "bg-primary text-muted-foreground border-border";` },
    { code: `const a = "hover:bg-muted dark:text-foreground";` },
    { code: `const a = "text-neutral-foreground";` },
    { code: `const a = "bg-neutral-soft";` },
    // exact count equal to baseline is allowed
    {
      code: `const a = "bg-blue-500";`,
      filename: "/repo/components/x.tsx",
      options: [{ root: "/repo", baseline: { "components/x.tsx": 1 } }],
    },
  ],
  invalid: [
    {
      code: `const a = "bg-blue-500";`,
      errors: [{ messageId: "raw", data: { cls: "bg-blue-500" } }],
    },
    {
      code: `const a = "hover:bg-emerald-50 text-amber-600/80";`,
      errors: [
        { messageId: "raw", data: { cls: "hover:bg-emerald-50" } },
        { messageId: "raw", data: { cls: "text-amber-600/80" } },
      ],
    },
    {
      code: "const a = cn(`border-red-200 ${x}`);",
      errors: [{ messageId: "raw", data: { cls: "border-red-200" } }],
    },
    {
      code: `<div className="bg-red-500" />;`,
      filename: "x.tsx",
      errors: [{ messageId: "raw", data: { cls: "bg-red-500" } }],
    },
    {
      code: `const a = "border-t-red-200";`,
      errors: [{ messageId: "raw", data: { cls: "border-t-red-200" } }],
    },
    {
      code: `const a = "hover:dark:text-red-700";`,
      errors: [{ messageId: "raw", data: { cls: "hover:dark:text-red-700" } }],
    },
    {
      code: `const a = "text-red-500!";`,
      errors: [{ messageId: "raw", data: { cls: "text-red-500!" } }],
    },
    {
      code: `const a = "bg-red-500/[0.5]";`,
      errors: [{ messageId: "raw", data: { cls: "bg-red-500/[0.5]" } }],
    },
    // one more than the baseline → every violation in the file is reported
    {
      code: `const a = "bg-blue-500 text-blue-700";`,
      filename: "/repo/components/x.tsx",
      options: [{ root: "/repo", baseline: { "components/x.tsx": 1 } }],
      errors: [
        { messageId: "raw", data: { cls: "bg-blue-500" } },
        { messageId: "raw", data: { cls: "text-blue-700" } },
      ],
    },
  ],
});
