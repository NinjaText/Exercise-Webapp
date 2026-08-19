# Dashboard Hero + Calendar UX Redesign — Design

## Context

Source: `Inmotus_RX_Client_Scheduling_and_AI_Workout_Logic_Engineer_Brief.docx`, brief §2-4 (dashboard hero, calendar/upcoming, program schedule) and §7/§12 (future-workout flexibility), decomposed during brainstorming for [[project_self_serve_funnel]]-adjacent client-scheduling work. This is sub-project **2a** of the original 6-way decomposition — the client-facing dashboard hero and its embedded calendar. Sub-project 2b (`components/programs/program-schedule-view.tsx` — the much larger, trainer+client-shared "My Programs" schedule view with its Today/arrows/Program-Week/W1-W2-pills/Month-Week-Day toolbar and hourly react-big-calendar grid) is a separate, later sub-project.

During brainstorming, the user chose to fold part of sub-project #4 (brief §7/§12, "future workout access: flexible, not locked") into this sub-project, since the only hard lock found lives in the calendar component this sub-project already touches. The user also chose to symmetrically unlock `MISSED` sessions (enabling `DELAYED` completions), since the data model (an earlier, already-completed sub-project) supports `DELAYED` as a valid outcome but nothing in the client UI could ever produce one.

### Existing state (verified before designing)

- `components/dashboard/client-dashboard.tsx` — the hero card's "no today" case renders "No Workouts for Today" as the dominant heading (exactly what brief §2 says to avoid), with no CTA — just a parenthetical next-session date and a motivational quote.
- `app/(platform)/dashboard/page.tsx` — queries `workout: { name, blocks: { exercises: { id } } }`; exercise count is already derivable (`blocks[].exercises.length` summed), but `estimatedMinutes` (which exists on the `Workout` model) is not selected.
- `components/dashboard/client-session-calendar.tsx` — month grid with tiny status dots; a day-detail panel above the grid already shows workout name + exercise count + Checklist/Full-Session action links for clickable days. `isClickable()` hard-blocks any future date (`isAfter(startOfDay(date), today) → false`) and only accepts `SCHEDULED`/`IN_PROGRESS` statuses — a `MISSED` session is never clickable at all.
- `components/workout/workout-session-tracker.tsx` — `handleStart` calls `startSessionV2Action` with no date check at all (no confirmation exists today for any case). Its initial "already active" state is computed as `session.status !== "SCHEDULED"` — which would misclassify a `MISSED` session as already-active instead of showing the pre-start screen. `startSessionV2Action` itself has no status precondition, so it already works correctly for a `MISSED` session once the UI stops preventing entry.
- `components/ui/alert-dialog.tsx` already exists (shadcn/base-ui pattern) — used for the new early-start confirmation, consistent with existing conventions.
- Workout names in this codebase are plain descriptive strings (e.g. "Lower Body A - Squat Focus") with no "Day N:" prefix — the brief's "Day 2: Upper Body + Shoulder Stability" format is composed from `dayIndex` (0-indexed) + `name`.

## Decisions

Confirmed with the user during brainstorming:

- **Scope split**: this sub-project (2a) = dashboard hero + embedded calendar only. The much larger `program-schedule-view.tsx` simplification is a separate sub-project (2b), not touched here.
- **Future-workout unlock**: fold into this sub-project rather than deferring to a later one, since the lock lives in a component already in scope here.
- **Missed-session unlock**: also fold in, symmetrically — a `MISSED` session becomes startable (producing `DELAYED`), same as a future session becomes startable early (producing `EARLY`). No confirmation dialog for the late case — only early starts get the "are you sure" prompt.
- **No separate "Upcoming" list view** in this sub-project — the existing month-grid + day-detail-panel pattern stays; a list view is left as a possible smaller follow-up.

## Design

### 1. Dashboard hero card (`client-dashboard.tsx`)

Both the "today" and "next" cases now show the same structure: an eyebrow label, a `Day {dayIndex + 1}: {workout.name}` line, a `~{estimatedMinutes} min • {exerciseCount} exercises` line, and a CTA.

- **Today** (`todayWorkout` present): eyebrow "TODAY'S WORKOUT" replaces the current date badge; CTA stays "START WORKOUT →" linking to `/sessions/{id}` exactly as today.
- **Next** (`todayWorkout` absent, `nextFutureSession` present): eyebrow "NEXT WORKOUT", a formatted date line (`format(scheduledDate, "EEEE, MMM d")`, e.g. "Tuesday, Aug 18"), then the same Day-N/duration/exercise-count line, CTA "VIEW WORKOUT →" linking to `/sessions/{id}`. This replaces the current "No Workouts for Today (next session DATE)" heading entirely — the "no workouts today" framing is removed, matching brief §2's explicit instruction not to make it the dominant message.
- **True empty** (neither present — no upcoming session at all): keep a calm fallback with the existing motivational quote, but drop the "No Workouts for Today" wording in favor of something like "Nothing scheduled right now" — this state is now clearly the exception, not the default framing for "no session today."
- **Data needed**: `estimatedMinutes` added to `dashboard/page.tsx`'s `workout` select (one field; already exists on the `Workout` model, no migration). `dayIndex` also needs adding to that same select (currently not selected). The `ClientDashboardProps` interface's `upcomingSessions`/`workout` shape gains `dayIndex: number` and `estimatedMinutes: number | null`.

### 2. Calendar unlock (`client-session-calendar.tsx`)

- `isClickable(date, daySessions)` simplifies to dropping the date check entirely and widening the accepted statuses: `daySessions.some(s => s.status === "SCHEDULED" || s.status === "IN_PROGRESS" || s.status === "MISSED")`.
- With this change, the existing `selectedIsClickable ? (Checklist/Full-Session links) : (Available on the scheduled date.)` branch's `false` arm becomes unreachable (the only other status is `COMPLETED`, already handled by the separate `isCompleted` branch above it) — simplify by removing the now-dead "Available on the scheduled date." branch and its surrounding conditional, leaving just `isCompleted ? (completed message) : (action links)`.
- `STATUS_DOT` gains a `MISSED` entry (a distinct muted color, e.g. `bg-slate-400`) so missed sessions are visually distinguishable in the month grid instead of falling through to the generic gray default; the legend row gains a matching "Missed" entry.
- The day cell's `isFutureDay && hasSession && "opacity-50"` dimming can stay — dimming a future day is a reasonable visual cue that it hasn't happened yet, distinct from making it unclickable.

### 3. Early-start confirmation (`workout-session-tracker.tsx`)

- Initial "already active" computation changes from `session.status !== "SCHEDULED"` to `!["SCHEDULED", "MISSED"].includes(session.status)`, so a `MISSED` session correctly shows the same pre-start "Begin Workout" screen as a `SCHEDULED` one, rather than being misread as already in progress.
- `handleStart` gains a date check: if `session.scheduledDate` (needs adding to this component's TypeScript prop type — the data already flows through from the page's Prisma query, which uses `include` and therefore already returns the scalar field; only the type declaration is missing) is after today's date, show an `AlertDialog` ("This workout is scheduled for {formatted date}. Start it today instead?" / STARTED TODAY button / CANCEL) before proceeding. Confirming calls the existing `startSessionV2Action` flow unchanged; canceling leaves the pre-start screen as-is. A `MISSED` session (scheduled date in the past) skips the dialog entirely and starts immediately — no confirmation needed for a late start, only an early one.

## Testing

- Unit/component tests for the hero card's three states (today / next / true-empty), asserting the correct eyebrow label, Day-N/name/duration/exercise-count line, and CTA target for each.
- Unit tests for the simplified `isClickable` (now status-only, no date check) covering `SCHEDULED`, `IN_PROGRESS`, `MISSED`, `COMPLETED`.
- Component test for `workout-session-tracker`'s initial active-state computation across `SCHEDULED`, `MISSED`, `IN_PROGRESS`, `COMPLETED`.
- Component test for the early-start confirmation: a future `scheduledDate` shows the `AlertDialog` and only calls `startSessionV2Action` after confirming; a past/today `scheduledDate` (including `MISSED`) calls it immediately with no dialog.

## Out of scope (deferred)

- `program-schedule-view.tsx` simplification (sub-project 2b) — the hourly-grid removal, week-based session list, and simplified `‹ Previous Week | Week 1 of 4 | Next Week ›` navigation described in brief §4.
- A separate "Upcoming" list view as an alternative to the month grid.
- Workout detail screen collapsing and progress-metrics changes (brief §5-6, a separate sub-project).
- AI adherence consumption of the scheduling data (brief §9-10) and coach-side reschedule/permission controls (brief §13) — separate sub-projects; the permission gap flagged in the data-model sub-project's final review remains tracked there, not addressed here.
