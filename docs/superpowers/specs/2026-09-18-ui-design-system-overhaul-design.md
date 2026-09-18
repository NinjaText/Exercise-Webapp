# UI/UX Design System Overhaul — Design Spec

**Date:** 2026-09-18
**Status:** Approved for planning
**Scope:** App-wide visual and interaction standardization for the INMOTUS RX platform (trainer side, client side, admin), refining the current brand rather than replacing it.

## 1. Problem

The app reads as unprofessional and "scattered." The audit (14 trainer screens at 1440px plus a code read of the client-side views) found the causes are structural, not cosmetic:

- **Two titles on every page.** The top bar renders `INMOTUS RX / <Title>` from a hard-coded route map in `components/layout/header.tsx`, and the page body renders a second large H1. Routes missing from the map (Nutrition, Analytics) fall back to `INMOTUS RX`, which looks broken.
- **Content width changes per page.** Billing is a narrow centered column, Generate Program is a medium centered column, Settings is a left-aligned Clerk widget, everything else is full-bleed.
- **No status system.** ~980 raw Tailwind palette classes (`bg-emerald-500`, `text-amber-600`, …) across `app/` and `components/`. Scheduled/Completed/Missed/Skipped colors are defined independently in at least four files. Badges for Draft, Scheduled, Resource, Template each use a different visual treatment.
- **Three tab styles**, mixed button sizes, and multiple filled primary buttons per screen. Client Details has six header actions plus three duplicates in the calendar toolbar.
- **Only 18 of 36 platform pages** use the shared `PageHeader`; the rest hand-roll titles and spacing.
- **Page-specific defects**: Nutrition rows with blank avatars and no names; Clients rendered as cards showing the email as the name with a redundant "Client" label; Programs stacking collections, segmented control, search, three dropdowns, filters, and a dense table with no hierarchy; Clerk's embedded profile UI with its own sub-nav inside Settings.

## 2. Goals and non-goals

**Goals**

1. One visual language: every page is built from the same tokens, template, and components.
2. Consistency by construction: a lint rule prevents raw palette colors from creeping back.
3. Premium, calm feel: fewer competing colors, one primary action per view, consistent rhythm.
4. Same standard on trainer, client, and admin surfaces.

**Non-goals**

- No change to information architecture, routes, data model, or server actions beyond what the UI needs.
- No new visual brand. Navy sidebar, indigo primary, Inter + Lexend stay.
- No new features. Functional behavior of every page is preserved.

## 3. Foundation

### 3.1 Semantic status tokens

Added to `app/globals.css` in oklch, defined for both `:root` and `.dark`. Six roles, each with `--<role>`, `--<role>-foreground`, `--<role>-soft` (background), and `--<role>-border`, and exposed via `@theme inline` as Tailwind colors (`bg-info-soft`, `text-warning-foreground`, etc.).

| Role | Hue | Used for |
|---|---|---|
| `info` | blue | Scheduled, Draft, In Progress |
| `success` | teal-green (existing `--success`) | Completed, Active, On Track |
| `warning` | amber | Missed, At Risk, Past Due, Paused, Trialing |
| `danger` | red (aliases existing `--destructive`) | Abandoned, Off Track, Canceled, Unpaid |
| `neutral` | grey | Template, Resource, Archived, Skipped, Inactive |
| `brand` | indigo (existing `--primary` family) | AI-generated content, insights, "special" callouts. Named `brand`, not `accent`, because shadcn already defines `--accent` for hover surfaces. |

A single mapping module, `lib/ui/status.ts`, exports `statusRole(status: string): Role` covering every domain status string in the app (PlanStatus, SessionStatus, SubStatus, calendar day states, client progress buckets, program type labels). Adding a status means editing this one file.

### 3.2 Content widths

Three values, chosen per page in the page template, never inside components:

| Name | Max width | Pages |
|---|---|---|
| `narrow` | 640px | Billing, Organization Settings, Generate Program, onboarding forms |
| `default` | 1600px | Dashboard, Clients, Programs list/detail/editor, Exercises, Nutrition, Analytics, Settings, Audit Log, all client pages except Calendar and Workout |
| `full` | none | Inbox, Calendar, Program Builder/Schedule views, Workout session |

`default` was 1200px as originally specified. Raised to 1600px on 2026-09-19 after the
first look at the app on a large display: the cap only binds above a ~1500px viewport, so
it was invisible on a 13" laptop through all six phases, but on a ~1630px content area it
left ~190px of dead gutter on each side. This app's `default` pages are dashboards, tables
and card grids rather than prose, so the reading-line-length argument for 1200px does not
apply to them; 1600px still bounds rows on a 27" display.

### 3.3 Typography

- Lexend for H1 (page title) and H2 (section title) only. Inter everywhere else. The global `h1..h6 { font-family: lexend }` rule is narrowed to `h1, h2`.
- Scale: page title 24px/600, section title 16px/600, card title 14px/600, body 14px/400, caption 12px/400, eyebrow label 11px/600 uppercase tracking-wide.
- Numbers use `tabular-nums` wherever they appear in lists, stats, or tables.

### 3.4 Spacing, radius, elevation

- Page gutter 24px (16px below `sm`). Section gap 24px. Card padding 20px. Grid gap 16px.
- Radius: `--radius` stays 0.75rem. Cards 12px, controls 8px, badges full.
- Elevation: cards use `ring-1 ring-border` with no drop shadow. Clickable cards add `hover:shadow-sm hover:ring-border-strong`. The existing gradient sidebar background stays; all other `bg-gradient-*` usages in pages are removed.

### 3.5 Raw palette lint rule

A local ESLint rule (`eslint-rules/no-raw-palette.js`, wired in `eslint.config.mjs`) reports any class token matching `(bg|text|border|ring|fill|stroke|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}` inside `className` string literals and `cn()`/`cva()` arguments in `app/**` and `components/**`. Message points to the semantic tokens.

Existing violations are recorded in `eslint-rules/no-raw-palette.baseline.json` (file → count). The rule errors only when a file's count exceeds its baseline, so the build passes on day one and the total can only fall. A script `npm run lint:palette` prints the current total. Target at end of migration: baseline file deleted, rule is a plain error.

Exceptions: `components/ui/**` (shadcn primitives), `app/page.tsx` and `app/about/**` (marketing), email templates.

## 4. Shell and page template

### 4.1 Top bar (`components/layout/header.tsx`)

- Remove the `INMOTUS RX / Title` block and the route-to-title map.
- Render a breadcrumb supplied by the page via a lightweight context (`components/layout/breadcrumb-context.tsx`): pages call `useSetBreadcrumb([...])` or the server `PageHeader` passes `breadcrumb` which registers itself on mount. Example: `Clients / Yahya Shah`. Last crumb is the current page and is not a link.
- Mobile menu, search, notifications, avatar unchanged.

### 4.2 Sidebar (`components/layout/sidebar.tsx`)

- Row height fixed at 36px, icon 16px, one active style (existing `bg-sidebar-primary/15`).
- Account group becomes: Billing, Settings (with Organization Settings and Audit Log as indented children, expanded when any is active).
- Brand block unchanged. Gradient background unchanged.

### 4.3 Page template (`components/shared/page-shell.tsx`, reworked `page-header.tsx`, new `page-toolbar.tsx`)

```
<PageShell width="default" | "narrow" | "full">
  <PageHeader
    breadcrumb={[{label, href}, ...]}
    title description
    primaryAction      // exactly one, filled Button
    secondaryActions   // outline Buttons
    overflow           // DropdownMenu items
    tabs               // optional; underline style, rendered flush under the header
    back               // optional {label, href} shown above the title
  />
  <PageToolbar>         // optional, one row, height 36px
    search | filters | view toggle | sort | right-aligned actions
  </PageToolbar>
  {children}
</PageShell>
```

Rules enforced by the template:
- One filled primary button per screen. Extra actions go to `secondaryActions` or `overflow`.
- Tabs are always the `line` variant of `components/ui/tabs.tsx`, directly under the header.
- Filters, search, sort, and view toggles live only in `PageToolbar`.
- The current `PageHeader` props (`title`, `description`, `action`) remain supported so the 18 existing call sites compile; `action` maps to `primaryAction`.

`app/(platform)/layout.tsx` keeps the outer flex shell; `<main>` padding moves into `PageShell` so width is controlled in one place.

### 4.4 Client Details showcase

Header actions reduce to: **Assign Program** (primary), **Message** (secondary), overflow: Create Program, Generate with AI, Sessions, Outcomes, Progress. Calendar toolbar keeps Month/Week/Day, prev/next/Today, and the status legend only. The stats strip (Completion, Completed, Missed, Avg RPE) becomes a row of compact `StatCard`s.

## 5. Component standards (`components/shared/`)

| Component | Change |
|---|---|
| `StatusBadge` (new) | `<StatusBadge status="COMPLETED" />` → looks up role via `lib/ui/status.ts`, renders dot + label in soft role colors. Optional `label` override. Replaces all hand-rolled status chips. |
| `SectionCard` (new) | `Card` with a standard header: 16px icon, title, optional count badge, one right-aligned action (`{label, href}` or node). Used by every dashboard card and detail panel. |
| `DataList` (rework of `DataTable`) | Adds `href`/`onRowClick` row navigation with hover, optional leading avatar column, sticky header, `emptyState` prop rendering `EmptyState compact`, and `density="compact" \| "default"`. Default list surface for Clients, Programs, Nutrition, Audit Log, Admin tables. |
| `EmptyState` | New `size="compact"` for inside cards. Uses `Link` for hrefs. Style aligned to tokens. |
| `StatCard` | `iconClassName` replaced by `role?: Role`. Same two sizes. |
| `PageShell`, `PageHeader`, `PageToolbar` | See §4.3. |
| `FormSection` (new) | Heading + description + divider + children with 24px field gap. Field layout: label above, 8px gap, helper below. Adopted by program editor, organization settings, client profile dialog, onboarding. |

Button rules: `components/ui/button.tsx` unchanged; usage rule is default size for page actions, `sm` only inside toolbars and table rows, `icon` ghost for row menus. `xs` is not used in pages.

Clerk components (`UserProfile` in Settings, `UserButton`) receive an `appearance` config in `lib/ui/clerk-appearance.ts` mapping Clerk variables to our tokens, and Settings wraps the widget in `PageShell width="default"` with our `PageHeader`.

## 6. Migration order

Each phase is an independent, reviewable change. Nothing is committed by the assistant; the user reviews and commits.

1. **Foundation**: §3 tokens, `lib/ui/status.ts`, lint rule + baseline, §4 shell and template, §5 shared components. Every page immediately gets the new top bar and consistent gutters because the layout and `PageHeader` change centrally.
2. **Trainer core**: Dashboard (`SectionCard` everywhere, hero banner toned to a flat card), Clients list (`DataList` with name/email/status/program/last activity columns; card view removed), Client Details (§4.4).
3. **Programs**: list (collections become a `PageToolbar` chip filter; type/template shown via `StatusBadge`), detail, editor, new, generate (`narrow`, `FormSection`).
4. **Exercises** (toolbar consolidation), **Inbox** (`full`, panel widths 320 / flex / 280), **Nutrition** (`DataList`, real names/avatars, empty rows fixed), **Analytics**, **Settings**, **Billing**.
5. **Client side**: Dashboard, My Programs, Calendar, Workout session and tracker (tracker colors → roles), Nutrition, Inbox.
6. **Admin** pages.

Phase exit criterion: `npm run lint:palette` total is lower than at phase start, type check passes, and every migrated page has a fresh 1440px screenshot reviewed against the audit set.

## 7. Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run test` pass after every phase.
- Raw palette count reported per phase; must decrease. Final state: zero outside exceptions.
- Chrome screenshots at 1440×900 for each migrated page, compared with the audit screenshots. Mobile width checked where the browser allows a narrower window.
- New unit tests: `lib/ui/status.test.ts` (every known status maps to a role; unknown falls back to `neutral`), `status-badge.test.tsx`, `page-header.test.tsx` (primary/secondary/overflow slotting, back link, tabs), `data-list.test.tsx` (row link, empty state).

## 8. Risks

- **Breadth of raw-color cleanup.** Mitigated by the baseline: the rule never blocks unrelated work, and each phase only cleans the files it touches.
- **Clerk widget theming limits.** If `appearance` cannot fully match, the widget is at least wrapped in our shell; residual Clerk styling is accepted.
- **Client-side pages not visually audited live.** They follow the same components; phase 5 includes a live pass once a client account is available in the browser.
