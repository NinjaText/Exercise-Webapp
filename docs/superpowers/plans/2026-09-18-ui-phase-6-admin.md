# UI Phase 6: Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Super Admin area (`/admin/**`) uses the same shell pattern, header, stat cards, list surface, and badges as the platform, and its duplicate `StatCard` is removed.

**Architecture:** `app/admin/layout.tsx` adopts `BreadcrumbProvider` + `Breadcrumbs` in its top bar (same as the platform header) and the platform sidebar's row metrics; every admin page wraps in `PageShell` + `PageHeader`; admin tables become `DataList`; `components/admin/stat-card.tsx` is deleted in favor of `components/shared/stat-card.tsx`.

**Spec:** `docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md` §4, §5, §6 phase 6.

## Global Constraints

Identical to the Phase 2 plan's Global Constraints. Additional:

- Admin route protection (`requireSuperAdmin`) and every server action stay untouched.
- Admin table row actions (user/program/exercise menus) sit in a trailing column wrapped in `relative z-10` so they work above `DataList`'s stretched row links.

---

### Task 1: Admin shell

**Files:** `app/admin/layout.tsx`, `components/admin/admin-sidebar.tsx`, `components/admin/admin-mobile-nav.tsx` (only if it duplicates sidebar row styles).

- [ ] Wrap the layout tree in `<BreadcrumbProvider>`; the top bar renders `<Breadcrumbs crumbs={crumbs} />` via a small client `AdminTopBar` component that calls `useBreadcrumb()` and falls back to the brand text "INMOTUS RX" when empty (mirror `components/layout/header.tsx`). The "Super Admin" pill → `<StatusBadge status="admin" role="brand" label="Super Admin" size="sm" />`. Keep the date text. `<main>` keeps `p-4 sm:p-6`.
- [ ] `admin-sidebar.tsx`: rows `h-9 rounded-lg px-3`, icons `size-4`, one active style (`bg-sidebar-primary/15 text-sidebar-primary`), group eyebrows `text-[11px] font-semibold uppercase tracking-wide`; remove any gradient other than the sidebar background and any raw palette class. Add a "Back to app" row linking `/dashboard` at the bottom group if absent.
- [ ] Verify tsc/eslint/palette. Hand off.

---

### Task 2: Admin pages on PageShell/PageHeader/StatCard

**Files:** `app/admin/page.tsx`, `app/admin/analytics/page.tsx`, `app/admin/audit-log/page.tsx`, `app/admin/exercises/page.tsx`, `app/admin/exercises/[id]/page.tsx`, `app/admin/exercises/[id]/edit/page.tsx`, `app/admin/exercises/new/page.tsx`, `app/admin/exercises/import/page.tsx`, `app/admin/global-programs/page.tsx`, `app/admin/global-programs/[id]/page.tsx`, `app/admin/global-programs/[id]/edit/page.tsx`, `app/admin/global-programs/new/page.tsx`, `app/admin/global-programs/generate/page.tsx`, `app/admin/programs/page.tsx`, `app/admin/programs/[id]/page.tsx`, `app/admin/programs/[id]/edit/page.tsx`, `app/admin/users/page.tsx`, `components/admin/stat-card.tsx` (delete), `components/admin/analytics-charts.tsx` (colors only).

- [ ] Every page: `<PageShell>` (`narrow` for new/edit/import/generate forms, `default` otherwise) + `<PageHeader breadcrumb={[{label:"Admin",href:"/admin"}, …]} title description primaryAction? secondaryActions? />`; hand-rolled `<h1>` blocks and back buttons removed (use `back`).
- [ ] `app/admin/page.tsx`: the 8 `components/admin/stat-card` usages → shared `StatCard` (`sub` → `description`, roles: users `info`, trainers `brand`, clients `success`, active programs `success`, others `neutral`); the two overview panels → `SectionCard` with `action` links. Delete `components/admin/stat-card.tsx` once no importer remains (`grep -rn "admin/stat-card"`).
- [ ] Analytics: chart cards → `SectionCard`; chart colors via `var(--chart-n)`.
- [ ] Verify tsc/eslint/palette. Hand off.

---

### Task 3: Admin tables → DataList

**Files:** `components/admin/trainers-with-clients-table.tsx`, `components/admin/exercises-table.tsx`, `app/admin/programs/page.tsx` + `app/admin/global-programs/page.tsx` (table markup), `app/admin/audit-log/page.tsx` (reuse `components/audit-log/audit-log-table.tsx` from Phase 4 if the data shape matches; otherwise `DataList` inline), `components/admin/admin-exercise-filters.tsx` (heights only), `components/admin/user-actions-menu.tsx`, `components/admin/program-actions-menu.tsx`, `components/admin/delete-exercise-button.tsx` (colors/variants only).

- [ ] Each table → `DataList` with `rowHref` to the detail page where one exists, `StatusBadge` for status/role/visibility columns (`TRAINER`/`CLIENT` roles → `brand`/`info`; `isPublic` → `success`/`neutral` "Public"/"Private"; program status via mapping), `density="compact"`, `emptyState`. Filters/search rows → `PageToolbar`.
- [ ] `exercises-table.tsx` (20 raw): difficulty/phase chips as in Phase 4 Task 1; delete button `variant="destructive"`.
- [ ] Verify tsc/eslint/palette (all admin files at 0). Hand off.

---

### Task 4: Phase 6 verification and lint finalization (controller)

- [ ] tsc, full vitest, palette errors 0.
- [ ] `npm run lint:palette`: report the remaining raw-class total and the top files. If the total is 0 outside the spec's exceptions (`components/ui/**`, `app/page.tsx`, `app/about/**`, emails), delete `eslint-rules/no-raw-palette.baseline.json`, remove the `baseline` option from `eslint.config.mjs`, and make the rule a plain error (spec §3.5 end state). Otherwise regenerate the baseline and list the remaining files for a follow-up.
- [ ] Browser: `/admin`, `/admin/users`, `/admin/exercises`, `/admin/programs`, `/admin/global-programs`, `/admin/audit-log`, `/admin/analytics` at 1440px.
