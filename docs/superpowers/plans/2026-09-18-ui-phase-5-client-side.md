# UI Phase 5: Client Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the client portal the same standard as the trainer side: one header pattern, one primary action per screen ("Start workout"), `SectionCard` panels, role-based status colors, and a workout tracker whose colors come from the shared tokens instead of five ad-hoc palettes.

**Architecture:** Styling and layout only. The client dashboard, My Programs, Calendar, Nutrition (client view), and the live workout session pages adopt `PageShell`/`PageHeader`; the workout tracker family gets a token sweep (119 raw classes) with a small local mapping so completed/in-progress/skipped/pain states use `success`/`info`/`neutral`/`warning`.

**Spec:** `docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md` §3.4, §4.3, §5, §6 phase 5.

## Global Constraints

Identical to the Phase 2 plan's Global Constraints. Additional:

- Client pages are used on phones. Every touched page must lay out at 390px wide with no horizontal scroll: stat strips `grid-cols-2`, action rows wrap, the workout tracker's controls stay thumb-sized (`h-11` minimum for the primary Start/Complete buttons).
- Workout state colors: completed → `success`, in progress / current → `info`, skipped → `neutral`, pain or RPE warnings → `warning`, destructive (abandon) → `danger`. Never per-component palettes.
- The workout session page (`/sessions/[id]`) is `PageShell width="full"` with a `PageHeader back` link; the tracker itself keeps its focused, distraction-free layout.

---

### Task 1: Client dashboard

**Files:** `components/dashboard/client-dashboard.tsx`, `components/dashboard/trainer-message-banner.tsx`, `components/dashboard/program-progress-bar.tsx`, `components/dashboard/quick-resources-row.tsx`, `components/dashboard/client-calendar-view.tsx` (colors only), `components/dashboard/client-session-calendar.tsx` (colors only), `app/(platform)/dashboard/page.tsx` (client branch wrap).

- [ ] **Step 1:** Wrap the client branch of `dashboard/page.tsx` in `<PageShell>`. In `ClientDashboard`, replace the `<h1>Welcome Back…</h1>` block with `<PageHeader title={`Welcome back, ${firstName}`} description={today's date label} />`.
- [ ] **Step 2: Up next.** The three mutually exclusive `rounded-2xl bg-muted` hero blocks (today's workout / next session / nothing scheduled) become one `<SectionCard title="Up next" icon={CalendarDays}>` whose body shows: eyebrow `StatusBadge` (`"TODAY"` role `info` / `"UPCOMING"` role `neutral`), the workout name as `text-lg font-semibold`, the meta line, and the single filled `Button size="lg"` "Start workout" (today) or an outline "Preview" (future). Nothing scheduled → `EmptyState size="compact" icon={CalendarX} title="Nothing scheduled right now" description=…`.
- [ ] **Step 3: Panels.** `ProgramProgressBar` → renders inside `SectionCard title="Program progress" icon={TrendingUp}`; the streak `Card` → `SectionCard title="Streak" icon={Flame}` with the flame icon `text-warning`; `QuickResourcesRow` → `SectionCard title="Resources" icon={Library} action={{label:"View all", href:"/programs?type=resources"}}`; assessments `Card` → `SectionCard title="Assessments" icon={ClipboardCheck} action={{label:"View all", href:"/assessments"}}`. The 4 emoji stat cards → `StatCard size="compact"` with icons (`Flame` warning, `CheckCircle2` success, `Dumbbell` info, `Calendar` neutral), no emoji, no `bg-amber-50`.
- [ ] **Step 4:** `TrainerMessageBanner` → `rounded-xl border border-brand-border bg-brand-soft p-4 text-brand-foreground` with a filled "Reply" button? No: one primary per screen (Start workout). Use `variant="outline"`. Calendar components: raw → tokens.
- [ ] **Step 5: Verify.** tsc; eslint; palette (all touched at 0); check `/dashboard` as a client at 390px and 1440px (controller). Hand off.

---

### Task 2: My Programs (client) and schedule view

**Files:** `components/programs/client-programs-view.tsx`, `components/programs/client-program-schedule-view.tsx`, `app/(platform)/programs/page.tsx` (client branch).

- [ ] **Step 1:** Move the client branch's `PageHeader` into `ClientProgramsView`, inside a `<Tabs value={tab} onValueChange=…>` root, with `tabs={<TabsList variant="line"><TabsTrigger value="programs">Programs ({n})</TabsTrigger><TabsTrigger value="resources">Resources ({n})</TabsTrigger></TabsList>}`; delete the hand-rolled pill segmented control. Keep the `?type=` deep link behavior.
- [ ] **Step 2:** `ScheduledProgramCard` status chip → `StatusBadge status={program.status} size="sm"`; week pill → `StatusBadge status="week" role="info" dot={false} label={`Week ${n} of ${total}`}`; cards `ring-1 ring-border shadow-none`; the per-card "Continue" button is `outline` unless it is the single "current" program, which gets the filled button. `ResourceCard` icon tile → `bg-brand-soft text-brand-foreground`. Lightbulb callout → `border-warning-border bg-warning-soft text-warning-foreground`. `client-program-schedule-view.tsx` (4 raw) → tokens; day status dots via `ROLE_CLASSES`.
- [ ] **Step 3: Verify.** tsc; eslint; palette. Hand off.

---

### Task 3: Workout session page and tracker family (token sweep)

**Files:** `app/(platform)/sessions/[id]/page.tsx`, `components/workout/workout-mode-wrapper.tsx` (12), `components/workout/workout-flow.tsx` (31), `components/workout/workout-session-tracker.tsx` (36), `components/workout/workout-checklist-tracker.tsx` (40), `components/workout/plan-status-badge.tsx` (6), `components/workout/plan-status-actions.tsx` (4), `components/workout/plan-feedback-section.tsx` (6), `components/workout/plan-card.tsx` (3), `components/workout/generate-plan-form.tsx` (1), `components/sessions/client-note-reply.tsx` (7), `app/(platform)/clients/[id]/sessions/[sessionId]/page.tsx` (15).

- [ ] **Step 1:** `sessions/[id]/page.tsx`: `<PageShell width="full"><PageHeader back={{label:"Back to dashboard", href:"/dashboard"}} breadcrumb={[{label:"Dashboard",href:"/dashboard"},{label:workout.name}]} title={workout.name} description={program name · date} /><WorkoutModeWrapper …/></PageShell>`; delete the hand-rolled back button.
- [ ] **Step 2: Create one local map** in `components/workout/workout-tokens.ts`:
  ```ts
  import { ROLE_CLASSES } from "@/lib/ui/status";
  export const WORKOUT_STATE = {
    completed: { ...ROLE_CLASSES.success, ring: "ring-success/40" },
    current:   { ...ROLE_CLASSES.info,    ring: "ring-info/40" },
    skipped:   { ...ROLE_CLASSES.neutral, ring: "ring-border" },
    pain:      { ...ROLE_CLASSES.warning, ring: "ring-warning/40" },
    abandoned: { ...ROLE_CLASSES.danger,  ring: "ring-danger/40" },
  } as const;
  ```
  and use it everywhere the four tracker files chose emerald/blue/amber/sky/violet by hand. Progress bars: `bg-primary` on `bg-muted`. Timer/rest accents: `text-info-foreground`/`bg-info-soft`. RPE scale: neutral chips, selected `bg-primary text-primary-foreground`. Pain flag: `warning`. "Complete set" primary button stays filled and `h-11`; secondary controls outline/ghost.
- [ ] **Step 3:** `plan-status-badge.tsx` → thin wrapper around `StatusBadge` (statuses DRAFT/ACTIVE/PAUSED/COMPLETED/ARCHIVED already mapped). Other `plan-*` files, `client-note-reply.tsx`, and the trainer session-review page (`clients/[id]/sessions/[sessionId]/page.tsx`: wrap in `PageShell`, add `PageHeader` breadcrumb `[Clients → name → Sessions → workout]`, its `statusColors`/`getStatusColor` map → `StatusBadge`) → tokens.
- [ ] **Step 4: Verify.** tsc; `npx vitest run components/workout`; eslint; palette (all touched at 0). Hand off.

---

### Task 4: Client nutrition view

**Files:** `app/(platform)/nutrition/page.tsx` (ClientNutritionView), `components/nutrition/macro-progress-bars.tsx`, `components/nutrition/accountability-score-card.tsx`, `components/nutrition/day-notes-card.tsx`, `components/nutrition/meal-log-dialog.tsx` (colors only), `components/nutrition/edit-meal-group-dialog.tsx` (colors only), `components/nutrition/food-item-row-list.tsx` (colors only), `components/nutrition/comment-thread.tsx` (colors only).

- [ ] **Step 1:** `<PageShell>` + `<PageHeader title="Nutrition" description={today label} primaryAction={<MealLogDialog … trigger filled "Log meal" />} secondaryActions={<NutritionGoalsDialog … outline />} />`; adherence % → a compact `StatCard` row (Adherence with role by threshold, Streak `warning`, Water `info`). Tabs → line via `PageHeader tabs`.
- [ ] **Step 2:** Every `rounded-xl p-4 ring-1 ring-border/50 shadow-sm` wrapper → `SectionCard` with a title matching the child (Macros, Water, Meals, Notes, Accountability, Weekly review, AI summary).
- [ ] **Step 3:** Tokens in the listed components (macro bars: protein `info`, carbs `warning`, fat `brand`, calories `primary`; adherence thresholds → success/warning/danger).
- [ ] **Step 4: Verify.** tsc; eslint; palette. Hand off.

---

### Task 5: Phase 5 verification (controller)

- [ ] tsc, full vitest, palette errors 0, `lint:palette` lower than Phase 4 end and not stale.
- [ ] Browser: needs a CLIENT-role login. Ask the user for a client test account or sign-in; if unavailable, verify by static render of `ClientDashboard`/`ClientProgramsView`/`WorkoutModeWrapper` with `renderToStaticMarkup` fixtures in a scratch test, and record that the live pass is pending.
