// Local ESLint rule: forbid raw Tailwind palette classes (bg-blue-500, text-amber-600, …)
// in favor of semantic tokens (bg-info-soft, text-warning-foreground, …).
// Spec: docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md §3.5
//
// Baseline: options[0].baseline is { "<path relative to root>": allowedCount }.
// A file with violations <= its allowed count passes. One more and every
// violation in that file is reported, so counts can only fall.

import path from "node:path";

const PREFIXES =
  "bg|text|border|ring-offset|ring|fill|stroke|from|to|via|outline|decoration|shadow|divide|placeholder|caret|inset-ring|inset-shadow|accent";
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const SHADE = "50|100|200|300|400|500|600|700|800|900|950";

export const RAW_CLASS = new RegExp(
  `^(?:${PREFIXES})(?:-[trblxyse])?-(?:${PALETTE})-(?:${SHADE})(?:\\/(?:\\d{1,3}|\\[[^\\]]+\\]))?!?$`
);

/** Strips variant prefixes: "hover:dark:bg-red-500" -> "bg-red-500". */
function baseClass(token) {
  const idx = token.lastIndexOf(":");
  return idx === -1 ? token : token.slice(idx + 1);
}

export function findRawClasses(text) {
  const hits = [];
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    if (RAW_CLASS.test(baseClass(token))) hits.push(token);
  }
  return hits;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow raw Tailwind palette classes; use semantic design tokens instead.",
    },
    schema: [
      {
        type: "object",
        properties: {
          root: { type: "string" },
          baseline: { type: "object", additionalProperties: { type: "integer" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      raw:
        'Raw palette class "{{cls}}". Use a semantic token (bg-info-soft, text-warning-foreground, bg-success, …) — see lib/ui/status.ts.',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const root = options.root ?? context.cwd;
    const baseline = options.baseline ?? {};
    const rel = path.relative(root, context.filename).split(path.sep).join("/");
    const allowed = baseline[rel] ?? 0;
    const pending = [];

    function collect(node, text) {
      for (const cls of findRawClasses(text)) pending.push({ node, cls });
    }

    return {
      Literal(node) {
        if (typeof node.value === "string" && node.value.includes("-")) {
          collect(node, node.value);
        }
      },
      TemplateElement(node) {
        const text = node.value.cooked ?? node.value.raw ?? "";
        if (text.includes("-")) collect(node, text);
      },
      "Program:exit"() {
        if (pending.length <= allowed) return;
        for (const { node, cls } of pending) {
          context.report({ node, messageId: "raw", data: { cls } });
        }
      },
    };
  },
};

export default rule;
