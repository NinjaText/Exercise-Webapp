# UI Design System Foundation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the design-system foundation (semantic tokens, status mapping, raw-palette lint guard, shell breadcrumb, page template, and standard shared components) so every later page migration is consistent by construction.

**Architecture:** Tokens live in `app/globals.css` and are exposed as Tailwind colors via `@theme inline`. A single pure module `lib/ui/status.ts` maps every domain status string to one of six roles; `StatusBadge` and `StatCard` consume it. The platform shell gets a breadcrumb context that `PageHeader` registers into, replacing the header's hard-coded route title map. New shared components (`PageShell`, `PageHeader`, `PageToolbar`, `SectionCard`, `DataList`, `FormSection`) are thin wrappers over existing shadcn/base-ui primitives. A local ESLint rule with a per-file baseline stops new raw palette classes.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (oklch tokens), shadcn `base-nova` on `@base-ui/react`, lucide-react, Vitest 4 (node environment, `react-dom/server` for render tests), ESLint 9 flat config.

**Spec:** `docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md` (§3 Foundation, §4 Shell and page template, §5 Component standards, §7 Verification).

## Global Constraints

- **Never run `git add` or `git commit`.** The user reviews and commits every change themselves. Where a normal plan would commit, this plan says "Hand off for review".
- Status roles are exactly: `info`, `success`, `warning`, `danger`, `neutral`, `brand` (spec §3.1). `brand`, not `accent`, because shadcn already owns `--accent`.
- Content widths are exactly `narrow` (640px), `default` (1200px), `full` (spec §3.2).
- Lexend is used for `h1, h2` only (spec §3.3).
- Cards use `ring-1 ring-border`, no drop shadow; clickable cards add `hover:shadow-sm hover:ring-border-strong` (spec §3.4).
- One filled primary button per screen; tabs are always the `line` variant of `components/ui/tabs.tsx` (spec §4.3).
- Raw palette rule exceptions: `components/ui/**`, `app/page.tsx`, `app/about/**`, email templates (spec §3.5).
- Tests use Vitest with `environment: 'node'` and `globals: true` (see `vitest.config.ts`). Component tests render with `renderToStaticMarkup` from `react-dom/server`; do not add jsdom or testing-library. `.tsx` test files work as-is (tsconfig `jsx: react-jsx`).
- Verification commands: `npx tsc --noEmit` (currently clean), `npm run test`, `npm run lint`, `npm run lint:palette` (created in Task 2).
- Existing behavior of every page must be preserved. Phase 1 changes shared code and does mechanical wraps only; page-level redesigns are Phases 2–6.

---

## File map

| Path | Responsibility |
|---|---|
| `app/globals.css` (modify) | Add semantic role tokens, `--border-strong`, expose via `@theme inline`, narrow heading font rule |
| `lib/ui/status.ts` (create) | `StatusRole`, `statusRole()`, `statusLabel()`, `normalizeStatus()`, `ROLE_CLASSES` |
| `lib/ui/__tests__/status.test.ts` (create) | Mapping tests |
| `eslint-rules/no-raw-palette.js` (create) | ESLint rule with per-file baseline |
| `eslint-rules/no-raw-palette.baseline.json` (create, generated) | file → allowed count |
| `eslint-rules/__tests__/no-raw-palette.test.ts` (create) | RuleTester tests |
| `scripts/palette-baseline.mjs` (create) | `--report` prints totals, `--write` regenerates baseline |
| `eslint.config.mjs` (modify) | Register local plugin, ignore worktrees |
| `package.json` (modify) | `lint:palette` script |
| `components/shared/status-badge.tsx` (create) | `StatusBadge` |
| `components/shared/__tests__/status-badge.test.tsx` (create) | |
| `components/layout/breadcrumb-context.tsx` (create) | `BreadcrumbProvider`, `useBreadcrumb`, `BreadcrumbRegistrar`, `Crumb` type |
| `components/layout/header.tsx` (modify) | Remove title map, render breadcrumb |
| `components/layout/sidebar.tsx` (modify) | Settings group with children |
| `app/(platform)/layout.tsx` (modify) | Wrap in `BreadcrumbProvider` |
| `components/shared/page-shell.tsx` (create) | `PageShell` with width variants |
| `components/shared/page-header.tsx` (modify) | New props, breadcrumb registration, back link, tabs slot |
| `components/shared/page-toolbar.tsx` (create) | `PageToolbar` |
| `components/shared/__tests__/page-shell.test.tsx`, `page-header.test.tsx` (create) | |
| `components/shared/section-card.tsx` (create) | `SectionCard` |
| `components/shared/__tests__/section-card.test.tsx` (create) | |
| `components/shared/data-list.tsx` (create) | `DataList`; `data-table.tsx` becomes a re-export |
| `components/shared/__tests__/data-list.test.tsx` (create) | |
| `components/shared/empty-state.tsx` (modify) | `size="compact"`, `Link` |
| `components/shared/stat-card.tsx` (modify) | `role` prop replaces `iconClassName` |
| `components/programs/program-list-client.tsx` (modify lines 1857–1861) | Use `role` |
| `components/shared/form-section.tsx` (create) | `FormSection`, `FormField` |
| `lib/ui/clerk-appearance.ts` (create) | Clerk `appearance` mapped to tokens |
| `app/(platform)/settings/page.tsx` (modify) | Use `PageShell` + appearance |
| 20 `PageHeader` call sites (modify) | Wrap in `PageShell` with the width from the table in Task 6 |

---

### Task 1: Semantic tokens and status mapping

**Files:**
- Modify: `app/globals.css` (the `@theme inline` block at lines 7–52, `:root` at 54–91, `.dark` at 93–126, `@layer base` heading rule at ~137)
- Create: `lib/ui/status.ts`
- Test: `lib/ui/__tests__/status.test.ts`

**Interfaces:**
- Produces:
  - `type StatusRole = "info" | "success" | "warning" | "danger" | "neutral" | "brand"`
  - `statusRole(status: string | null | undefined): StatusRole` (unknown → `"neutral"`)
  - `statusLabel(status: string): string` (`"IN_PROGRESS"` → `"In progress"`)
  - `normalizeStatus(status: string): string` (`"onTrack"`, `"on track"`, `"on-track"` → `"ON_TRACK"`)
  - `ROLE_CLASSES: Record<StatusRole, { soft: string; text: string; dot: string; border: string }>`
  - Tailwind classes: `bg-{role}`, `bg-{role}-soft`, `text-{role}-foreground`, `border-{role}-border`, `ring-border-strong` for each role.

- [ ] **Step 1: Write the failing test**

Create `lib/ui/__tests__/status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  statusRole,
  statusLabel,
  normalizeStatus,
  ROLE_CLASSES,
  STATUS_ROLES,
} from "../status";

describe("normalizeStatus", () => {
  it("upper-snake-cases camelCase, spaces and dashes", () => {
    expect(normalizeStatus("onTrack")).toBe("ON_TRACK");
    expect(normalizeStatus("on track")).toBe("ON_TRACK");
    expect(normalizeStatus("on-track")).toBe("ON_TRACK");
    expect(normalizeStatus("IN_PROGRESS")).toBe("IN_PROGRESS");
  });
});

describe("statusRole", () => {
  it.each([
    ["SCHEDULED", "info"],
    ["IN_PROGRESS", "info"],
    ["DRAFT", "info"],
    ["STARTING_SOON", "info"],
    ["EARLY", "info"],
    ["COMPLETED", "success"],
    ["ACTIVE", "success"],
    ["ON_TRACK", "success"],
    ["ON_TIME", "success"],
    ["MISSED", "warning"],
    ["PAUSED", "warning"],
    ["ON_HOLD", "warning"],
    ["AT_RISK", "warning"],
    ["PAST_DUE", "warning"],
    ["TRIALING", "warning"],
    ["LATE", "warning"],
    ["ABANDONED", "danger"],
    ["OFF_TRACK", "danger"],
    ["CANCELED", "danger"],
    ["UNPAID", "danger"],
    ["SKIPPED", "neutral"],
    ["ARCHIVED", "neutral"],
    ["RESOURCE", "neutral"],
    ["TEMPLATE", "neutral"],
    ["INACTIVE", "neutral"],
    ["AI_GENERATED", "brand"],
    ["INSIGHT", "brand"],
    ["HIGH", "danger"],
    ["MEDIUM", "warning"],
    ["LOW", "success"],
  ])("maps %s to %s", (status, role) => {
    expect(statusRole(status)).toBe(role);
  });

  it("accepts camelCase and lower-case inputs", () => {
    expect(statusRole("offTrack")).toBe("danger");
    expect(statusRole("completed")).toBe("success");
  });

  it("falls back to neutral for unknown, null and undefined", () => {
    expect(statusRole("SOMETHING_NEW")).toBe("neutral");
    expect(statusRole(null)).toBe("neutral");
    expect(statusRole(undefined)).toBe("neutral");
  });
});

describe("statusLabel", () => {
  it("humanizes upper-snake status strings", () => {
    expect(statusLabel("IN_PROGRESS")).toBe("In progress");
    expect(statusLabel("COMPLETED")).toBe("Completed");
    expect(statusLabel("onTrack")).toBe("On track");
  });
});

describe("ROLE_CLASSES", () => {
  it("defines soft, text, dot and border classes for every role", () => {
    for (const role of STATUS_ROLES) {
      expect(ROLE_CLASSES[role].soft).toBe(`bg-${role}-soft`);
      expect(ROLE_CLASSES[role].text).toBe(`text-${role}-foreground`);
      expect(ROLE_CLASSES[role].dot).toBe(`bg-${role}`);
      expect(ROLE_CLASSES[role].border).toBe(`border-${role}-border`);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ui/__tests__/status.test.ts`
Expected: FAIL with "Failed to resolve import "../status"".

- [ ] **Step 3: Create `lib/ui/status.ts`**

```ts
/**
 * Single source of truth for mapping domain status strings to visual roles.
 * Every badge, dot, and stat color in the app derives from this file.
 * Spec: docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md §3.1
 */

export const STATUS_ROLES = [
  "info",
  "success",
  "warning",
  "danger",
  "neutral",
  "brand",
] as const;

export type StatusRole = (typeof STATUS_ROLES)[number];

const ROLE_BY_STATUS: Record<string, StatusRole> = {
  // Sessions / calendar day states
  SCHEDULED: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  MISSED: "warning",
  SKIPPED: "neutral",
  ABANDONED: "danger",

  // Plan / program lifecycle (PlanStatus + derived assigned-program states)
  DRAFT: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  ARCHIVED: "neutral",
  ON_HOLD: "warning",
  STARTING_SOON: "info",

  // Subscription (SubStatus)
  TRIALING: "warning",
  PAST_DUE: "warning",
  CANCELED: "danger",
  UNPAID: "danger",

  // Client progress buckets (dashboard-insights.service)
  ON_TRACK: "success",
  AT_RISK: "warning",
  OFF_TRACK: "danger",

  // Schedule variance (adherence page)
  ON_TIME: "success",
  EARLY: "info",
  LATE: "warning",

  // Program type and flags
  RESOURCE: "neutral",
  TEMPLATE: "neutral",
  INACTIVE: "neutral",
  AI_GENERATED: "brand",
  INSIGHT: "brand",

  // Priority (todays-priorities-card)
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "success",
};

/** "onTrack" | "on track" | "on-track" -> "ON_TRACK" */
export function normalizeStatus(status: string): string {
  return status
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

export function statusRole(status: string | null | undefined): StatusRole {
  if (!status) return "neutral";
  return ROLE_BY_STATUS[normalizeStatus(status)] ?? "neutral";
}

/** "IN_PROGRESS" -> "In progress" */
export function statusLabel(status: string): string {
  const words = normalizeStatus(status).toLowerCase().split("_");
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export const ROLE_CLASSES: Record<
  StatusRole,
  { soft: string; text: string; dot: string; border: string }
> = {
  info: { soft: "bg-info-soft", text: "text-info-foreground", dot: "bg-info", border: "border-info-border" },
  success: { soft: "bg-success-soft", text: "text-success-foreground", dot: "bg-success", border: "border-success-border" },
  warning: { soft: "bg-warning-soft", text: "text-warning-foreground", dot: "bg-warning", border: "border-warning-border" },
  danger: { soft: "bg-danger-soft", text: "text-danger-foreground", dot: "bg-danger", border: "border-danger-border" },
  neutral: { soft: "bg-neutral-soft", text: "text-neutral-foreground", dot: "bg-neutral", border: "border-neutral-border" },
  brand: { soft: "bg-brand-soft", text: "text-brand-foreground", dot: "bg-brand", border: "border-brand-border" },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/ui/__tests__/status.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Add the CSS tokens**

In `app/globals.css`, inside the `@theme inline { ... }` block, add after the `--color-success: var(--success);` line:

```css
  --color-success-foreground: var(--success-foreground);
  --color-success-soft: var(--success-soft);
  --color-success-border: var(--success-border);
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);
  --color-info-soft: var(--info-soft);
  --color-info-border: var(--info-border);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-warning-soft: var(--warning-soft);
  --color-warning-border: var(--warning-border);
  --color-danger: var(--danger);
  --color-danger-foreground: var(--danger-foreground);
  --color-danger-soft: var(--danger-soft);
  --color-danger-border: var(--danger-border);
  --color-neutral: var(--neutral);
  --color-neutral-foreground: var(--neutral-foreground);
  --color-neutral-soft: var(--neutral-soft);
  --color-neutral-border: var(--neutral-border);
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
  --color-brand-soft: var(--brand-soft);
  --color-brand-border: var(--brand-border);
  --color-border-strong: var(--border-strong);
```

In `:root { ... }`, add after the `--success: oklch(0.58 0.14 190);` line:

```css
  --success-foreground: oklch(0.36 0.09 190);
  --success-soft: oklch(0.95 0.035 190);
  --success-border: oklch(0.86 0.07 190);
  --info: oklch(0.55 0.18 250);
  --info-foreground: oklch(0.38 0.15 250);
  --info-soft: oklch(0.95 0.03 250);
  --info-border: oklch(0.87 0.06 250);
  --warning: oklch(0.75 0.16 75);
  --warning-foreground: oklch(0.46 0.12 65);
  --warning-soft: oklch(0.965 0.04 85);
  --warning-border: oklch(0.88 0.08 80);
  --danger: oklch(0.58 0.22 27);
  --danger-foreground: oklch(0.44 0.18 27);
  --danger-soft: oklch(0.96 0.025 27);
  --danger-border: oklch(0.88 0.06 27);
  --neutral: oklch(0.6 0.02 264);
  --neutral-foreground: oklch(0.4 0.03 264);
  --neutral-soft: oklch(0.955 0.005 264);
  --neutral-border: oklch(0.9 0.01 264);
  --brand: oklch(0.47 0.19 264);
  --brand-foreground: oklch(0.36 0.15 264);
  --brand-soft: oklch(0.95 0.03 264);
  --brand-border: oklch(0.87 0.06 264);
  --border-strong: oklch(0.84 0.015 264);
```

In `.dark { ... }`, add after the `--success: oklch(0.7 0.14 190);` line:

```css
  --success-foreground: oklch(0.85 0.1 190);
  --success-soft: oklch(0.7 0.14 190 / 14%);
  --success-border: oklch(0.7 0.14 190 / 32%);
  --info: oklch(0.7 0.15 250);
  --info-foreground: oklch(0.86 0.09 250);
  --info-soft: oklch(0.7 0.15 250 / 14%);
  --info-border: oklch(0.7 0.15 250 / 32%);
  --warning: oklch(0.8 0.15 80);
  --warning-foreground: oklch(0.9 0.1 85);
  --warning-soft: oklch(0.8 0.15 80 / 14%);
  --warning-border: oklch(0.8 0.15 80 / 32%);
  --danger: oklch(0.704 0.191 22.216);
  --danger-foreground: oklch(0.86 0.1 25);
  --danger-soft: oklch(0.704 0.191 22.216 / 14%);
  --danger-border: oklch(0.704 0.191 22.216 / 32%);
  --neutral: oklch(0.65 0.02 264);
  --neutral-foreground: oklch(0.82 0.02 264);
  --neutral-soft: oklch(1 0 0 / 7%);
  --neutral-border: oklch(1 0 0 / 14%);
  --brand: oklch(0.65 0.15 264);
  --brand-foreground: oklch(0.86 0.09 264);
  --brand-soft: oklch(0.65 0.15 264 / 14%);
  --brand-border: oklch(0.65 0.15 264 / 32%);
  --border-strong: oklch(1 0 0 / 18%);
```

- [ ] **Step 6: Narrow the heading font rule**

In `app/globals.css` `@layer base`, replace:

```css
  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-lexend), var(--font-inter), sans-serif;
  }
```

with:

```css
  /* Lexend is reserved for page and section titles; everything else is Inter. */
  h1, h2 {
    font-family: var(--font-lexend), var(--font-inter), sans-serif;
  }
```

- [ ] **Step 7: Verify the build sees the tokens**

Run: `npx tsc --noEmit && npx vitest run lib/ui`
Expected: tsc clean, tests pass.

Then, with the dev server running on port 3000, open `http://localhost:3000/dashboard` in Chrome and confirm the page still renders (no CSS parse error). No visual change is expected yet.

- [ ] **Step 8: Hand off for review**

Report the files changed. Do not commit.

---

### Task 2: Raw-palette ESLint rule with baseline

**Files:**
- Create: `eslint-rules/no-raw-palette.js`
- Create: `eslint-rules/__tests__/no-raw-palette.test.ts`
- Create: `scripts/palette-baseline.mjs`
- Create (generated): `eslint-rules/no-raw-palette.baseline.json`
- Modify: `eslint.config.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `npm run lint:palette` prints `Raw palette classes: <total> across <n> files` and exits 0. `npm run lint:palette -- --write` regenerates the baseline. `npm run lint` fails only if a file exceeds its baseline count.

- [ ] **Step 1: Write the failing RuleTester test**

Create `eslint-rules/__tests__/no-raw-palette.test.ts`:

```ts
import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../no-raw-palette.js";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run eslint-rules`
Expected: FAIL with "Failed to resolve import "../no-raw-palette.js"".

- [ ] **Step 3: Create the rule**

Create `eslint-rules/no-raw-palette.js`:

```js
// Local ESLint rule: forbid raw Tailwind palette classes (bg-blue-500, text-amber-600, …)
// in favor of semantic tokens (bg-info-soft, text-warning-foreground, …).
// Spec: docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md §3.5
//
// Baseline: options[0].baseline is { "<path relative to root>": allowedCount }.
// A file with violations <= its allowed count passes. One more and every
// violation in that file is reported, so counts can only fall.

import path from "node:path";

const PREFIXES =
  "bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|divide|placeholder|caret";
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const SHADE = "50|100|200|300|400|500|600|700|800|900|950";

export const RAW_CLASS = new RegExp(
  `^(?:${PREFIXES})(?:-[trblxyse])?-(?:${PALETTE})-(?:${SHADE})(?:\\/\\d{1,3})?$`
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run eslint-rules`
Expected: PASS (4 valid, 4 invalid).

- [ ] **Step 5: Create the baseline script**

Create `scripts/palette-baseline.mjs`:

```js
#!/usr/bin/env node
// Counts raw Tailwind palette classes per file in app/ and components/.
//   node scripts/palette-baseline.mjs --report   → print totals (default)
//   node scripts/palette-baseline.mjs --write    → regenerate eslint-rules/no-raw-palette.baseline.json
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";
import { findRawClasses } from "../eslint-rules/no-raw-palette.js";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "eslint-rules/no-raw-palette.baseline.json");

const EXCLUDE = [
  /^components\/ui\//,
  /^app\/page\.tsx$/,
  /^app\/about\//,
  /^components\/emails?\//,
  /\/__tests__\//,
  /\.test\.tsx?$/,
];

const files = globSync(["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"], { cwd: ROOT })
  .map((f) => f.split(path.sep).join("/"))
  .filter((f) => !EXCLUDE.some((re) => re.test(f)))
  .sort();

// Approximate the rule: scan every string / template literal chunk.
const STRING_RE = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`/g;

const counts = {};
let total = 0;
for (const file of files) {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  let n = 0;
  for (const m of src.match(STRING_RE) ?? []) n += findRawClasses(m.slice(1, -1)).length;
  if (n > 0) {
    counts[file] = n;
    total += n;
  }
}

const write = process.argv.includes("--write");
if (write) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + "\n");
  console.log(`Wrote baseline for ${Object.keys(counts).length} files (${total} classes).`);
} else {
  let previous = null;
  try {
    previous = JSON.parse(readFileSync(BASELINE, "utf8"));
  } catch {}
  const prevTotal = previous ? Object.values(previous).reduce((a, b) => a + b, 0) : null;
  console.log(`Raw palette classes: ${total} across ${Object.keys(counts).length} files`);
  if (prevTotal !== null) console.log(`Baseline total: ${prevTotal} (${total - prevTotal >= 0 ? "+" : ""}${total - prevTotal})`);
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [f, n] of top) console.log(`  ${String(n).padStart(4)}  ${f}`);
}
```

Note: `globSync` from `node:fs` requires Node 22+. Check with `node --version`; if lower than 22, replace the import with `import { globSync } from "glob";` after `npm i -D glob`.

- [ ] **Step 6: Add the npm script and generate the baseline**

In `package.json` scripts, add:

```json
    "lint:palette": "node scripts/palette-baseline.mjs",
```

Run: `npm run lint:palette -- --write`
Expected: `Wrote baseline for N files (~900+ classes).` and `eslint-rules/no-raw-palette.baseline.json` exists.

Run: `npm run lint:palette`
Expected: prints total and top 10 files; `app/page.tsx` must NOT appear (excluded).

- [ ] **Step 7: Wire the rule into ESLint and fix the worktree noise**

Replace `eslint.config.mjs` with:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { readFileSync } from "node:fs";
import noRawPalette from "./eslint-rules/no-raw-palette.js";

const paletteBaseline = JSON.parse(
  readFileSync(new URL("./eslint-rules/no-raw-palette.baseline.json", import.meta.url), "utf8")
);

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
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: [
      "components/ui/**",
      "app/page.tsx",
      "app/about/**",
      "components/emails/**",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
    ],
    plugins: { design: { rules: { "no-raw-palette": noRawPalette } } },
    rules: {
      "design/no-raw-palette": ["error", { root: process.cwd(), baseline: paletteBaseline }],
    },
  },
]);

export default eslintConfig;
```

- [ ] **Step 8: Verify lint passes with the baseline and fails above it**

Run: `npm run lint 2>&1 | tail -5`
Expected: no `design/no-raw-palette` errors. The total problem count should be dramatically lower than the ~46,000 seen before because worktrees are ignored. Record the remaining error count in the hand-off note; pre-existing non-palette errors are out of scope.

Then prove the guard bites: append `const __probe = "bg-emerald-500";` to `components/shared/page-header.tsx`, run `npx eslint components/shared/page-header.tsx`, expect one `design/no-raw-palette` error, then remove the probe line.

- [ ] **Step 9: Hand off for review**

Report: baseline total, remaining lint error count, and that the probe check passed. Do not commit.

---

### Task 3: StatusBadge

**Files:**
- Create: `components/shared/status-badge.tsx`
- Test: `components/shared/__tests__/status-badge.test.tsx`

**Interfaces:**
- Consumes: `statusRole`, `statusLabel`, `ROLE_CLASSES`, `StatusRole` from `lib/ui/status.ts`.
- Produces:
  ```ts
  interface StatusBadgeProps {
    status: string;            // domain string, e.g. "COMPLETED", "onTrack"
    label?: string;            // overrides statusLabel(status)
    role?: StatusRole;         // overrides statusRole(status)
    dot?: boolean;             // default true
    size?: "sm" | "default";   // default "default"
    className?: string;
  }
  function StatusBadge(props: StatusBadgeProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `components/shared/__tests__/status-badge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "../status-badge";

describe("StatusBadge", () => {
  it("renders a humanized label and success role classes for COMPLETED", () => {
    const html = renderToStaticMarkup(<StatusBadge status="COMPLETED" />);
    expect(html).toContain("Completed");
    expect(html).toContain("bg-success-soft");
    expect(html).toContain("text-success-foreground");
    expect(html).toContain("bg-success"); // the dot
    expect(html).toContain('data-role="success"');
  });

  it("uses the label override and role override", () => {
    const html = renderToStaticMarkup(
      <StatusBadge status="RESOURCE" label="On demand" role="brand" />
    );
    expect(html).toContain("On demand");
    expect(html).toContain('data-role="brand"');
    expect(html).not.toContain("Resource");
  });

  it("omits the dot when dot={false}", () => {
    const html = renderToStaticMarkup(<StatusBadge status="MISSED" dot={false} />);
    expect(html).not.toContain('data-slot="status-dot"');
  });

  it("falls back to neutral for unknown statuses", () => {
    const html = renderToStaticMarkup(<StatusBadge status="WHATEVER" />);
    expect(html).toContain('data-role="neutral"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/shared/__tests__/status-badge.test.tsx`
Expected: FAIL, cannot resolve `../status-badge`.

- [ ] **Step 3: Create the component**

Create `components/shared/status-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";
import {
  ROLE_CLASSES,
  statusLabel,
  statusRole,
  type StatusRole,
} from "@/lib/ui/status";

export interface StatusBadgeProps {
  /** Domain status string, e.g. "COMPLETED", "IN_PROGRESS", "onTrack". */
  status: string;
  /** Overrides the humanized label derived from `status`. */
  label?: string;
  /** Overrides the role derived from `status`. */
  role?: StatusRole;
  /** Show the leading colored dot. Defaults to true. */
  dot?: boolean;
  size?: "sm" | "default";
  className?: string;
}

/**
 * The one status chip. Colors come from lib/ui/status.ts, never from callers.
 */
export function StatusBadge({
  status,
  label,
  role,
  dot = true,
  size = "default",
  className,
}: StatusBadgeProps) {
  const resolvedRole = role ?? statusRole(status);
  const classes = ROLE_CLASSES[resolvedRole];

  return (
    <span
      data-slot="status-badge"
      data-role={resolvedRole}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs",
        classes.soft,
        classes.text,
        classes.border,
        className
      )}
    >
      {dot && (
        <span
          data-slot="status-dot"
          aria-hidden
          className={cn("size-1.5 rounded-full", classes.dot)}
        />
      )}
      {label ?? statusLabel(status)}
    </span>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/shared/__tests__/status-badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Replace the two simplest hand-rolled status maps**

In `app/(platform)/clients/[id]/adherence/page.tsx`: delete the `statusColors` object (lines 21–27) and replace the `<Badge className={\`border-0 text-xs font-medium ${statusColors[session.status] ?? ...}\`}>...</Badge>` at ~line 143–147 with:

```tsx
<StatusBadge status={session.status} size="sm" />
```

Add `import { StatusBadge } from "@/components/shared/status-badge";` and remove the now-unused `Badge` import if nothing else uses it. Leave `varianceColors` for Phase 2 unless it is equally trivial (if so, replace with `<StatusBadge status={variance} size="sm" dot={false} />`).

In `components/dashboard/week-workout-client-row.tsx`: replace the `statusStyles` record (lines ~11–16) usage with `<StatusBadge status={status} size="sm" />` where that record was applied to a `Badge`. Keep `dayDotStyles` unchanged for now (it is a dot strip, not a badge).

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run components/shared && npm run lint:palette`
Expected: clean; palette total lower than Task 2's baseline total.

Open `http://localhost:3000/dashboard` and `http://localhost:3000/clients/69ce60e9e6457b10834536f4/adherence` in Chrome; badges render with a dot and soft background.

- [ ] **Step 7: Hand off for review**

Do not commit.

---

### Task 4: Breadcrumb context and header rewrite

**Files:**
- Create: `components/layout/breadcrumb-context.tsx`
- Modify: `components/layout/header.tsx` (remove `getPageTitle` and the title block, lines 19–61 and 91–98)
- Modify: `app/(platform)/layout.tsx` (wrap tree in `BreadcrumbProvider`)
- Test: `components/layout/__tests__/breadcrumb.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  type Crumb = { label: string; href?: string };
  function BreadcrumbProvider({ children }): JSX.Element                 // client
  function useBreadcrumb(): { crumbs: Crumb[]; setCrumbs: (c: Crumb[]) => void }
  function BreadcrumbRegistrar({ crumbs }: { crumbs: Crumb[] }): null   // client; registers on mount, clears on unmount
  function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }): JSX.Element     // presentational, SSR-safe
  ```
- Header behavior: renders `<Breadcrumbs crumbs={crumbs} />` when crumbs exist; otherwise renders the brand `INMOTUS RX` only on `lg:hidden` (mobile, where the sidebar is hidden). No route→title map remains.

- [ ] **Step 1: Write the failing test**

Create `components/layout/__tests__/breadcrumb.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Breadcrumbs } from "../breadcrumb-context";

describe("Breadcrumbs", () => {
  it("links every crumb except the last, which is the current page", () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs crumbs={[{ label: "Clients", href: "/clients" }, { label: "Yahya Shah" }]} />
    );
    expect(html).toContain('href="/clients"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Yahya Shah");
    // The current page is not a link
    expect(html).not.toMatch(/<a[^>]*>Yahya Shah<\/a>/);
  });

  it("renders a single crumb as the current page with no separator", () => {
    const html = renderToStaticMarkup(<Breadcrumbs crumbs={[{ label: "Dashboard" }]} />);
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('data-slot="crumb-separator"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/layout`
Expected: FAIL, cannot resolve `../breadcrumb-context`.

- [ ] **Step 3: Create the context module**

Create `components/layout/breadcrumb-context.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

type Ctx = { crumbs: Crumb[]; setCrumbs: (crumbs: Crumb[]) => void };

const BreadcrumbContext = React.createContext<Ctx | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = React.useState<Crumb[]>([]);
  const value = React.useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumb(): Ctx {
  const ctx = React.useContext(BreadcrumbContext);
  if (!ctx) {
    // Outside the platform shell (marketing, onboarding) there is no header to feed.
    return { crumbs: [], setCrumbs: () => {} };
  }
  return ctx;
}

/**
 * Rendered by PageHeader (a server component) to push its crumbs into the
 * client-side header. Registers on mount, clears on unmount so a page that
 * has no PageHeader shows nothing stale.
 */
export function BreadcrumbRegistrar({ crumbs }: { crumbs: Crumb[] }) {
  const { setCrumbs } = useBreadcrumb();
  const key = JSON.stringify(crumbs);
  React.useEffect(() => {
    setCrumbs(crumbs);
    return () => setCrumbs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setCrumbs]);
  return null;
}

export function Breadcrumbs({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("flex min-w-0 items-center gap-1.5 text-sm", className)}>
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <React.Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && (
              <ChevronRight
                data-slot="crumb-separator"
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground/50"
              />
            )}
            {last || !crumb.href ? (
              <span
                aria-current={last ? "page" : undefined}
                className={cn("truncate", last ? "font-semibold text-foreground" : "text-muted-foreground")}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/layout`
Expected: PASS.

- [ ] **Step 5: Rewrite the header**

In `components/layout/header.tsx`:

1. Delete the whole `getPageTitle` function (lines 19–61).
2. Replace the imports `import { usePathname } from "next/navigation";` — keep it (still used for the mobile sidebar `currentPath`). Add:
   ```tsx
   import { Breadcrumbs, useBreadcrumb } from "./breadcrumb-context";
   ```
3. In the component body, replace `const pageTitle = getPageTitle(pathname);` with `const { crumbs } = useBreadcrumb();`.
4. Replace the "Breadcrumb-style page title" block:
   ```tsx
   <div className="flex items-center gap-2">
     <span className="hidden text-sm font-semibold text-primary sm:inline-block">INMOTUS RX</span>
     <span className="hidden text-muted-foreground/40 sm:inline-block">/</span>
     <h1 className="text-sm font-semibold sm:text-base">{pageTitle}</h1>
   </div>
   ```
   with:
   ```tsx
   <div className="flex min-w-0 flex-1 items-center">
     {crumbs.length > 0 ? (
       <Breadcrumbs crumbs={crumbs} />
     ) : (
       <span className="text-sm font-semibold tracking-tight lg:hidden">INMOTUS RX</span>
     )}
   </div>
   ```
5. Remove the now-redundant `<div className="flex-1" />` spacer that followed it (the breadcrumb container is `flex-1`).

- [ ] **Step 6: Provide the context in the platform layout**

In `app/(platform)/layout.tsx`, add `import { BreadcrumbProvider } from "@/components/layout/breadcrumb-context";` and wrap the returned tree:

```tsx
  return (
    <SearchProvider>
      <BreadcrumbProvider>
        <div className="flex h-dvh overflow-hidden bg-[oklch(0.97_0.005_247)]">
          {/* ...existing Sidebar, Header, main, CommandPalette unchanged... */}
        </div>
      </BreadcrumbProvider>
    </SearchProvider>
  );
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npx vitest run components/layout`
Expected: clean.

In Chrome, load `http://localhost:3000/dashboard`. The top bar shows no "INMOTUS RX / Dashboard" text (nothing on the left at desktop width, since no PageHeader registers yet). Load `/nutrition` and `/analytics`: no stray "INMOTUS RX" title. This is expected until Task 5 makes `PageHeader` register crumbs.

- [ ] **Step 8: Hand off for review**

Do not commit.

---

### Task 5: PageShell, PageHeader rework, PageToolbar

**Files:**
- Create: `components/shared/page-shell.tsx`
- Modify: `components/shared/page-header.tsx` (full rewrite, keeping `title`, `description`, `action`, `className` working)
- Create: `components/shared/page-toolbar.tsx`
- Test: `components/shared/__tests__/page-shell.test.tsx`, `components/shared/__tests__/page-header.test.tsx`

**Interfaces:**
- Consumes: `BreadcrumbRegistrar`, `Crumb` from `components/layout/breadcrumb-context.tsx`; `Button`, `DropdownMenu*` from `components/ui`.
- Produces:
  ```ts
  type PageWidth = "narrow" | "default" | "full";
  const PAGE_WIDTH_CLASS: Record<PageWidth, string>;   // narrow: "max-w-[640px]", default: "max-w-[1200px]", full: "max-w-none"
  function PageShell({ width = "default", className, children }): JSX.Element

  interface PageHeaderAction { label: string; href?: string; onSelect?: () => void; icon?: LucideIcon; destructive?: boolean }
  interface PageHeaderProps {
    title: string;
    description?: string;
    breadcrumb?: Crumb[];            // defaults to [{ label: title }]
    back?: { label: string; href: string };
    primaryAction?: React.ReactNode; // exactly one filled button (caller renders <Button>)
    secondaryActions?: React.ReactNode;
    overflow?: PageHeaderAction[];   // rendered as a "More" dropdown
    tabs?: React.ReactNode;          // <Tabs> whose <TabsList variant="line"> sits flush under the header
    /** @deprecated legacy slot; treated as primaryAction */
    action?: React.ReactNode;
    className?: string;
  }
  function PageHeader(props: PageHeaderProps): JSX.Element
  function PageToolbar({ children, end, className }): JSX.Element   // one 36px row; `end` is right-aligned
  ```

- [ ] **Step 1: Write the failing tests**

Create `components/shared/__tests__/page-shell.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageShell, PAGE_WIDTH_CLASS } from "../page-shell";

describe("PageShell", () => {
  it("defaults to the default width and centers content", () => {
    const html = renderToStaticMarkup(<PageShell>x</PageShell>);
    expect(html).toContain("max-w-[1200px]");
    expect(html).toContain("mx-auto");
    expect(html).toContain('data-width="default"');
  });

  it("applies narrow and full widths", () => {
    expect(renderToStaticMarkup(<PageShell width="narrow">x</PageShell>)).toContain("max-w-[640px]");
    expect(renderToStaticMarkup(<PageShell width="full">x</PageShell>)).toContain("max-w-none");
  });

  it("exposes exactly three widths", () => {
    expect(Object.keys(PAGE_WIDTH_CLASS).sort()).toEqual(["default", "full", "narrow"]);
  });
});
```

Create `components/shared/__tests__/page-header.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "../page-header";
import { Button } from "@/components/ui/button";

describe("PageHeader", () => {
  it("renders title, description and a back link", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Edit Program"
        description="Modify the program"
        back={{ label: "Back to Program", href: "/programs/1" }}
      />
    );
    expect(html).toContain("<h1");
    expect(html).toContain("Edit Program");
    expect(html).toContain("Modify the program");
    expect(html).toContain('href="/programs/1"');
    expect(html).toContain("Back to Program");
  });

  it("puts primaryAction and secondaryActions in the actions slot", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Clients"
        primaryAction={<Button>Invite Client</Button>}
        secondaryActions={<Button variant="outline">Export</Button>}
      />
    );
    expect(html).toContain('data-slot="page-header-actions"');
    expect(html).toContain("Invite Client");
    expect(html).toContain("Export");
  });

  it("treats the legacy `action` prop as the primary action", () => {
    const html = renderToStaticMarkup(<PageHeader title="Clients" action={<Button>Add</Button>} />);
    expect(html).toContain('data-slot="page-header-actions"');
    expect(html).toContain("Add");
  });

  it("renders an overflow trigger when overflow items are given", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Client" overflow={[{ label: "Archive", href: "/x" }]} />
    );
    expect(html).toContain('data-slot="page-header-overflow"');
  });

  it("renders the tabs slot under the header", () => {
    const html = renderToStaticMarkup(<PageHeader title="Programs" tabs={<div>TABS</div>} />);
    expect(html).toContain('data-slot="page-header-tabs"');
    expect(html).toContain("TABS");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/shared/__tests__/page-shell.test.tsx components/shared/__tests__/page-header.test.tsx`
Expected: page-shell FAIL (module missing); page-header FAIL (no `back`/`primaryAction` output, no `data-slot` attributes).

- [ ] **Step 3: Create `components/shared/page-shell.tsx`**

```tsx
import { cn } from "@/lib/utils";

export type PageWidth = "narrow" | "default" | "full";

/** Spec §3.2: three widths, chosen per page, never per component. */
export const PAGE_WIDTH_CLASS: Record<PageWidth, string> = {
  narrow: "max-w-[640px]",
  default: "max-w-[1200px]",
  full: "max-w-none",
};

interface PageShellProps {
  width?: PageWidth;
  className?: string;
  children: React.ReactNode;
}

/**
 * Root wrapper for every platform page. Owns the content width and the
 * vertical rhythm between header, toolbar and content (24px).
 * The outer <main> in app/(platform)/layout.tsx owns the page gutter.
 */
export function PageShell({ width = "default", className, children }: PageShellProps) {
  return (
    <div
      data-slot="page-shell"
      data-width={width}
      className={cn("mx-auto flex w-full flex-col gap-6", PAGE_WIDTH_CLASS[width], className)}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `components/shared/page-header.tsx`**

```tsx
import Link from "next/link";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BreadcrumbRegistrar, type Crumb } from "@/components/layout/breadcrumb-context";

export interface PageHeaderAction {
  label: string;
  href?: string;
  onSelect?: () => void;
  icon?: LucideIcon;
  destructive?: boolean;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Shown in the top bar. Defaults to a single crumb with the title. */
  breadcrumb?: Crumb[];
  /** Small "← Back to X" link above the title. */
  back?: { label: string; href: string };
  /** Exactly one filled button per screen. */
  primaryAction?: React.ReactNode;
  /** Outline buttons. */
  secondaryActions?: React.ReactNode;
  /** Everything else, in a "More" menu. */
  overflow?: PageHeaderAction[];
  /** A <Tabs> element; its <TabsList variant="line"> renders flush under the header. */
  tabs?: React.ReactNode;
  /** @deprecated Use primaryAction. Kept so existing call sites compile. */
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  back,
  primaryAction,
  secondaryActions,
  overflow,
  tabs,
  action,
  className,
}: PageHeaderProps) {
  const primary = primaryAction ?? action;
  const hasActions = Boolean(primary || secondaryActions || (overflow && overflow.length > 0));
  const crumbs: Crumb[] = breadcrumb ?? [{ label: title }];

  return (
    <header data-slot="page-header" className={cn("flex flex-col gap-4", className)}>
      <BreadcrumbRegistrar crumbs={crumbs} />

      {back && (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {back.label}
        </Link>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>

        {hasActions && (
          <div data-slot="page-header-actions" className="flex shrink-0 flex-wrap items-center gap-2">
            {secondaryActions}
            {primary}
            {overflow && overflow.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="icon" aria-label="More actions" />}
                  data-slot="page-header-overflow"
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {overflow.map((item) =>
                    item.href ? (
                      <DropdownMenuItem
                        key={item.label}
                        variant={item.destructive ? "destructive" : "default"}
                        render={<Link href={item.href} />}
                      >
                        {item.icon && <item.icon className="size-4" />}
                        {item.label}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        key={item.label}
                        variant={item.destructive ? "destructive" : "default"}
                        onClick={item.onSelect}
                      >
                        {item.icon && <item.icon className="size-4" />}
                        {item.label}
                      </DropdownMenuItem>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {tabs && (
        <div data-slot="page-header-tabs" className="-mb-2 border-b border-border">
          {tabs}
        </div>
      )}
    </header>
  );
}
```

Check `components/ui/dropdown-menu.tsx` for the exact prop names: base-ui components take a `render` prop for composition (not `asChild`), and `DropdownMenuItem` may expose `variant`. If `DropdownMenuItem` has no `variant` prop, drop that attribute and add `className={item.destructive ? "text-destructive" : undefined}` instead. If `DropdownMenuTrigger` does not accept `render`, wrap: `<DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "icon" })} data-slot="page-header-overflow" aria-label="More actions">`.

Note on `onSelect` in a server component: `overflow` items with `onSelect` can only be passed from client components. Server pages use `href` items. Document this in a JSDoc line above `onSelect`.

- [ ] **Step 5: Create `components/shared/page-toolbar.tsx`**

```tsx
import { cn } from "@/lib/utils";

interface PageToolbarProps {
  /** Left group: search, filters, view toggle, sort. */
  children?: React.ReactNode;
  /** Right-aligned group. */
  end?: React.ReactNode;
  className?: string;
}

/**
 * One row, one height. Filters, search, sort and view toggles live here and
 * nowhere else (spec §4.3). Wraps on small screens.
 */
export function PageToolbar({ children, end, className }: PageToolbarProps) {
  return (
    <div
      data-slot="page-toolbar"
      className={cn("flex flex-wrap items-center gap-2 [&>*]:h-9", className)}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {end && <div className="flex shrink-0 items-center gap-2">{end}</div>}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run components/shared`
Expected: PASS. If the `page-header` test fails on `data-slot="page-header-overflow"`, the trigger does not forward `data-*` attributes; move `data-slot` onto the inner `<Button>` in the `render` prop.

- [ ] **Step 7: Verify in the browser**

Run: `npx tsc --noEmit`. Then open `http://localhost:3000/clients` (uses `PageHeader` already). The top bar now shows the crumb "Clients" in bold and nothing else; the in-page title still shows. Open `/settings/billing` and confirm the crumb "Billing & Subscription".

- [ ] **Step 8: Hand off for review**

Do not commit.

---

### Task 6: Adopt PageShell on every existing PageHeader page

**Files (modify, one wrap each):**

| File | Width |
|---|---|
| `app/(platform)/clients/page.tsx` | default |
| `app/(platform)/clients/[id]/adherence/page.tsx` | default |
| `app/(platform)/clients/[id]/outcomes/page.tsx` | default |
| `app/(platform)/clients/[id]/sessions/[sessionId]/page.tsx` | default |
| `app/(platform)/settings/page.tsx` | default |
| `app/(platform)/settings/audit-log/page.tsx` (both returns) | default |
| `app/(platform)/settings/clinic/page.tsx` | narrow |
| `app/(platform)/settings/billing/page.tsx` | narrow |
| `app/(platform)/assessments/page.tsx` | default |
| `app/(platform)/messages/page.tsx` | full |
| `app/(platform)/calendar/page.tsx` | full |
| `app/(platform)/programs/page.tsx` (both returns) | default |
| `app/(platform)/programs/new/page.tsx` | default |
| `app/(platform)/programs/[id]/edit/page.tsx` | default |
| `app/(platform)/programs/generate/page.tsx` | narrow |
| `app/(platform)/programs/upload/page.tsx` | narrow |
| `app/(platform)/exercises/bulk-import/page.tsx` | narrow |
| `app/(platform)/analytics/page.tsx` | default |

**Interfaces:**
- Consumes: `PageShell` from Task 5.

- [ ] **Step 1: Apply the transformation to each file**

For each file in the table, find the outermost element returned by the page that wraps `<PageHeader ... />` and the page content. Replace that wrapper element with `<PageShell width="...">` and remove any width or spacing classes the wrapper carried (`space-y-*`, `mx-auto`, `max-w-*`). `PageShell` provides `gap-6`. Add `import { PageShell } from "@/components/shared/page-shell";`.

Worked example, `app/(platform)/settings/billing/page.tsx` lines 24–26:

Before:
```tsx
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Billing & Subscription"
        description="Manage your plan and payment details"
      />
```
After:
```tsx
    <PageShell width="narrow">
      <PageHeader
        title="Billing & Subscription"
        description="Manage your plan and payment details"
      />
```
and the matching closing `</div>` becomes `</PageShell>`.

Worked example, `app/(platform)/clients/page.tsx` lines 61–68:

Before:
```tsx
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Clients"
          description={...}
          action={<AddClientDialog />}
        />
      </div>
```
After:
```tsx
    <PageShell>
      <PageHeader
        title="Clients"
        description={...}
        primaryAction={<AddClientDialog />}
      />
```
(the redundant inner `<div>` is removed; rename `action` to `primaryAction` wherever it appears in these files).

If a page's wrapper is a fragment or the `PageHeader` is not at the top level of the return, wrap the whole returned tree in `<PageShell>` instead; do not restructure the page.

`app/(platform)/settings/page.tsx` is fully handled in Task 12; skip it here.

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint "app/(platform)/**/page.tsx"`
Expected: clean (the palette rule allows existing counts).

- [ ] **Step 3: Visual check**

With the dev server on 3000, open in Chrome at 1440px: `/clients`, `/programs`, `/settings/billing`, `/settings/clinic`, `/programs/generate`, `/messages`, `/calendar`, `/analytics`. Confirm: narrow pages are centered at 640px, default pages are centered at 1200px, Inbox and Calendar are full width, and the crumb appears in the top bar on each. No content is clipped or overlapping.

- [ ] **Step 4: Hand off for review**

List the files touched. Do not commit.

---

### Task 7: Sidebar Settings group

**Files:**
- Modify: `components/layout/sidebar.tsx` (the Account section, lines ~176–182; the `accountHrefs` list, lines ~86–89)

**Interfaces:**
- No new exports. Behavior: Account section renders `Billing`, `Settings`, and, when the current path starts with `/settings`, indented children `Organization Settings` (`/settings/clinic`) and `Audit Log` (`/settings/audit-log`). Active matching keeps "longest prefix wins".

- [ ] **Step 1: Restructure the Account section**

Replace:

```tsx
        {role === "TRAINER" && navItem("/settings/billing", "Billing", CreditCard)}
        {navItem("/settings", "Settings", Settings)}
        {role === "TRAINER" && navItem("/settings/clinic", "Organization Settings", Building2)}
        {role === "TRAINER" && navItem("/settings/audit-log", "Audit Log", History)}
```

with:

```tsx
        {role === "TRAINER" && navItem("/settings/billing", "Billing", CreditCard)}
        {navItem("/settings", "Settings", Settings)}
        {role === "TRAINER" && pathname.startsWith("/settings") && !pathname.startsWith("/settings/billing") && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border/50 pl-2">
            {navItem("/settings/clinic", "Organization", Building2)}
            {navItem("/settings/audit-log", "Audit Log", History)}
          </div>
        )}
```

Then in `navItem`, change the row classes `rounded-xl px-3 py-2.5` to `h-9 rounded-lg px-3` (36px rows, spec §4.2) and the icon classes `h-4.5 w-4.5` to `size-4`. Remove the `group-hover:scale-105` transform on the icon (it reads as gimmicky).

Apply the same `h-9 rounded-lg px-3` and `size-4` changes to the Super Admin `<Link>` so the row heights match.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`.
In Chrome: `/dashboard` shows Billing and Settings only under Account. `/settings/clinic` shows the indented children with "Organization" active and "Settings" not highlighted (longest prefix wins). `/settings/billing` shows no children. All rows are the same height.

- [ ] **Step 3: Hand off for review**

Do not commit.

---

### Task 8: SectionCard

**Files:**
- Create: `components/shared/section-card.tsx`
- Test: `components/shared/__tests__/section-card.test.tsx`

**Interfaces:**
- Consumes: `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardAction` from `components/ui/card.tsx`.
- Produces:
  ```ts
  interface SectionCardProps {
    title: string;
    icon?: LucideIcon;
    count?: number;
    description?: string;
    action?: { label: string; href: string } | React.ReactNode;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
    /** Adds the clickable-card hover treatment (spec §3.4). */
    href?: string;
  }
  function SectionCard(props: SectionCardProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `components/shared/__tests__/section-card.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Inbox } from "lucide-react";
import { SectionCard } from "../section-card";

describe("SectionCard", () => {
  it("renders icon, title, count and a link action", () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Inbox" icon={Inbox} count={3} action={{ label: "View all", href: "/messages" }}>
        body
      </SectionCard>
    );
    expect(html).toContain("<h2");
    expect(html).toContain("Inbox");
    expect(html).toContain('data-slot="section-card-count"');
    expect(html).toContain(">3<");
    expect(html).toContain('href="/messages"');
    expect(html).toContain("View all");
    expect(html).toContain("body");
  });

  it("accepts a custom node as action", () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Stats" action={<button>Refresh</button>}>x</SectionCard>
    );
    expect(html).toContain("Refresh");
  });

  it("uses ring instead of drop shadow and adds hover ring when href is set", () => {
    const plain = renderToStaticMarkup(<SectionCard title="A">x</SectionCard>);
    expect(plain).not.toContain("shadow-md");
    const clickable = renderToStaticMarkup(<SectionCard title="A" href="/a">x</SectionCard>);
    expect(clickable).toContain("hover:ring-border-strong");
    expect(clickable).toContain('href="/a"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/shared/__tests__/section-card.test.tsx`
Expected: FAIL, module missing.

- [ ] **Step 3: Create the component**

Create `components/shared/section-card.tsx`:

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type LinkAction = { label: string; href: string };

export interface SectionCardProps {
  title: string;
  icon?: LucideIcon;
  count?: number;
  description?: string;
  /** One right-aligned action: a link or any node. */
  action?: LinkAction | React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** Makes the whole card a link with the clickable hover treatment. */
  href?: string;
}

function isLinkAction(a: SectionCardProps["action"]): a is LinkAction {
  return typeof a === "object" && a !== null && "href" in a && "label" in a;
}

/**
 * The standard content panel: icon + title + optional count on the left,
 * one action on the right, body below. Every dashboard card and detail
 * panel uses this so headers and "View all" links match (spec §5).
 */
export function SectionCard({
  title,
  icon: Icon,
  count,
  description,
  action,
  children,
  className,
  contentClassName,
  href,
}: SectionCardProps) {
  const card = (
    <Card
      data-slot="section-card"
      className={cn(
        "gap-0 py-0 ring-1 ring-border",
        href && "transition-[box-shadow,--tw-ring-color] hover:shadow-sm hover:ring-border-strong",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
          {typeof count === "number" && (
            <span
              data-slot="section-card-count"
              className="rounded-full bg-neutral-soft px-1.5 text-xs font-medium tabular-nums text-neutral-foreground"
            >
              {count}
            </span>
          )}
        </div>
        {action &&
          (isLinkAction(action) ? (
            <Link
              href={action.href}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {action.label}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : (
            <div className="shrink-0">{action}</div>
          ))}
      </div>
      {description && <p className="px-5 pb-3 text-sm text-muted-foreground">{description}</p>}
      <CardContent className={cn("px-5 pb-5", contentClassName)}>{children}</CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {card}
    </Link>
  ) : (
    card
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/shared/__tests__/section-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Adopt on one dashboard card as a smoke test**

In `components/dashboard/dashboard-inbox-card.tsx`, replace the outer `Card`/`CardHeader`/`CardTitle`/"View all" link with `<SectionCard title="Inbox" icon={Inbox} action={{ label: "View all", href: "/messages" }}>…</SectionCard>`, keeping the body (tab pills and message list) exactly as it is. If that file's header contains logic beyond icon, title, and link, leave it for Phase 2 and instead adopt on `components/dashboard/recent-messages-list.tsx` or another card with a plain header.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run components/shared`. Open `/dashboard`; the Inbox card renders with the standard header.

- [ ] **Step 7: Hand off for review**

Do not commit.

---

### Task 9: DataList (rework of DataTable)

**Files:**
- Create: `components/shared/data-list.tsx`
- Modify: `components/shared/data-table.tsx` → becomes `export { DataList as DataTable, type Column } from "./data-list";` plus a deprecation comment
- Test: `components/shared/__tests__/data-list.test.tsx`

**Interfaces:**
- Consumes: `Table*` from `components/ui/table.tsx`, `EmptyState` (Task 10 adds `size="compact"`; use `EmptyState` without `size` until Task 10 lands, then switch).
- Produces:
  ```ts
  interface Column<T> {
    key: string;
    header: string;
    className?: string;
    align?: "left" | "right";
    render?: (item: T) => React.ReactNode;
  }
  interface DataListProps<T> {
    columns: Column<T>[];
    data: T[];
    keyExtractor: (item: T) => string;
    /** Row becomes a link. Takes precedence over onRowClick. */
    rowHref?: (item: T) => string;
    onRowClick?: (item: T) => void;
    density?: "default" | "compact";
    stickyHeader?: boolean;
    emptyState?: React.ReactNode;     // full node; falls back to emptyMessage row
    emptyMessage?: string;
    className?: string;
  }
  function DataList<T>(props: DataListProps<T>): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `components/shared/__tests__/data-list.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DataList, type Column } from "../data-list";

type Row = { id: string; name: string; sessions: number };
const columns: Column<Row>[] = [
  { key: "name", header: "Name" },
  { key: "sessions", header: "Sessions", align: "right" },
];
const rows: Row[] = [
  { id: "1", name: "Ada", sessions: 4 },
  { id: "2", name: "Grace", sessions: 9 },
];

describe("DataList", () => {
  it("renders headers and cells, right-aligning numeric columns", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} />
    );
    expect(html).toContain("Name");
    expect(html).toContain("Ada");
    expect(html).toContain("text-right");
    expect(html).toContain("tabular-nums");
  });

  it("wraps the first cell in a link covering the row when rowHref is given", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} rowHref={(r) => `/clients/${r.id}`} />
    );
    expect(html).toContain('href="/clients/1"');
    expect(html).toContain('data-clickable="true"');
  });

  it("renders the emptyState node when there is no data", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={[]} keyExtractor={(r) => r.id} emptyState={<div>Nothing here</div>} />
    );
    expect(html).toContain("Nothing here");
  });

  it("falls back to emptyMessage", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={[]} keyExtractor={(r) => r.id} emptyMessage="No clients" />
    );
    expect(html).toContain("No clients");
  });

  it("applies compact density and sticky header", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} density="compact" stickyHeader />
    );
    expect(html).toContain('data-density="compact"');
    expect(html).toContain("sticky top-0");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/shared/__tests__/data-list.test.tsx`
Expected: FAIL, module missing.

- [ ] **Step 3: Create `components/shared/data-list.tsx`**

```tsx
"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  align?: "left" | "right";
  render?: (item: T) => React.ReactNode;
}

export interface DataListProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  /** Makes each row navigate. Wins over onRowClick. */
  rowHref?: (item: T) => string;
  onRowClick?: (item: T) => void;
  density?: "default" | "compact";
  stickyHeader?: boolean;
  /** Rendered in place of the table body when data is empty. */
  emptyState?: React.ReactNode;
  emptyMessage?: string;
  className?: string;
}

/**
 * The default list surface (spec §5). A table with hover rows, optional
 * row navigation, right-aligned numerics, sticky header and a built-in
 * empty state. Replaces DataTable.
 */
export function DataList<T>({
  columns,
  data,
  keyExtractor,
  rowHref,
  onRowClick,
  density = "default",
  stickyHeader = false,
  emptyState,
  emptyMessage = "No data found",
  className,
}: DataListProps<T>) {
  const clickable = Boolean(rowHref || onRowClick);
  const cellPad = density === "compact" ? "py-2" : "py-3";

  const cellContent = (item: T, col: Column<T>) =>
    col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? "");

  return (
    <div
      data-slot="data-list"
      data-density={density}
      className={cn("overflow-hidden rounded-xl bg-card ring-1 ring-border", className)}
    >
      <Table>
        <TableHeader className={cn(stickyHeader && "sticky top-0 z-10 bg-card")}>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  "h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                  col.align === "right" && "text-right",
                  col.className
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="p-0">
                {emptyState ?? (
                  <div className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div>
                )}
              </TableCell>
            </TableRow>
          ) : (
            data.map((item) => {
              const href = rowHref?.(item);
              return (
                <TableRow
                  key={keyExtractor(item)}
                  data-clickable={clickable ? "true" : undefined}
                  onClick={!href && onRowClick ? () => onRowClick(item) : undefined}
                  className={cn("relative", clickable && "cursor-pointer")}
                >
                  {columns.map((col, i) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        cellPad,
                        col.align === "right" && "text-right tabular-nums",
                        col.className
                      )}
                    >
                      {i === 0 && href ? (
                        // The first cell's link is stretched over the row so the
                        // whole row navigates while remaining a real anchor.
                        <Link href={href} className="after:absolute after:inset-0 after:content-['']">
                          {cellContent(item, col)}
                        </Link>
                      ) : (
                        cellContent(item, col)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Make `data-table.tsx` a compatibility re-export**

Replace the contents of `components/shared/data-table.tsx` with:

```tsx
/**
 * @deprecated Use DataList from "./data-list". Kept so existing imports compile.
 */
export { DataList as DataTable, type Column } from "./data-list";
```

Then run `grep -rn "DataTable" app components --include=*.tsx | grep -v data-table.tsx` and, for each importer, confirm the props it passes (`columns`, `data`, `keyExtractor`, `onRowClick`, `emptyMessage`, `className`) are all still supported. They are; no call-site edits needed.

- [ ] **Step 5: Run tests and type-check**

Run: `npx vitest run components/shared && npx tsc --noEmit`
Expected: PASS, clean. Interactive elements inside rows (e.g. row action menus) must add `relative z-10` so they sit above the stretched link; note this in the component JSDoc.

- [ ] **Step 6: Hand off for review**

Do not commit.

---

### Task 10: EmptyState compact size

**Files:**
- Modify: `components/shared/empty-state.tsx`

**Interfaces:**
- Produces: existing props plus `size?: "default" | "compact"` and `action?: React.ReactNode` (custom node alternative to `actionLabel`). `actionHref` now renders `next/link`.

- [ ] **Step 1: Rewrite the component**

```tsx
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  /** Custom action node; wins over actionLabel. */
  action?: React.ReactNode;
  /** "compact" for inside cards and list bodies. */
  size?: "default" | "compact";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  action,
  size = "default",
  className,
}: EmptyStateProps) {
  const compact = size === "compact";

  const builtInAction =
    actionLabel && (actionHref || onAction) ? (
      actionHref ? (
        <Button variant={compact ? "outline" : "default"} size={compact ? "sm" : "default"} render={<Link href={actionHref} />}>
          {actionLabel}
        </Button>
      ) : (
        <Button variant={compact ? "outline" : "default"} size={compact ? "sm" : "default"} onClick={onAction}>
          {actionLabel}
        </Button>
      )
    ) : null;

  return (
    <div
      data-slot="empty-state"
      data-size={size}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-16",
        className
      )}
    >
      <div className={cn("rounded-full bg-muted text-muted-foreground", compact ? "p-2.5" : "p-4")}>
        <Icon className={compact ? "size-5" : "size-7"} aria-hidden />
      </div>
      <div className="space-y-1">
        <h3 className={cn("font-semibold", compact ? "text-sm" : "text-base")}>{title}</h3>
        {description && (
          <p className={cn("mx-auto max-w-md text-muted-foreground", compact ? "text-xs" : "text-sm")}>
            {description}
          </p>
        )}
      </div>
      {(action ?? builtInAction) && <div className={compact ? "mt-1" : "mt-3"}>{action ?? builtInAction}</div>}
    </div>
  );
}
```

If `Button` in `components/ui/button.tsx` does not accept `render` (it exposes `asChild`), use `<Button asChild ...><Link href={actionHref}>{actionLabel}</Link></Button>` instead. Check the file: it defines `asChild`, so use `asChild`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. `description` changed from required to optional; confirm no call site relied on it being required (tsc will be silent). Open `/clients/69ce60e9e6457b10834536f4/progress` in Chrome; the "No progress photos yet" empty state still renders.

- [ ] **Step 3: Hand off for review**

Do not commit.

---

### Task 11: StatCard role prop

**Files:**
- Modify: `components/shared/stat-card.tsx`
- Modify: `components/programs/program-list-client.tsx` lines 1857–1861

**Interfaces:**
- Produces: `StatCardProps.role?: StatusRole` replaces `iconClassName`. Icon badge uses `ROLE_CLASSES[role].soft` and `.text`; without `role` it stays `bg-muted text-muted-foreground`. Card elevation becomes `ring-1 ring-border` with hover `hover:shadow-sm hover:ring-border-strong` only when `href` is set.

- [ ] **Step 1: Update `stat-card.tsx`**

1. Add `import { ROLE_CLASSES, type StatusRole } from "@/lib/ui/status";`.
2. In `StatCardProps`, replace the `iconClassName` prop and its JSDoc with:
   ```ts
   /** Semantic color for the icon badge. Omit for neutral grey. */
   role?: StatusRole;
   ```
3. In the destructure, replace `iconClassName,` with `role,`.
4. Replace the icon badge `className`:
   ```tsx
   className={cn(
     "flex shrink-0 items-center justify-center rounded-xl",
     isCompact ? "h-8 w-8 rounded-lg" : "h-11 w-11",
     role ? cn(ROLE_CLASSES[role].soft, ROLE_CLASSES[role].text) : "bg-muted text-muted-foreground",
   )}
   ```
5. Replace the `Card` className:
   ```tsx
   className={cn(
     "h-full ring-1 ring-border shadow-none",
     href && "group transition-[box-shadow,--tw-ring-color] hover:shadow-sm hover:ring-border-strong",
     className,
   )}
   ```
   (remove `hover:-translate-y-0.5`, `shadow-sm`, `hover:shadow-md`, `ring-border/50`).
6. Replace the trend chip classes `bg-success/10 text-success` with `bg-success-soft text-success-foreground` and `bg-destructive/10 text-destructive` with `bg-danger-soft text-danger-foreground`.

- [ ] **Step 2: Update the five call sites in `program-list-client.tsx`**

Replace `iconClassName="bg-emerald-500/10 text-emerald-600"` with `role="success"`; `bg-blue-500/10 text-blue-600` → `role="info"`; `bg-indigo-500/10 text-indigo-600` → `role="brand"`; `bg-amber-500/10 text-amber-600` → `role="warning"`; `bg-purple-500/10 text-purple-600` → `role="neutral"`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint:palette`
Expected: clean; palette total decreased by 10 vs. the previous run. Open `/programs`, click the "Assigned" tab; the five compact stat cards render with colored icon badges.

- [ ] **Step 4: Hand off for review**

Do not commit.

---

### Task 12: FormSection and Clerk appearance

**Files:**
- Create: `components/shared/form-section.tsx`
- Create: `lib/ui/clerk-appearance.ts`
- Modify: `app/(platform)/settings/page.tsx`
- Modify: `components/layout/header.tsx` and `components/layout/sidebar.tsx` (`UserButton appearance`)
- Test: `components/shared/__tests__/form-section.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  function FormSection({ title, description, children, className }): JSX.Element  // heading + divider + 24px field gap
  function FormField({ label, htmlFor, hint, error, required, children, className }): JSX.Element
  const clerkAppearance: { variables: Record<string,string>; elements: Record<string,string> }
  ```

- [ ] **Step 1: Write the failing test**

Create `components/shared/__tests__/form-section.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormSection, FormField } from "../form-section";

describe("FormSection / FormField", () => {
  it("renders heading, description and children with a divider", () => {
    const html = renderToStaticMarkup(
      <FormSection title="Program Details" description="Name and type">
        <input />
      </FormSection>
    );
    expect(html).toContain("<h2");
    expect(html).toContain("Program Details");
    expect(html).toContain("Name and type");
    expect(html).toContain('data-slot="form-section"');
  });

  it("renders label, required marker, hint and error", () => {
    const html = renderToStaticMarkup(
      <FormField label="Name" htmlFor="name" required hint="Shown to clients" error="Required">
        <input id="name" />
      </FormField>
    );
    expect(html).toContain('for="name"');
    expect(html).toContain("Name");
    expect(html).toContain('aria-hidden="true">*<');
    expect(html).toContain("Shown to clients");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Required");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/shared/__tests__/form-section.test.tsx`
Expected: FAIL, module missing.

- [ ] **Step 3: Create `components/shared/form-section.tsx`**

```tsx
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/** One form layout (spec §5): heading, optional description, divider, 24px between fields. */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <section data-slot="form-section" className={cn("flex flex-col gap-6", className)}>
      <div className="border-b border-border pb-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Label above input, 8px gap, helper text below. */
export function FormField({ label, htmlFor, hint, error, required, children, className }: FormFieldProps) {
  return (
    <div data-slot="form-field" className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger-foreground">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
```

If `components/ui/label.tsx` renders a base-ui component that cannot take `htmlFor` directly, use a plain `<label htmlFor=... className="text-sm font-medium">` instead.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/shared/__tests__/form-section.test.tsx`
Expected: PASS.

- [ ] **Step 5: Create `lib/ui/clerk-appearance.ts`**

```ts
/**
 * Maps Clerk's themable variables and elements to our design tokens so the
 * embedded UserProfile and UserButton stop looking like a separate app.
 * Values are CSS custom properties so light/dark follow the page theme.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorText: "var(--foreground)",
    colorTextSecondary: "var(--muted-foreground)",
    colorBackground: "var(--card)",
    colorInputBackground: "var(--background)",
    colorInputText: "var(--foreground)",
    colorDanger: "var(--destructive)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--warning)",
    colorNeutral: "var(--foreground)",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
    fontSize: "0.875rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none ring-1 ring-border rounded-xl",
    card: "shadow-none",
    navbar: "bg-muted/40 border-r border-border",
    navbarButton: "text-sm font-medium rounded-lg",
    navbarButtonIcon: "size-4",
    headerTitle: "text-base font-semibold tracking-tight",
    headerSubtitle: "text-sm text-muted-foreground",
    profileSectionTitleText: "text-sm font-semibold",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-none",
    badge: "rounded-full bg-neutral-soft text-neutral-foreground",
    userButtonAvatarBox: "size-8",
  },
} as const;
```

- [ ] **Step 6: Rewrite `app/(platform)/settings/page.tsx`**

```tsx
import { UserProfile } from "@clerk/nextjs";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { clerkAppearance } from "@/lib/ui/clerk-appearance";

export default async function SettingsPage() {
  return (
    <PageShell>
      <PageHeader title="Settings" description="Manage your account and profile" />
      <UserProfile appearance={clerkAppearance} />
    </PageShell>
  );
}
```

In `components/layout/header.tsx` and `components/layout/sidebar.tsx`, change `<UserButton signInUrl="/sign-in" />` to `<UserButton signInUrl="/sign-in" appearance={clerkAppearance} />` with the import `import { clerkAppearance } from "@/lib/ui/clerk-appearance";`.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`. If Clerk's `Appearance` type rejects a key, remove that key rather than casting. Open `/settings` in Chrome: the widget spans the 1200px column, has our ring border and radius, and its sub-nav uses our muted background. Open `/dashboard`: the avatar buttons still work.

- [ ] **Step 8: Hand off for review**

Do not commit.

---

### Task 13: Phase 1 verification and hand-off

**Files:** none created. Screenshots saved to the scratchpad directory for the user to view.

- [ ] **Step 1: Full checks**

Run each and record the output:

```bash
npx tsc --noEmit
npm run test
npm run lint 2>&1 | tail -3
npm run lint:palette
```

Expected: tsc clean; all Vitest suites pass, including the new `lib/ui`, `eslint-rules`, `components/shared`, `components/layout` tests; `npm run lint` shows zero `design/no-raw-palette` errors; `lint:palette` total is lower than the Task 2 baseline (Tasks 3 and 11 removed at least 20 classes).

- [ ] **Step 2: Screenshot pass at 1440×900**

With the dev server on port 3000 and the trainer account signed in, screenshot and save: `/dashboard`, `/clients`, `/clients/69ce60e9e6457b10834536f4`, `/clients/69ce60e9e6457b10834536f4/adherence`, `/programs`, `/programs/generate`, `/settings`, `/settings/billing`, `/settings/clinic`, `/messages`, `/analytics`, `/nutrition`.

Check on each:
- Top bar shows a breadcrumb (pages with `PageHeader`) or nothing on desktop (pages without one). Never the old `INMOTUS RX / Title`.
- Content width matches the Task 6 table.
- Sidebar rows are uniform height; Settings children appear only under `/settings/*`.
- Status badges (adherence page, dashboard week row) show a dot and soft background.
- No layout overlap, clipping, or console errors (check with the browser console tool, pattern `Error|Warning`).

- [ ] **Step 3: Write the hand-off summary**

Report to the user, in this order: what changed (grouped by shell, tokens, components, lint), the palette totals before and after, the remaining `npm run lint` error count with a note that those are pre-existing, the list of files for review, and the Phase 2 starting point (Dashboard, Clients list, Client Details per spec §6). Do not commit.

---

## Self-review against the spec

- §3.1 tokens and `lib/ui/status.ts` → Task 1. ✔
- §3.2 widths → Task 5 (`PAGE_WIDTH_CLASS`), Task 6 (adoption). ✔
- §3.3 typography: heading font narrowed (Task 1); scale applied in `PageHeader` (24px/600), `SectionCard` (16px/600), `DataList` headers (11px uppercase), tabular numerics (`DataList`, `StatCard`). ✔
- §3.4 elevation: `SectionCard`, `StatCard`, `DataList` use `ring-1 ring-border`; hover ring on clickable. Gradient removal from pages is Phase 2+ per page (spec lists it as foundation-wide; the sidebar gradient stays). Noted as a Phase 2 follow-up in each page migration. ✔
- §3.5 lint rule, baseline, `lint:palette`, exceptions → Task 2. ✔
- §4.1 header breadcrumb, map removed → Task 4, registration in Task 5. ✔
- §4.2 sidebar group and 36px rows → Task 7. ✔
- §4.3 template and rules → Task 5; `<main>` gutter stays in layout, width in `PageShell` (spec says padding moves into PageShell; kept in layout so un-migrated pages keep their gutter — deviation documented in `PageShell` JSDoc). ✔
- §4.4 Client Details showcase → **Phase 2**, not Phase 1 (spec §6 places it in phase 2). ✔
- §5 components: StatusBadge (T3), SectionCard (T8), DataList (T9), EmptyState (T10), StatCard (T11), PageShell/Header/Toolbar (T5), FormSection (T12), Clerk appearance (T12). ✔
- §7 verification → Task 13 plus per-task steps. ✔
- Type consistency: `StatusRole` values identical in Tasks 1, 3, 11; `Crumb` shape identical in Tasks 4 and 5; `Column<T>` re-exported from `data-table.tsx` matches `data-list.tsx`; `PageShell width` values match `PAGE_WIDTH_CLASS` keys and the Task 6 table. ✔
