# UI Phase 4: Exercises, Inbox, Nutrition, Analytics, Settings, Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the trainer side: every remaining trainer surface uses the Phase 1 header/toolbar/card/badge primitives, the Nutrition roster shows real names, and the touched files reach zero raw palette classes.

**Architecture:** Styling and layout only, plus one small data change (the nutrition roster snapshot returns `email` so display names can fall back to it). Each task is one surface.

**Spec:** `docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md` §3.4, §4.3, §5, §6 phase 4.

## Global Constraints

Identical to the Phase 2 plan's Global Constraints. Additional:

- Difficulty and exercise-phase colors: difficulty uses `StatusBadge` with an explicit `role` (`BEGINNER → success`, `INTERMEDIATE → warning`, `ADVANCED → danger`, unknown → neutral). Exercise phases over images use ONE neutral overlay style (`bg-foreground/75 text-background`), never per-phase hues.
- Image placeholders use `bg-muted` + a muted icon, never gradients.
- Inbox keeps its three-pane layout and every interaction (unread filter, mark all read, broadcast, new message, thread selection, context panel).

---

### Task 1: Exercise Library, detail, new/edit, import

**Files:** `app/(platform)/exercises/page.tsx`, `app/(platform)/exercises/[id]/page.tsx`, `app/(platform)/exercises/[id]/edit/page.tsx`, `app/(platform)/exercises/new/page.tsx`, `components/exercises/exercise-card.tsx`, `components/exercises/exercise-image.tsx`, `components/exercises/exercise-detail.tsx`, `components/exercises/exercise-form.tsx`, `components/exercises/exercise-edit-form.tsx`, `components/exercises/bulk-import-form.tsx`, `components/exercises/csv-import-form.tsx`, `components/exercises/exercise-filters.tsx` (heights only).

- [ ] **Step 1: Library page.** Wrap in `<PageShell>`. Replace the `<h2>` block and button row with `<PageHeader title="Exercise Library" description={`${total} exercises`} primaryAction={<Button asChild><Link href="/exercises/new"><Plus className="size-4" /> New Exercise</Link></Button>} secondaryActions={<Button variant="outline" asChild><Link href="/exercises/bulk-import"><Upload className="size-4" /> Import</Link></Button>} tabs={kindTabs} />` where `kindTabs` is the existing Training/Assessment `Link` row restyled to match the line variant: container `flex gap-1`, each link `relative px-3 py-2 text-sm font-medium` with active `text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground` and inactive `text-muted-foreground hover:text-foreground`. Replace the filters/selects row with `<PageToolbar end={<ExerciseToolbarSelects …/>}><Suspense …><ExerciseFilters …/></Suspense></PageToolbar>`; ensure inputs/selects inside are `h-9`. Empty state → `<EmptyState icon={Dumbbell} title="No exercises found" description={…} />`.
- [ ] **Step 2: Card and image.** `exercise-card.tsx`: `difficultyConfig` → `<StatusBadge status={difficultyLevel} label={formatDifficulty(...)} role={DIFFICULTY_ROLE[difficultyLevel] ?? "neutral"} size="sm" dot={false} />` with `const DIFFICULTY_ROLE: Record<string, StatusRole> = { BEGINNER: "success", INTERMEDIATE: "warning", ADVANCED: "danger" }`. `phaseConfig` → labels only; chips render with `bg-foreground/75 text-background`. Card: `ring-1 ring-border shadow-none`, hover `hover:shadow-sm hover:ring-border-strong`, no translate. `exercise-image.tsx`: gradient placeholder classes → `bg-muted text-muted-foreground`.
- [ ] **Step 3: Detail page.** `exercises/[id]/page.tsx` + `exercise-detail.tsx`: `<PageShell>` + `<PageHeader breadcrumb={[{label:"Exercises",href:"/exercises"},{label:exercise.name}]} title={exercise.name} primaryAction={Edit link, filled} />`; the badges row (regions, difficulty via `StatusBadge`, phases via neutral `StatusBadge dot={false}`) renders as a meta row directly under the header (`-mt-2 flex flex-wrap gap-2`). Panels → `SectionCard` (Instructions, Muscles, Equipment, Media, …). Remove the ghost Back button.
- [ ] **Step 4: New/Edit pages.** `PageHeader back={{label:"Back to Exercises", href:"/exercises"}}` (new) / `back={{label:"Back to Exercise", href:`/exercises/${id}`}}` (edit) + breadcrumbs. `exercise-form.tsx`, `exercise-edit-form.tsx`: section `Card`s → `SectionCard`; raw classes → tokens.
- [ ] **Step 5: Import forms.** `bulk-import-form.tsx` (18), `csv-import-form.tsx` (3): raw → tokens; step/status chips → `StatusBadge`; progress bars → `bg-primary` on `bg-muted`.
- [ ] **Step 6: Verify.** tsc; eslint on all touched; palette (each touched file at 0). Hand off.

---

### Task 2: Inbox

**Files:** `app/(platform)/messages/page.tsx` (TrainerInbox), `components/messages/messages-inbox-client.tsx`, `components/messages/inbox-list.tsx`, `components/messages/message-thread.tsx`, `components/messages/client-context-panel.tsx`, `components/messages/mark-all-read-button.tsx` (variant only, if it exists under that name; otherwise the component that renders "Mark all as read"), `components/voice-memo/VoiceMemoPlayer.tsx`, `components/voice-memo/VoiceMemoRecorder.tsx`, `components/messages/voice-message-recorder.tsx`.

- [ ] **Step 1: Page frame.** TrainerInbox returns `<PageShell width="full" className="h-[calc(100dvh-4rem-3rem)]">` (64px top bar + 48px main padding) containing `<PageHeader title="Inbox" description="All messages, workout comments, and exercise feedback" primaryAction={<NewMessageDialog contacts={contacts} />} secondaryActions={<><MarkAllReadButton /><BroadcastMessageDialog contacts={contacts} /></>} />`. Make the New Message trigger filled and the other two `variant="outline"` (adjust those components' trigger buttons; do not touch dialog bodies). Unread count → a meta row under the header: `<StatusBadge status="unread" role="brand" dot={false} size="sm" label={`${unreadCount} unread`} />` plus the existing "Unread only ×" chip restyled as `StatusBadge role="neutral"` wrapped in the `Link`. The three-pane grid becomes `min-h-0 flex-1 … md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_280px] ring-1 ring-border shadow-none` (drop `border border-border shadow-sm`). Empty state → `EmptyState icon={MessageSquare} …` inside the flex-1 area.
- [ ] **Step 2: Client-role branch** (the return that already has `PageHeader`): its `PageShell` gets the same height class and its list/thread container the same ring treatment.
- [ ] **Step 3: Tokens.** `message-thread.tsx` (12), `VoiceMemoPlayer.tsx` (11), `VoiceMemoRecorder.tsx` (13), `voice-message-recorder.tsx` (2), `inbox-list.tsx` (1), `messages-inbox-client.tsx` (1): raw → tokens. Own bubbles `bg-primary text-primary-foreground`, other bubbles `bg-muted`, internal notes `bg-warning-soft border-warning-border text-warning-foreground` with an eyebrow label, recording red → `bg-danger`/`text-danger`.
- [ ] **Step 4: Verify.** tsc; eslint; palette (all at 0). Hand off.

---

### Task 3: Nutrition (trainer roster + client detail)

**Files:** `lib/services/nutrition.service.ts` (`getRosterAdherenceSnapshot` adds `email`), `components/nutrition/client-roster-adherence.tsx`, `app/(platform)/nutrition/page.tsx` (TrainerNutritionView; the client view is Phase 5), `app/(platform)/nutrition/[clientId]/page.tsx`, `components/nutrition/meals-table.tsx`, `components/nutrition/water-tracker.tsx`, `components/nutrition/weekly-review-card.tsx`, `components/nutrition/ai-summary-card.tsx`, `components/nutrition/nutrition-trend-charts.tsx`, `components/nutrition/nutrition-target-form.tsx`.

- [ ] **Step 1: Data.** In `getRosterAdherenceSnapshot`, include `email` in the per-client selection and returned row type. Add a unit test only if a test file for this service exists; otherwise rely on tsc.
- [ ] **Step 2: Roster → DataList.** Rewrite `client-roster-adherence.tsx` as a server-compatible `DataList`:
  columns `Client` (Avatar `size-8` with `AvatarImage` + `AvatarFallback` initials via `getInitials`, name via `getDisplayName`, sub-line `N meals today`), `7-day` (right, `tabular-nums`, colored via `adherenceRole(pct)` → `text-success`/`text-warning-foreground`/`text-danger-foreground`/`text-muted-foreground`), `Today` (same), `rowHref={(c) => `/nutrition/${c.clientId}`}`, `emptyState={<EmptyState size="compact" icon={UtensilsCrossed} title="No clients yet" />}`. Delete the hand-rolled header/rows and `adherenceColor`.
- [ ] **Step 3: Trainer view page.** `<PageShell><PageHeader title="Client Nutrition" description={`${getTodayLabel()} — today's adherence at a glance`} /><ClientRosterAdherence …/></PageShell>`.
- [ ] **Step 4: Client detail (`/nutrition/[clientId]`).** `<PageShell>` + `<PageHeader breadcrumb={[{label:"Nutrition",href:"/nutrition"},{label:clientName}]} title={clientName} description={date label} primaryAction={goals/targets dialog trigger if present} />`; every `rounded-xl p-4 ring-1 ring-border/50 shadow-sm` wrapper → `SectionCard` with a title, or `ring-1 ring-border` with no shadow where the child already has a header. Tabs (if any) → line variant via `PageHeader tabs`.
- [ ] **Step 5: Tokens.** `meals-table.tsx` (8), `water-tracker.tsx` (6), `weekly-review-card.tsx` (2), `ai-summary-card.tsx` (2), `nutrition-trend-charts.tsx` (2), `nutrition-target-form.tsx` (1): raw → tokens (water blue → `info`, adherence greens/ambers/reds → success/warning/danger).
- [ ] **Step 6: Verify.** tsc; eslint; palette. Hand off.

---

### Task 4: Analytics, Settings (organization), Audit Log, Billing

**Files:** `app/(platform)/analytics/page.tsx`, `components/analytics/business-metrics-charts.tsx` (colors only), `components/settings/organization-profile-form.tsx`, `app/(platform)/settings/audit-log/page.tsx`, `components/audit-log/audit-log-table.tsx`, `app/(platform)/settings/billing/page.tsx`, `components/billing/subscription-status.tsx`, `components/billing/pricing-cards.tsx`.

- [ ] **Step 1: Analytics.** Stat cards get roles: Revenue `brand`, New Clients `info`, Retention `success`, Average Attendance `info`, Programs Sold `neutral`. The two chart `Card`s → `<SectionCard title="New clients per month" icon={Users}>` / `<SectionCard title="Average attendance per month" icon={CalendarCheck}>`. The "no organization" notice → `EmptyState size="compact"`. Chart stroke/fill colors must reference `var(--chart-1)`…`var(--chart-5)` or role vars, not hex.
- [ ] **Step 2: Organization settings form.** `organization-profile-form.tsx`: wrap groups in `FormSection` ("Organization details", "Contact", "Program exercise library") and each field in `FormField` (label, hint, error from the form state). Keep react-hook-form wiring and the Save button (filled, right-aligned in a footer row).
- [ ] **Step 3: Audit Log.** `audit-log-table.tsx` → `DataList` (columns: When, Actor, Action as `StatusBadge` with `role` by verb — created/assigned `success`, updated `info`, deleted/archived `danger`, other `neutral` — Target, Details), `density="compact"`, `stickyHeader maxHeight="70vh"`, `emptyState={<EmptyState size="compact" icon={History} title="No activity yet" />}`. Page gets `PageToolbar` for any existing filters.
- [ ] **Step 4: Billing.** `settings/billing/page.tsx`: trial callout → `rounded-xl border border-info-border bg-info-soft p-5` with `text-info-foreground`; payment-issue callout → `danger` equivalents; plan card → `SectionCard title="Current plan"` with `StatusBadge status={sub.status} size="sm"` (`ACTIVE`, `TRIALING`, `PAST_DUE`, `CANCELED`, `UNPAID` are mapped); "All plans include" → `SectionCard`. `subscription-status.tsx` (1), `pricing-cards.tsx` (6): tokens; the highlighted plan uses `ring-2 ring-primary`, not a palette color.
- [ ] **Step 5: Verify.** tsc; eslint; palette. Hand off.

---

### Task 5: Phase 4 verification (controller)

- [ ] tsc, full vitest, palette errors 0, `lint:palette` lower than Phase 3 end and not stale.
- [ ] Browser 1440px: `/exercises` (+ one detail, `/exercises/new`), `/messages` (three panes, header actions, unread chip), `/nutrition` (names visible, rows navigate) + one `/nutrition/<clientId>`, `/analytics`, `/settings/clinic`, `/settings/audit-log`, `/settings/billing`.
