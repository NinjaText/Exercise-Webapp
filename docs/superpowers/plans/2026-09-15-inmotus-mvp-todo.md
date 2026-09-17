# Inmotus RX MVP To-Do List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the six sections of the Inmotus RX engineer to-do list — client and trainer UI corrections, Program Builder set/exercise editing rework, a single Create Program entry point on the Client Profile, and a new Client Progress Overview modal.

**Architecture:** Almost every task edits existing React Server/Client components in a Next.js App Router codebase. Business logic goes in `lib/services/*.service.ts` and `lib/utils/*.ts` as **pure, exported functions** so it can be unit-tested; components stay thin. One new service (`client-progress.service.ts`) and one new util (`builder-view.ts`) are created. No database schema changes.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma (MongoDB), Tailwind, shadcn-style primitives in `components/ui/`, Vitest, `date-fns`, `react-big-calendar`, `@dnd-kit`.

**Spec:** `docs/superpowers/specs/2026-09-15-inmotus-mvp-todo-design.md`

## Global Constraints

- **Never run `git add` or `git commit`.** The repo owner reviews and commits all work themselves. Every task therefore ends with a verification step, not a commit step. Leave changes in the working tree.
- **Test environment is `node`, not jsdom.** `vitest.config.ts` sets `environment: 'node'` and no testing-library is installed. Do **not** write component render tests and do **not** add jsdom. Follow the existing convention: extract logic into exported pure functions and unit-test those (see `components/dashboard/__tests__/client-dashboard.test.ts`, which imports helpers from the component module).
- **Test command:** `npm test` (`vitest run`). Single file: `npx vitest run <path>`.
- **Path alias:** `@/` resolves to the repo root.
- **Prisma mocking in service tests:** `vi.mock("@/lib/prisma", () => ({ prisma: {} }))` at the top of the file, before importing the module under test. See `lib/services/__tests__/dashboard-insights.service.test.ts`.
- **Do not add these metrics to the Client Progress Overview:** Total Volume, Total Reps, Session Duration, Readiness. The spec excludes them explicitly even though the underlying fields exist.
- **Exact copy strings** (from the product doc, use verbatim): `Start Session`, `Start Workout`, `+ Create Program`, `View All`, `Focus`, `Workout Completion`, `Pain Level`, `Pain Level Trend`, `Recent Activity`, `Client Notes`.
- **On-Demand programs** (`schedulingType === "ON_DEMAND"`) are called **Resources** in the UI and are excluded from every adherence calculation. Reuse `getProgramSchedulingType()` from `@/lib/utils/program-scheduling` rather than comparing strings inline.

## File Structure

**Created**
| File | Responsibility |
|---|---|
| `lib/utils/builder-view.ts` | Pure Focus/View-All open-key resolution. No React. |
| `lib/utils/__tests__/builder-view.test.ts` | Tests for the above, incl. the no-data-loss invariant. |
| `lib/services/client-progress.service.ts` | Client Progress Overview data: pure computation + Prisma access. |
| `lib/services/__tests__/client-progress.service.test.ts` | Tests for the pure half. |
| `components/progress/client-progress-overview-dialog.tsx` | The modal shell: header, date range, panel layout. |
| `components/progress/pain-trend-chart.tsx` | Inline SVG line chart with 4W/8W/12W filters. |
| `components/programs/collapsed-exercise-row.tsx` | One-line collapsed summary for Focus mode. |

**Modified**
| File | Change |
|---|---|
| `components/programs/program-detail-view.tsx` | Tasks 1, 2 — Resource wording, hoisted Start Workout. |
| `app/(platform)/dashboard/page.tsx` | Task 3 — pass inbox threads to `ClientDashboard`. |
| `components/dashboard/client-dashboard.tsx` | Task 3 — render `DashboardInboxCard`. |
| `components/dashboard/ai-insights-card.tsx` | Task 4 — collapsible. |
| `components/programs/program-schedule-view.tsx` | Tasks 5, 7 — one-set default, all-day events. |
| `components/dashboard/week-workout-client-row.tsx` | Task 6 — M T W T F S S. |
| `components/programs/generate-program-form.tsx` | Task 8 — Resource day count. |
| `lib/services/dashboard-insights.service.ts` | Task 9 — `reason` on `PriorityAlert`. |
| `components/dashboard/todays-priorities-card.tsx` | Task 9 — render the reason. |
| `app/(platform)/clients/[id]/page.tsx` | Tasks 10, 14, 18 — tooltips, Create Program, progress entry. |
| `components/programs/program-builder.tsx` | Task 12 — Focus/View All. |
| `app/(platform)/programs/upload/page.tsx` | Task 13 — read `?clientId=`. |
| `components/programs/program-brief-upload.tsx` | Task 13 — `initialClientId` prop. |
| `app/(platform)/programs/new/page.tsx` | Task 13 — read `?clientId=`. |
| `components/programs/program-editor.tsx` | Task 13 — `assignClientId` prop. |
| `app/(platform)/programs/[id]/page.tsx` | Task 13 — read `?clientId=`. |
| `components/programs/assign-program-dialog.tsx` | Task 13 — `initialClientId` prop. |
| `components/dashboard/client-progress-overview-card.tsx` | Task 18 — open the modal. |

---

# Phase 1 — Strings and layout

Low-risk, isolated changes. Nothing here has a data dependency.

## Task 1: Resource wording on the program detail view

Implements spec §1.2 and §1.3.

**Files:**
- Modify: `components/programs/program-detail-view.tsx:457` (the `Day N` chip) and `:494` (the button label)

**Interfaces:**
- Consumes: `getProgramSchedulingType` from `@/lib/utils/program-scheduling` (already imported at `:58`); `isResource` (already computed at `:95`)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Hide the "Day N" chip for a single-workout Resource**

The chip currently renders unconditionally. Find this block (around line 455):

```tsx
<span className="text-xs font-medium text-muted-foreground bg-muted rounded-md px-2 py-0.5 shrink-0">
  Day {dayPos + 1}
</span>
```

Replace with a guarded version. `isResource` and `workouts` are already in scope in the component body:

```tsx
{!(isResource && workouts.length === 1) && (
  <span className="text-xs font-medium text-muted-foreground bg-muted rounded-md px-2 py-0.5 shrink-0">
    Day {dayPos + 1}
  </span>
)}
```

A Resource with several workouts keeps its `Day N` chips — the doc only asks to remove the word for a one-day program.

- [ ] **Step 2: Rename the start button**

Around line 494, change the label only. Leave the pending state text untouched:

```tsx
{startingWorkoutId === wId ? "Starting..." : "Start Session"}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors in `program-detail-view.tsx`.

Then `npm run dev`, sign in as a client, open a Resource program with one workout. Confirm: no `Day 1` chip, button reads `Start Session`. Open a multi-week scheduled program and confirm `Day 1`, `Day 2` chips are still present.

- [ ] **Step 4: Stop for review**

Do not commit. Report the two changed lines.

---

## Task 2: Hoist "Start Workout" above the calendar

Implements spec §1.1.

On the client's My Program view the only way to begin is a button buried in a workout row, below the Overview/Schedule tabs. Add one primary action above the tabs.

**Files:**
- Modify: `components/programs/program-detail-view.tsx` — add a helper above the component, render the button before the `<Tabs>` block (around line 367)

**Interfaces:**
- Consumes: the `sessions: Record<string, unknown>[]` prop (already on `ProgramDetailViewProps:66`); `toLocalCalendarDate` from `@/lib/utils/calendar-date` (already imported at `:50`)
- Produces: `pickStartableSession(sessions, now)` — exported from `components/programs/program-detail-view.tsx`, used by this task's test only

- [ ] **Step 1: Write the failing test**

Create `components/programs/__tests__/program-detail-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickStartableSession } from "../program-detail-view";

const NOW = new Date("2026-09-15T12:00:00Z");
const DAY = 1000 * 60 * 60 * 24;

function session(over: Record<string, unknown>) {
  return { id: "s1", scheduledDate: NOW, status: "SCHEDULED", ...over };
}

describe("pickStartableSession", () => {
  it("returns today's scheduled session when one exists", () => {
    const today = session({ id: "today", scheduledDate: NOW });
    const later = session({ id: "later", scheduledDate: new Date(NOW.getTime() + 2 * DAY) });
    expect(pickStartableSession([later, today], NOW)?.id).toBe("today");
  });

  it("falls back to the soonest future session", () => {
    const soon = session({ id: "soon", scheduledDate: new Date(NOW.getTime() + 1 * DAY) });
    const far = session({ id: "far", scheduledDate: new Date(NOW.getTime() + 5 * DAY) });
    expect(pickStartableSession([far, soon], NOW)?.id).toBe("soon");
  });

  it("ignores completed sessions", () => {
    const done = session({ id: "done", scheduledDate: NOW, status: "COMPLETED" });
    expect(pickStartableSession([done], NOW)).toBeNull();
  });

  it("ignores past sessions that were never completed", () => {
    const past = session({ id: "past", scheduledDate: new Date(NOW.getTime() - 3 * DAY) });
    expect(pickStartableSession([past], NOW)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(pickStartableSession([], NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/programs/__tests__/program-detail-view.test.ts`
Expected: FAIL — `pickStartableSession` is not exported.

- [ ] **Step 3: Implement the helper**

Add near the top of `components/programs/program-detail-view.tsx`, after the imports and before `interface ProgramDetailViewProps`:

```ts
/**
 * The session the client's primary "Start Workout" button should target:
 * today's if there is one, else the soonest upcoming. Completed and missed
 * sessions are never startable, and neither is anything already in the past.
 */
export function pickStartableSession(
  sessions: Record<string, unknown>[],
  now: Date
): Record<string, unknown> | null {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const candidates = sessions
    .filter((s) => {
      const status = s.status as string;
      if (status === "COMPLETED" || status === "MISSED") return false;
      const date = toLocalCalendarDate(s.scheduledDate as string | Date);
      return date.getTime() >= startOfToday.getTime();
    })
    .sort(
      (a, b) =>
        toLocalCalendarDate(a.scheduledDate as string | Date).getTime() -
        toLocalCalendarDate(b.scheduledDate as string | Date).getTime()
    );

  return candidates[0] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/programs/__tests__/program-detail-view.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Render the button above the tabs**

Inside the component body, after `equipmentNeeded` is computed (around line 201), add:

```tsx
const startableSession = !isTrainer && !isResource ? pickStartableSession(sessions, new Date()) : null;
```

Then in the JSX, immediately **before** the `{/* Tabs */}` comment and its `<Tabs defaultValue="overview">` (around line 367), insert:

```tsx
{startableSession && (
  <div className="rounded-xl border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <p className="text-sm font-semibold truncate">
        {((startableSession.workout as Record<string, unknown> | null)?.name as string) ?? "Next workout"}
      </p>
      <p className="text-xs text-muted-foreground">
        {format(toLocalCalendarDate(startableSession.scheduledDate as string | Date), "EEEE, MMM d")}
      </p>
    </div>
    <Button size="lg" className="shrink-0 font-semibold" asChild>
      <Link href={`/sessions/${startableSession.id as string}`}>
        <Play className="mr-2 h-4 w-4 fill-current" />
        Start Workout
      </Link>
    </Button>
  </div>
)}
```

`Button`, `Link`, `Play` and `format` are all already imported in this file.

- [ ] **Step 6: Verify**

Run: `npx vitest run components/programs/__tests__/program-detail-view.test.ts` — PASS.
Run: `npx tsc --noEmit` — no new errors.

In the browser as a client, open an assigned scheduled program: the Start Workout card appears above the Overview/Schedule tabs and links to the right session. Confirm a trainer viewing the same program does **not** see it, and that a Resource does not either.

- [ ] **Step 7: Stop for review**

Do not commit.

---

## Task 3: Inbox on the client dashboard

Implements spec §1.4. The threads are **already fetched** — this is wiring, not a new query.

**Files:**
- Modify: `app/(platform)/dashboard/page.tsx:130` region (client branch) and the `<ClientDashboard ... />` call at `:215`
- Modify: `components/dashboard/client-dashboard.tsx` — new prop + render

**Interfaces:**
- Consumes: `messageService.getInboxThreads(user.id)` — already called on the client branch at `page.tsx:130`; `DashboardInboxCard` from `@/components/dashboard/dashboard-inbox-card`, whose prop is `{ threads: InboxThread[] }`
- Produces: `ClientDashboardProps.inboxThreads`

- [ ] **Step 1: Add the prop to the component**

In `components/dashboard/client-dashboard.tsx`, add the import:

```tsx
import { DashboardInboxCard } from "@/components/dashboard/dashboard-inbox-card";
import type { getInboxThreads } from "@/lib/services/message.service";
```

Add to `interface ClientDashboardProps` (after `resources`):

```ts
  inboxThreads: Awaited<ReturnType<typeof getInboxThreads>>;
```

Add `inboxThreads` to the destructured parameter list in the function signature.

- [ ] **Step 2: Render the card**

In the JSX, immediately after `<QuickResourcesRow resources={resources} />`, insert:

```tsx
<DashboardInboxCard threads={inboxThreads} />
```

`DashboardInboxCard` contains no trainer-specific copy or links — it links to `/messages`, which clients can access — so it is used unchanged.

- [ ] **Step 3: Pass the data from the page**

In `app/(platform)/dashboard/page.tsx`, the client branch already destructures the result of `messageService.getInboxThreads(user.id)` around line 130 (it feeds `unreadTrainerMessage` at `:138`). Identify the variable holding that array — it is `inboxThreads` — and add it to the `<ClientDashboard ... />` props at `:215`:

```tsx
inboxThreads={inboxThreads}
```

If the local variable has a different name, pass that name; do **not** add a second `getInboxThreads` call.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — no new errors.
Run: `npx vitest run components/dashboard/__tests__/client-dashboard.test.ts` — still PASS (it only tests exported helpers, which are untouched).

In the browser as a client with at least one message thread: the Inbox card renders, the All/Messages/Workout/Exercise tabs filter, the unread badge matches, and "View all" goes to `/messages`.

- [ ] **Step 5: Stop for review**

Do not commit.

---

## Task 4: Make AI Insights collapsible

Implements spec §2.1.

**Files:**
- Modify: `components/dashboard/ai-insights-card.tsx` (currently 19 lines, a server component)

**Interfaces:**
- Consumes: `AiInsightsList` from `@/components/dashboard/ai-insights-list`; `Accordion`, `AccordionContent`, `AccordionItem`, `AccordionTrigger` from `@/components/ui/accordion`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Rewrite the card as a collapsible client component**

`AiInsightsList` is already a client component, so marking this file `"use client"` is safe. Replace the whole file:

```tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sparkles } from "lucide-react";
import { AiInsightsList } from "@/components/dashboard/ai-insights-list";

export function AiInsightsCard() {
  return (
    <Card>
      <CardContent className="p-0">
        <Accordion type="single" collapsible defaultValue="insights">
          <AccordionItem value="insights" className="border-0">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-primary" />
                <span className="text-base font-semibold">AI Insights</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <AiInsightsList />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
```

`defaultValue="insights"` keeps the card **open** on load, so nothing regresses for a trainer who never touches it. `collapsible` allows closing it.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — no new errors.

In the browser as a trainer: the AI Insights card renders expanded; clicking the header collapses it and the chevron rotates; clicking again re-expands and the list still loads. Confirm the sibling cards in the same 3-column grid (`Inbox`, `Client Progress Overview`) do not change height oddly when it collapses.

- [ ] **Step 3: Stop for review**

Do not commit.

---

## Task 5: Default new exercises to one set

Implements spec §3. `program-builder.tsx` already defaults to one set; the only violation is in the schedule view.

**Files:**
- Modify: `components/programs/program-schedule-view.tsx:1404`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Change the default**

At line 1404 the newly-added exercise seeds its set count from the library record:

```ts
const setCount = exercise.defaultSets ?? 3;
```

Replace with a constant, and update the comment above it (currently at `:1401-1402`, which claims the defaults are used) so it no longer contradicts the code:

```ts
// Every newly added exercise starts as a single set — the trainer adds Set 2
// and Set 3 deliberately. The library's `defaultSets` intentionally does not
// seed this; only reps/duration defaults still apply.
const setCount = 1;
```

Leave `targetReps` and `targetDuration` seeding from the library untouched — the doc only changes the set count.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors. Note `exercise.defaultSets` may now be flagged as unused *if* nothing else in the function reads it — check, and only remove the field from the destructure if the compiler complains.

In the browser as a trainer: open a program's Schedule tab, expand a workout block, add an exercise. The Sets field reads `1`. Confirm the Sets input still accepts manual increase to 2 and 3.

- [ ] **Step 3: Stop for review**

Do not commit.

---

# Phase 2 — Data-backed dashboard

## Task 6: Show week days as M T W T F S S

Implements spec §2.2.

**Files:**
- Modify: `components/dashboard/week-workout-client-row.tsx` — the day strip at the `hidden shrink-0 items-center gap-1 sm:flex` block

**Interfaces:**
- Consumes: `WeekDayDot` and `DayDotStatus`, both already exported from this file; `buildWeekDays()` in `week-workouts-card.tsx:71` produces a Monday-first 7-element array — do not change it
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add the initials constant**

Near `dayDotLabels` at the top of the file, add:

```ts
/**
 * Monday-first weekday initials, matching the order `buildWeekDays` emits.
 * Duplicate letters (T/T, S/S) are intentional — the product doc specifies
 * exactly "M T W T F S S".
 */
const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;
```

- [ ] **Step 2: Render initials above the dots**

Replace the existing day strip block:

```tsx
<div className="hidden shrink-0 items-center gap-1 sm:flex" aria-label="This week's workouts">
  {days.map((day) => (
    <span
      key={day.date.toISOString()}
      title={`${format(day.date, "EEE d MMM")} — ${dayDotLabels[day.status]}`}
      className={`h-2.5 w-2.5 rounded-full border ${dayDotStyles[day.status]}`}
    />
  ))}
</div>
```

with:

```tsx
<div className="hidden shrink-0 items-center gap-1.5 sm:flex" aria-label="This week's workouts">
  {days.map((day, i) => (
    <span
      key={day.date.toISOString()}
      title={`${format(day.date, "EEE d MMM")} — ${dayDotLabels[day.status]}`}
      className="flex w-4 flex-col items-center gap-1"
    >
      <span className="text-[9px] font-medium leading-none text-muted-foreground/70">
        {DAY_INITIALS[i]}
      </span>
      <span className={`h-2.5 w-2.5 rounded-full border ${dayDotStyles[day.status]}`} />
    </span>
  ))}
</div>
```

The `title` tooltip, the status colours and the `hidden sm:flex` responsive behaviour are all preserved. Indexing `DAY_INITIALS` by position is correct because `buildWeekDays` always returns exactly 7 entries starting Monday.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — no new errors.

In the browser as a trainer, on the "This Week's Workouts" card: each client row shows `M T W T F S S` with a status dot under each letter. Hovering a day still shows the date and status. Confirm the row does not wrap or overflow at a narrow desktop width, and that the strip is still hidden on mobile.

- [ ] **Step 4: Stop for review**

Do not commit.

---

## Task 7: Remove Time of Day from Program Details → Schedule

Implements spec §2.4.

The clock times come from `program-schedule-view.tsx:1118-1122`, which stamps every session at 9 AM so it lands on the hour grid. Structural mode already emits `allDay: true` events (`:1146`). Making session events all-day too removes clock times everywhere without touching the view set.

`handleEventDrop` (`:1156`) reads only the dropped **date** and passes it through `toUtcCalendarDate()`, discarding time — so drag-to-reschedule is unaffected.

**Files:**
- Modify: `components/programs/program-schedule-view.tsx:1113-1134` (the `events` memo)

**Interfaces:**
- Consumes: `ScheduleEvent.allDay?: boolean`, already declared at `:128`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Make session events all-day**

Replace the `hasSessions` branch of the `events` memo:

```ts
if (hasSessions) {
  return sessions.map((s) => {
    const overrideDate = sessionDateOverrides.get(s.id);
    const rawStart = overrideDate ?? toLocalCalendarDate(s.scheduledDate);
    // If the session has no meaningful time (midnight), show at 9 AM
    const start = new Date(rawStart);
    if (start.getHours() === 0 && start.getMinutes() === 0) {
      start.setHours(9, 0, 0, 0);
    }
    return {
      id: s.id,
      title: s.workout.name,
      start,
      end: new Date(start.getTime() + 60 * 60 * 1000),
      isSession: true,
      status: s.status,
      workout: s.workout,
      sessionId: s.id,
    };
  });
}
```

with:

```ts
if (hasSessions) {
  return sessions.map((s) => {
    const overrideDate = sessionDateOverrides.get(s.id);
    // Sessions are scheduled to a calendar DAY, never a clock time. Emitting
    // them as all-day events keeps them in the day-header strip and stops
    // react-big-calendar from placing them against the hour grid.
    const start = toLocalCalendarDate(overrideDate ?? s.scheduledDate);
    return {
      id: s.id,
      title: s.workout.name,
      start,
      end: start,
      allDay: true,
      isSession: true,
      status: s.status,
      workout: s.workout,
      sessionId: s.id,
    };
  });
}
```

Note `overrideDate` is already a `Date` from the drag handler; `toLocalCalendarDate` accepts both.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — no new errors.

In the browser as a trainer, open a program with generated sessions → Schedule tab. Check **all three views**:
- **Month** — sessions appear on the right dates, no times.
- **Week** — sessions sit in the all-day strip at the top; no `9:00 AM` label anywhere.
- **Day** — same; no hour placement.

Then drag a session to a different day and confirm the "Session rescheduled" toast appears and the date persists after refresh. This is the regression that matters most.

- [ ] **Step 3: Stop for review**

Do not commit. Report explicitly whether the hour gutter column is still visible — if react-big-calendar still renders an empty time column in Week/Day, say so, and note it as a follow-up rather than restricting the view set unilaterally.

---

## Task 8: Allow a Resource to have multiple days

Implements spec §2.3.

**Files:**
- Modify: `components/programs/generate-program-form.tsx:133-134` and the Days Per Week control at `:487-501`

**Interfaces:**
- Consumes: `isOnDemand` (`:113`), `daysPerWeek` / `setDaysPerWeek` (`:116`), `durationWeeks` (`:98`)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Stop forcing a Resource to one day**

At `:133-134`, replace:

```ts
// A resource is a single anytime session, so the AI planner is always asked
// for one week / one day regardless of what the (hidden) schedule inputs say.
const effectiveDurationWeeks = isOnDemand ? 1 : durationWeeks;
const effectiveDaysPerWeek = isOnDemand ? 1 : daysPerWeek;
```

with:

```ts
// A Resource has no schedule — no start date, no weekdays, always one "week".
// But it may bundle several standalone sessions, so the day count is the
// trainer's choice rather than a forced 1.
const effectiveDurationWeeks = isOnDemand ? 1 : durationWeeks;
const effectiveDaysPerWeek = daysPerWeek;
```

`preferredWeekdays` stays `[]` for a Resource — that logic at `:288` and `:321` is already correct and must not change.

- [ ] **Step 2: Show the day control for Resources with Resource-appropriate wording**

The Days Per Week `<select>` is wrapped in `{!isOnDemand && (...)}` at `:487`. Remove that guard so it always renders, and make the label reflect what it means for a Resource. Replace the wrapper and label:

```tsx
<div className="space-y-2">
  <Label>{isOnDemand ? "Number of Sessions" : "Days Per Week"}</Label>
  <select
    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    value={daysPerWeek}
    onChange={(e) => {
      const val = Number(e.target.value);
      setDaysPerWeek(val);
      setSelectedWeekdays((prev) => prev.slice(0, val));
    }}
  >
    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
      <option key={d} value={d}>
        {isOnDemand ? `${d} ${d === 1 ? "session" : "sessions"}` : `${d} ${d === 1 ? "day" : "days"}`}
      </option>
    ))}
  </select>
</div>
```

- [ ] **Step 3: Confirm the weekday picker stays hidden for Resources**

The "Select exactly N days" weekday picker around `:806-815` must remain hidden when `isOnDemand` — a Resource has no weekdays. Verify its existing guard still holds after Step 2; if the picker is not already wrapped in `{!isOnDemand && ...}`, wrap it.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — no new errors.

In the browser as a trainer, go to Generate Program, choose **Resource** scheduling:
- The control reads "Number of Sessions" and offers 1–7.
- No Start Date field, no weekday picker, no Program Duration field.
- Generate with 3 sessions and confirm the resulting Resource contains 3 workouts.
Then switch to **Scheduled** and confirm the control reverts to "Days Per Week" and the weekday picker reappears.

- [ ] **Step 5: Stop for review**

Do not commit.

---

## Task 9: Show the specific reason a priority item was flagged

Implements spec §2.5.

**Files:**
- Modify: `lib/services/dashboard-insights.service.ts` — `PriorityAlert` (`:41`), `ClientSnapshot` (`:73`), `buildPriorityAlerts` (`:215`), the feedback query (`:410`), the snapshot assembly (`:441`)
- Modify: `components/dashboard/todays-priorities-card.tsx` — render the reason
- Modify: `lib/services/__tests__/dashboard-insights.service.test.ts` — extend

**Interfaces:**
- Consumes: `ClientSnapshot`, `computeCompletionRate`, `computeVarianceBreakdown`, `getLastActivityAt`, `getLastCompletedAt` — all already in this module
- Produces: `PriorityAlert.reason: string` — a non-empty, human-readable evidence string on every alert. Task 9 is the only task that writes it.

**Note on the `pain_feedback` / `discomfort` reasons:** `ExerciseFeedback.planExerciseId` points at `PlanExercise`, a **V1** model, while sessions run on `WorkoutSessionV2`. Step 3 below therefore treats the exercise name as *optional* and falls back to a reason built from the comment alone. Do not assume the name resolves.

- [ ] **Step 1: Write the failing tests**

Append to `lib/services/__tests__/dashboard-insights.service.test.ts`. The existing `session()` and `snapshot()` helpers are already defined at the top of that file — reuse them, do not redefine.

```ts
describe("buildPriorityAlerts — reasons", () => {
  it("gives every alert a non-empty reason", () => {
    const alerts = buildPriorityAlerts(
      [
        snapshot({
          clientId: "c1",
          sessions: [
            session({ status: "COMPLETED", scheduledDate: daysAgo(3), completedAt: daysAgo(3) }),
            session({ status: "MISSED", scheduledDate: daysAgo(2) }),
            session({ status: "MISSED", scheduledDate: daysAgo(1) }),
          ],
          activeProgram: { id: "p1", name: "Knee Rehab", startDate: daysAgo(30), durationWeeks: 12 },
        }),
      ],
      NOW
    );
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.reason).toBeTruthy();
      expect(alert.reason.length).toBeGreaterThan(0);
    }
  });

  it("states the completion ratio for a low_completion alert", () => {
    const alerts = buildPriorityAlerts(
      [
        snapshot({
          sessions: [
            session({ status: "COMPLETED", scheduledDate: daysAgo(5), completedAt: daysAgo(5) }),
            session({ status: "MISSED", scheduledDate: daysAgo(4) }),
            session({ status: "MISSED", scheduledDate: daysAgo(3) }),
            session({ status: "MISSED", scheduledDate: daysAgo(2) }),
          ],
        }),
      ],
      NOW
    );
    const low = alerts.find((a) => a.kind === "low_completion");
    expect(low).toBeDefined();
    expect(low!.reason).toMatch(/1 of 4/);
  });

  it("names the exercise in a pain_feedback reason when one is known", () => {
    const alerts = buildPriorityAlerts(
      [
        snapshot({
          recentFeedback: [
            { rating: "PAINFUL", createdAt: daysAgo(1), comment: "sharp twinge", exerciseName: "Squat" },
          ],
        }),
      ],
      NOW
    );
    const pain = alerts.find((a) => a.kind === "pain_feedback");
    expect(pain!.reason).toContain("Squat");
    expect(pain!.reason).toContain("sharp twinge");
  });

  it("falls back to the comment alone when the exercise name is unknown", () => {
    const alerts = buildPriorityAlerts(
      [
        snapshot({
          recentFeedback: [
            { rating: "PAINFUL", createdAt: daysAgo(1), comment: "sore after", exerciseName: null },
          ],
        }),
      ],
      NOW
    );
    const pain = alerts.find((a) => a.kind === "pain_feedback");
    expect(pain!.reason).toContain("sore after");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/dashboard-insights.service.test.ts`
Expected: FAIL — `reason` does not exist on `PriorityAlert`, and `comment`/`exerciseName` are not on the feedback type.

- [ ] **Step 3: Widen the types**

In `lib/services/dashboard-insights.service.ts`, add `reason` to `PriorityAlert` (`:41`):

```ts
export interface PriorityAlert {
  clientId: string;
  clientName: string;
  severity: AlertSeverity;
  kind: AlertKind;
  message: string;
  /** Concrete evidence for why this was flagged, shown under the message. */
  reason: string;
  href: string;
}
```

Widen `ClientSnapshot.recentFeedback` (`:78`):

```ts
  recentFeedback: {
    rating: string;
    createdAt: Date;
    comment: string | null;
    /** Null when the feedback's V1 PlanExercise no longer resolves to an exercise. */
    exerciseName: string | null;
  }[];
```

- [ ] **Step 4: Build a reason for every alert**

In `buildPriorityAlerts`, add a `reason` to each of the eight `alerts.push({...})` calls. `computeCompletionRate` is already called at `:275` as `const { rate, scheduled } = ...` — widen that destructure to also take the completed count if the function returns one; if it does not, compute it locally with `snap.sessions.filter(s => s.status === "COMPLETED").length`.

Use exactly these reason strings:

```ts
// pain_feedback
reason: [painFeedback.exerciseName, painFeedback.comment]
  .filter(Boolean)
  .join(" — ") || "Reported pain on a recent exercise",

// no_sessions_started
reason: `${snap.activeProgram.name} started ${
  snap.activeProgram.startDate
    ? format(snap.activeProgram.startDate, "MMM d")
    : "with no start date"
} and has no completed sessions`,

// inactive
reason: `Last completed a workout ${daysSince} days ago`,

// discomfort
reason: [discomfort.exerciseName, discomfort.comment]
  .filter(Boolean)
  .join(" — ") || "Reported mild discomfort recently",

// low_completion
reason: `${completed} of ${scheduled} scheduled workouts completed in the last 14 days`,

// delayed_pattern
reason: `${variance.delayed} of ${
  variance.delayed + variance.onTime + variance.early
} workouts completed 2+ days after their scheduled date`,

// program_ending
reason: `${snap.activeProgram.name} ends ${format(endDate, "MMM d")}`,

// fully_completed
reason: `${scheduled} of ${scheduled} scheduled workouts completed`,
```

Import `format` from `date-fns` at the top of the service if it is not already imported.

- [ ] **Step 5: Supply the new feedback fields**

At `:410`, widen the `exerciseFeedback` query to select the comment and resolve the exercise name through the V1 relation:

```ts
prisma.exerciseFeedback.findMany({
  where: { clientId: { in: clientIds }, createdAt: { gte: feedbackStart } },
  select: {
    clientId: true,
    rating: true,
    createdAt: true,
    comment: true,
    planExercise: { select: { exercise: { select: { name: true } } } },
  },
  orderBy: { createdAt: "desc" },
}),
```

If `planExercise` has no `exercise` relation in `prisma/schema.prisma`, **do not invent one** — drop that part of the select and always pass `exerciseName: null`. Check the schema first.

Then at the `feedbackByClient` assembly (`:441`):

```ts
const feedbackByClient = new Map<string, ClientSnapshot["recentFeedback"]>();
for (const f of recentFeedback) {
  const list = feedbackByClient.get(f.clientId) ?? [];
  list.push({
    rating: f.rating,
    createdAt: f.createdAt,
    comment: f.comment ?? null,
    exerciseName: f.planExercise?.exercise?.name ?? null,
  });
  feedbackByClient.set(f.clientId, list);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/dashboard-insights.service.test.ts`
Expected: PASS — the new describe block plus every pre-existing test in the file. If pre-existing tests fail because their `snapshot()` fixtures lack the new feedback fields, update the shared `snapshot()` helper's defaults rather than each test.

- [ ] **Step 7: Render the reason**

In `components/dashboard/todays-priorities-card.tsx`, find where `alert.message` is rendered inside the accordion content and add the reason beneath it:

```tsx
<p className="mt-0.5 text-xs text-muted-foreground">{alert.reason}</p>
```

Match the surrounding element structure and spacing; do not restructure the card.

- [ ] **Step 8: Verify**

Run: `npm test` — full suite passes.
Run: `npx tsc --noEmit` — no new errors.

In the browser as a trainer with clients in varied states: every item in Today's Priorities shows a second, concrete line ("3 of 8 scheduled workouts completed in the last 14 days"), not a restatement of the headline.

- [ ] **Step 9: Stop for review**

Do not commit.

---

## Task 10: Client Profile tooltips

Implements spec §2.6.

**Files:**
- Modify: `app/(platform)/clients/[id]/page.tsx` — the Clinical Profile card (roughly `:141-215`)

**Interfaces:**
- Consumes: `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` from `@/components/ui/tooltip`; `Info` from `lucide-react`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add a small local helper**

This page is a server component and the tooltip primitives are client components, so extract the helper into its own client file. Create `components/clients/field-info.tsx`:

```tsx
"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * An inline info affordance for a Clinical Profile field. Rendered as a real
 * button so it is reachable by keyboard, not hover-only.
 */
export function FieldInfo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={`About ${label}`}
          className="ml-1 inline-flex align-middle text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <Info className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-xs">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Attach tooltips to the six fields**

Import `FieldInfo` into `app/(platform)/clients/[id]/page.tsx` and place one after each field's label, using this copy verbatim:

| Field | Tooltip copy |
|---|---|
| Pain Score | `Client's self-reported pain, 0 (none) to 10 (worst imaginable). Captured at intake and updated when the client logs a pain assessment.` |
| Primary Diagnosis | `The main condition this client's programming is built around. Drives AI program generation and exercise contraindication tagging.` |
| Secondary Diagnoses | `Additional conditions to account for when programming. Shown to the AI generator alongside the primary diagnosis.` |
| Limitations | `Movements or positions this client should avoid. Review these before assigning or generating a program.` |
| Comorbidities | `Co-occurring conditions that affect exercise tolerance, such as cardiovascular or metabolic conditions.` |
| Activity Level | `The client's baseline activity before starting this program. Used to set starting intensity.` |

Example for the Pain Score label:

```tsx
<span className="font-medium">
  Pain Score:
  <FieldInfo label="Pain Score">
    Client&apos;s self-reported pain, 0 (none) to 10 (worst imaginable). Captured at
    intake and updated when the client logs a pain assessment.
  </FieldInfo>
</span>
```

Apply the same pattern to the remaining five. Only add a tooltip to a field that is actually rendered — several are inside `&&` guards.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — no new errors.

In the browser as a trainer, open a client with a populated clinical profile. Each of the six fields shows an info icon; hovering shows the copy; **tabbing** to the icon and pressing Enter or Space also shows it. Confirm the tooltip does not clip at the card edge.

- [ ] **Step 4: Stop for review**

Do not commit.

---

# Phase 3 — Focus / View All

## Task 11: Pure view-mode logic

Implements the testable half of spec §4. Because the test environment is `node` with no testing-library, the open/collapse rules live in a pure module and are tested there.

**Files:**
- Create: `lib/utils/builder-view.ts`
- Test: `lib/utils/__tests__/builder-view.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces — Task 12 imports exactly these:
  - `type BuilderViewMode = "focus" | "all"`
  - `exerciseKey(workoutIdx: number, blockIdx: number, exerciseIdx: number): string`
  - `resolveOpenKeys(mode, openKeys, key, intent): Set<string>` where `intent` is `"select" | "toggle"`
  - `isExerciseOpen(mode: BuilderViewMode, openKeys: Set<string>, key: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/utils/__tests__/builder-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  exerciseKey,
  resolveOpenKeys,
  isExerciseOpen,
} from "../builder-view";

const A = exerciseKey(0, 0, 0);
const B = exerciseKey(0, 0, 1);
const C = exerciseKey(0, 1, 0);

describe("exerciseKey", () => {
  it("is unique per workout/block/exercise position", () => {
    expect(A).not.toBe(B);
    expect(B).not.toBe(C);
    expect(exerciseKey(0, 0, 0)).toBe(A);
  });
});

describe("resolveOpenKeys — focus mode", () => {
  it("selecting an exercise opens it and collapses the previous one", () => {
    const next = resolveOpenKeys("focus", new Set([A]), B, "select");
    expect([...next]).toEqual([B]);
  });

  it("toggling opens an additional exercise without collapsing others", () => {
    const next = resolveOpenKeys("focus", new Set([A]), B, "toggle");
    expect(next.has(A)).toBe(true);
    expect(next.has(B)).toBe(true);
  });

  it("toggling an already-open exercise closes just that one", () => {
    const next = resolveOpenKeys("focus", new Set([A, B]), B, "toggle");
    expect(next.has(A)).toBe(true);
    expect(next.has(B)).toBe(false);
  });

  it("selecting the already-open exercise leaves it open", () => {
    const next = resolveOpenKeys("focus", new Set([A]), A, "select");
    expect([...next]).toEqual([A]);
  });
});

describe("resolveOpenKeys — view all mode", () => {
  it("leaves the open set untouched, since everything renders expanded", () => {
    const before = new Set([A]);
    const next = resolveOpenKeys("all", before, B, "select");
    expect([...next]).toEqual([...before]);
  });
});

describe("isExerciseOpen", () => {
  it("is true for every exercise in view-all mode", () => {
    expect(isExerciseOpen("all", new Set(), C)).toBe(true);
  });

  it("is true in focus mode only for keys in the open set", () => {
    expect(isExerciseOpen("focus", new Set([A]), A)).toBe(true);
    expect(isExerciseOpen("focus", new Set([A]), B)).toBe(false);
  });

  it("never mutates the set it is given", () => {
    const open = new Set([A]);
    resolveOpenKeys("focus", open, B, "select");
    expect([...open]).toEqual([A]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/utils/__tests__/builder-view.test.ts`
Expected: FAIL — cannot resolve `../builder-view`.

- [ ] **Step 3: Implement**

Create `lib/utils/builder-view.ts`:

```ts
/**
 * Open/collapse rules for the Program Builder's Focus and View All modes.
 *
 * Deliberately pure and React-free: these functions decide only which
 * exercises are *visible*. They never touch program data, which is why
 * switching views cannot lose a trainer's entered prescription.
 */

export type BuilderViewMode = "focus" | "all";

/** How the trainer asked for an exercise to open. */
export type OpenIntent =
  /** Plain click — open this one, collapse the rest (Focus mode). */
  | "select"
  /** Chevron click — add or remove this one, leave the rest alone. */
  | "toggle";

/** Stable identity for an exercise at a position in the workout tree. */
export function exerciseKey(
  workoutIdx: number,
  blockIdx: number,
  exerciseIdx: number
): string {
  return `${workoutIdx}:${blockIdx}:${exerciseIdx}`;
}

/**
 * The next set of open exercise keys. Always returns a new Set; the input is
 * never mutated.
 */
export function resolveOpenKeys(
  mode: BuilderViewMode,
  openKeys: Set<string>,
  key: string,
  intent: OpenIntent
): Set<string> {
  // In View All everything is expanded already, so the open set is inert.
  if (mode === "all") return new Set(openKeys);

  if (intent === "select") return new Set([key]);

  const next = new Set(openKeys);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

/** Whether an exercise renders its full editing body. */
export function isExerciseOpen(
  mode: BuilderViewMode,
  openKeys: Set<string>,
  key: string
): boolean {
  return mode === "all" || openKeys.has(key);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/utils/__tests__/builder-view.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Stop for review**

Do not commit.

---

## Task 12: Wire Focus / View All into the Program Builder

Implements the UI half of spec §4.

`components/programs/program-builder.tsx` currently renders every exercise fully expanded — notes `Textarea` + `SetEditor`, around `:1113-1133`. At 1240 lines it is already large, so the collapsed summary goes in its own file.

**Files:**
- Create: `components/programs/collapsed-exercise-row.tsx`
- Modify: `components/programs/program-builder.tsx`

**Interfaces:**
- Consumes from Task 11: `exerciseKey`, `resolveOpenKeys`, `isExerciseOpen`, `type BuilderViewMode` from `@/lib/utils/builder-view`
- Consumes: `ExerciseSetInput` from `@/lib/validators/program` (already imported in the builder)
- Produces: `summarizePrescription(sets: ExerciseSetInput[]): string`, exported from `collapsed-exercise-row.tsx`

- [ ] **Step 1: Write the failing test for the summary**

Create `components/programs/__tests__/collapsed-exercise-row.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizePrescription } from "../collapsed-exercise-row";

const set = (over: Record<string, unknown> = {}) => ({
  orderIndex: 0,
  setType: "NORMAL",
  targetReps: 10,
  targetWeight: null,
  targetDuration: null,
  targetDistance: null,
  targetRPE: null,
  restAfter: null,
  ...over,
});

describe("summarizePrescription", () => {
  it("summarizes uniform rep sets as N × R", () => {
    expect(summarizePrescription([set(), set(), set()] as never)).toBe("3 × 10");
  });

  it("summarizes a single set without a multiplier", () => {
    expect(summarizePrescription([set()] as never)).toBe("1 × 10");
  });

  it("uses seconds for duration-based sets", () => {
    expect(
      summarizePrescription([set({ targetReps: null, targetDuration: 30 })] as never)
    ).toBe("1 × 30s");
  });

  it("falls back to a set count when prescriptions differ", () => {
    expect(
      summarizePrescription([set({ targetReps: 10 }), set({ targetReps: 8 })] as never)
    ).toBe("2 sets");
  });

  it("returns an empty string for no sets", () => {
    expect(summarizePrescription([] as never)).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/programs/__tests__/collapsed-exercise-row.test.ts`
Expected: FAIL — cannot resolve `../collapsed-exercise-row`.

- [ ] **Step 3: Implement the collapsed row**

Create `components/programs/collapsed-exercise-row.tsx`:

```tsx
"use client";

import { ChevronRight, GripVertical, Play } from "lucide-react";
import type { ExerciseSetInput } from "@/lib/validators/program";

/**
 * One-line prescription summary shown on a collapsed exercise in Focus mode.
 * Uniform sets collapse to "3 × 10"; mixed prescriptions fall back to a count
 * rather than a misleading first-set summary.
 */
export function summarizePrescription(sets: ExerciseSetInput[]): string {
  if (sets.length === 0) return "";

  const first = sets[0];
  const uniform = sets.every(
    (s) =>
      s.targetReps === first.targetReps &&
      s.targetDuration === first.targetDuration &&
      s.targetWeight === first.targetWeight
  );

  if (!uniform) return `${sets.length} sets`;

  const detail =
    first.targetDuration != null && first.targetDuration > 0
      ? `${first.targetDuration}s`
      : `${first.targetReps ?? 0}`;

  return `${sets.length} × ${detail}`;
}

export function CollapsedExerciseRow({
  name,
  sets,
  hasVideo,
  dragHandleProps,
  onSelect,
  onToggle,
}: {
  name: string;
  sets: ExerciseSetInput[];
  hasVideo: boolean;
  dragHandleProps: React.HTMLAttributes<HTMLElement>;
  /** Plain click — open this one and collapse the rest. */
  onSelect: () => void;
  /** Chevron click — open this one without collapsing the rest. */
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...dragHandleProps}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Expand ${name}`}
        className="text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="truncate text-sm font-medium">{name}</span>
        {hasVideo && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
            <Play className="h-2.5 w-2.5" />
            Video
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {summarizePrescription(sets)}
        </span>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/programs/__tests__/collapsed-exercise-row.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add view state to the builder**

In `components/programs/program-builder.tsx`, add the imports:

```tsx
import {
  exerciseKey,
  resolveOpenKeys,
  isExerciseOpen,
  type BuilderViewMode,
} from "@/lib/utils/builder-view";
import { CollapsedExerciseRow } from "./collapsed-exercise-row";
```

Inside `ProgramBuilder`, alongside the existing `useState` calls near `:138-148`:

```tsx
const [viewMode, setViewMode] = useState<BuilderViewMode>("focus");
const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
```

- [ ] **Step 6: Auto-open the first exercise added to a block**

In `addExerciseToBlock` (`:372`), after `onChange(next)` and before `setPickerOpen(false)`, open the newly added exercise so Focus mode never shows an all-collapsed block:

```tsx
const newIdx = block.exercises.length - 1;
const key = exerciseKey(workoutIdx, blockIdx, newIdx);
setOpenKeys((prev) => resolveOpenKeys("focus", prev, key, "select"));
```

- [ ] **Step 7: Add the Focus | View All toggle**

Render this once in the builder's toolbar area, above the workout list:

```tsx
<div className="mb-3 flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5 w-fit">
  {(["focus", "all"] as const).map((mode) => (
    <button
      key={mode}
      type="button"
      onClick={() => setViewMode(mode)}
      aria-pressed={viewMode === mode}
      className={cn(
        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
        viewMode === mode
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {mode === "focus" ? "Focus" : "View All"}
    </button>
  ))}
</div>
```

`cn` is already imported at `:52`.

- [ ] **Step 8: Branch the exercise body on open state**

In the exercise render (`:1113-1133`), the notes `Textarea` and `SetEditor` currently always render. Wrap the existing expanded body so it renders only when open, and render `CollapsedExerciseRow` otherwise.

Inside the `.map((ex, ei) => ...)` that renders exercises, compute:

```tsx
const key = exerciseKey(wi, bi, ei);
const open = isExerciseOpen(viewMode, openKeys, key);
const lib = exerciseLibrary.find((e) => e.id === ex.exerciseId);
```

Then render:

```tsx
{open ? (
  <>
    {/* the existing title row, Textarea and SetEditor, unchanged */}
  </>
) : (
  <CollapsedExerciseRow
    name={getExerciseName(ex.exerciseId, (ex as typeof ex & { _exerciseName?: string })._exerciseName)}
    sets={ex.sets}
    hasVideo={!!lib?.videoUrl && hasRealVideoUrl(lib.videoUrl)}
    dragHandleProps={exDragHandleProps}
    onSelect={() => setOpenKeys((prev) => resolveOpenKeys(viewMode, prev, key, "select"))}
    onToggle={() => setOpenKeys((prev) => resolveOpenKeys(viewMode, prev, key, "toggle"))}
  />
)}
```

**Critical:** move nothing out of the expanded body into local state. `SetEditor` and the notes `Textarea` are fully controlled and lift every keystroke to `onChange`, which is exactly why switching views cannot drop data. Do not add a draft buffer, a `defaultValue`, or an uncontrolled input.

- [ ] **Step 9: Add a collapse affordance to the expanded row**

So a trainer can close an exercise in Focus mode, add a chevron button to the expanded title row that calls the same toggle:

```tsx
<button
  type="button"
  onClick={() => setOpenKeys((prev) => resolveOpenKeys(viewMode, prev, key, "toggle"))}
  aria-label={`Collapse ${getExerciseName(ex.exerciseId, (ex as typeof ex & { _exerciseName?: string })._exerciseName)}`}
  className="text-muted-foreground hover:text-foreground"
>
  <ChevronDown className="h-4 w-4" />
</button>
```

`ChevronDown` is already imported at `:35`. In View All mode this button has no effect by design — `resolveOpenKeys` returns the set unchanged — so hide it when `viewMode === "all"`.

- [ ] **Step 10: Verify**

Run: `npm test` — full suite passes.
Run: `npx tsc --noEmit` — no new errors.

In the browser as a trainer at `/programs/new`, add a workout, a block, and four exercises:
- Only the last-added exercise is expanded; the other three show one-line summaries with correct `N × R`.
- Clicking a collapsed exercise's **name** opens it and collapses the previously open one.
- Clicking a collapsed exercise's **chevron** opens it *in addition to* the current one.
- Switching to **View All** expands all four on one sheet with all fields editable.
- Dragging to reorder works in both modes.
- **The data-loss check:** type `12` into a set's reps and a note into the textarea, switch Focus → View All → Focus, and confirm both values survived. Then save and confirm they persisted.

- [ ] **Step 11: Stop for review**

Do not commit.

---

# Phase 4 — Create Program from the Client Profile

## Task 13: Carry clientId through all three creation methods

Implements spec §5.2. `/programs/generate` already accepts `?clientId=` (`page.tsx:38` → `initialClientId`). The other two do not.

**Files:**
- Modify: `app/(platform)/programs/upload/page.tsx`, `components/programs/program-brief-upload.tsx`
- Modify: `app/(platform)/programs/new/page.tsx`, `components/programs/program-editor.tsx`
- Modify: `app/(platform)/programs/[id]/page.tsx`, `components/programs/program-detail-view.tsx`, `components/programs/assign-program-dialog.tsx`

**Interfaces:**
- Produces: `ProgramBriefUpload` gains `initialClientId?: string`; `ProgramEditor` gains `assignClientId?: string`; `AssignProgramDialog` gains `initialClientId?: string`; `ProgramDetailView` gains `initialAssignClientId?: string`. Task 14 relies on `/programs/upload?clientId=`, `/programs/new?clientId=` and `/programs/generate?clientId=` all working.

- [ ] **Step 1: Upload — accept and pre-select the client**

In `app/(platform)/programs/upload/page.tsx`, add a `searchParams` prop and read `clientId`:

```tsx
export default async function ProgramBriefUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  // ...existing body unchanged...
```

Pass it to the component: `<ProgramBriefUpload ... initialClientId={clientId} />`.

In `components/programs/program-brief-upload.tsx`, add `initialClientId?: string` to `interface Props` (`:71`), destructure it, and seed the existing assign-client state:

```tsx
const [assignClientId, setAssignClientId] = useState(initialClientId ?? "");
```

Find the current `useState` for `assignClientId` (it feeds `clientId: isTemplate ? null : assignClientId` at `:611`) and change only its initial value.

- [ ] **Step 2: Assign dialog — accept a pre-selected client**

In `components/programs/assign-program-dialog.tsx`, add to `interface Props`:

```ts
  /** Pre-selects a client, e.g. when arriving from that client's profile. */
  initialClientId?: string;
```

Destructure it in the component signature and seed the state at `:85`:

```tsx
const [clientId, setClientId] = useState(initialClientId ?? "");
```

- [ ] **Step 3: Program detail — forward the pre-selected client**

In `components/programs/program-detail-view.tsx`, add `initialAssignClientId?: string` to `ProgramDetailViewProps`, destructure it, and pass it to every `<AssignProgramDialog ... />` in the file as `initialClientId={initialAssignClientId}`.

In `app/(platform)/programs/[id]/page.tsx`, the `searchParams` type already has `{ assign?: string; workoutId?: string }`. Add `clientId?: string`, destructure it alongside `assign` and `workoutId`, and pass `initialAssignClientId={clientId}` to `<ProgramDetailView ... />`.

- [ ] **Step 4: Build-from-scratch — redirect into the assign flow**

In `components/programs/program-editor.tsx`, add `assignClientId?: string` to `interface Props` (`:72-93`) and destructure it in the signature at `:152`.

At `:313`, the create path currently redirects to the new program. Make it carry the client into the assign dialog:

```tsx
router.push(
  redirectTo ??
    (result.data?.id
      ? assignClientId
        ? `/programs/${result.data.id}?assign=1&clientId=${assignClientId}`
        : `/programs/${result.data.id}`
      : "/programs")
);
```

Leave `:324` and `:332` (the edit paths) unchanged.

In `app/(platform)/programs/new/page.tsx`, add `searchParams` and forward it:

```tsx
export default async function NewProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  // ...existing body unchanged...
```

and `<ProgramEditor ... assignClientId={clientId} />`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — no new errors.
Run: `npm test` — full suite passes.

In the browser as a trainer, visit each URL directly with a real client id:
- `/programs/generate?clientId=<id>` — client already selected (pre-existing behaviour, confirm unbroken).
- `/programs/upload?clientId=<id>` — the assign-to-client picker is pre-filled.
- `/programs/new?clientId=<id>` — build and save a program; you land on the new program with the assign dialog already open and that client selected.

- [ ] **Step 6: Stop for review**

Do not commit.

---

## Task 14: "+ Create Program" on the Client Profile

Implements spec §5.1. Depends on Task 13.

**Files:**
- Modify: `app/(platform)/clients/[id]/page.tsx` — the action row at `:113-137`

**Interfaces:**
- Consumes: `CreateProgramMenu` from `@/components/programs/create-program-menu`, whose props are `{ clientId?, onUseTemplate?, trigger, children }`; the `clientId`-aware routes from Task 13

- [ ] **Step 1: Confirm the menu already routes with clientId**

Read `components/programs/create-program-menu.tsx`. It builds `generateHref` with `clientId` but routes `/programs/new` and `/programs/upload` **without** it. Update those two items to carry the client:

```tsx
const newHref = clientId ? `/programs/new?clientId=${clientId}` : "/programs/new";
const uploadHref = clientId ? `/programs/upload?clientId=${clientId}` : "/programs/upload";
```

and use them in the two corresponding `DropdownMenuItem` `onClick` handlers.

- [ ] **Step 2: Add the button**

In `app/(platform)/clients/[id]/page.tsx`, add the imports:

```tsx
import { CreateProgramMenu } from "@/components/programs/create-program-menu";
import { Plus } from "lucide-react";
```

In the action row, add as the **first** and only primary-variant button, so it reads as the page's main action ahead of the outline-variant Message/Sessions/Outcomes:

```tsx
<CreateProgramMenu clientId={id} trigger={<Button size="sm" />}>
  <Plus className="mr-1 h-4 w-4" />
  Create Program
</CreateProgramMenu>
```

`CreateProgramMenu` is a client component and this page is a server component — that is fine, it is imported and rendered as a child, not called.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — no new errors.

In the browser as a trainer, open a client profile. The `Create Program` button sits with the header actions and opens a menu with all four options. Exercise each:
- **Generate with AI** → `/programs/generate` with the client pre-selected.
- **Start from scratch** → `/programs/new`; after saving, the assign dialog opens with the client selected.
- **Upload a program/document** → `/programs/upload` with the client pre-filled.
- **Use a template** → `/programs?tab=templates`.

- [ ] **Step 4: Stop for review**

Do not commit.

---

# Phase 5 — Client Progress Overview

## Task 15: Progress computation (pure functions)

Implements the computation half of spec §6.

**Files:**
- Create: `lib/services/client-progress.service.ts`
- Test: `lib/services/__tests__/client-progress.service.test.ts`

**Interfaces:**
- Produces — Tasks 16 and 17 depend on exactly these:

```ts
export interface ProgressSession {
  status: string;
  scheduledDate: Date;
  completedAt: Date | null;
  workoutName: string | null;
}
export interface PainPoint { value: number; recordedAt: Date }
export interface CompletionSummary {
  completed: number;
  scheduled: number;
  percent: number;
  /** Percentage-point change vs. the previous equal-length period; null when there is no prior data. */
  changeVsPrevious: number | null;
}
export interface PainSummary {
  baseline: number | null;
  latest: number | null;
  /** Percent change from baseline to latest; null when fewer than two points. */
  percentChange: number | null;
}
export function computeCompletion(current: ProgressSession[], previous: ProgressSession[]): CompletionSummary;
export function computePainSummary(points: PainPoint[]): PainSummary;
export function filterPainPointsByWeeks(points: PainPoint[], weeks: number, now: Date): PainPoint[];
export function pickRecentActivity(sessions: ProgressSession[], limit: number): ProgressSession[];
```

- [ ] **Step 1: Write the failing test**

Create `lib/services/__tests__/client-progress.service.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  computeCompletion,
  computePainSummary,
  filterPainPointsByWeeks,
  pickRecentActivity,
  type ProgressSession,
  type PainPoint,
} from "../client-progress.service";

const NOW = new Date("2026-09-15T12:00:00Z");
const DAY = 1000 * 60 * 60 * 24;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function s(status: string, daysBack: number, name = "Workout"): ProgressSession {
  return {
    status,
    scheduledDate: daysAgo(daysBack),
    completedAt: status === "COMPLETED" ? daysAgo(daysBack) : null,
    workoutName: name,
  };
}

describe("computeCompletion", () => {
  it("counts completed over scheduled and rounds the percentage", () => {
    const current = [s("COMPLETED", 3), s("COMPLETED", 2), s("MISSED", 1)];
    const result = computeCompletion(current, []);
    expect(result.completed).toBe(2);
    expect(result.scheduled).toBe(3);
    expect(result.percent).toBe(67);
  });

  it("reports the percentage-point change against the previous period", () => {
    const current = [s("COMPLETED", 3), s("COMPLETED", 2)];          // 100%
    const previous = [s("COMPLETED", 20), s("MISSED", 19)];          // 50%
    expect(computeCompletion(current, previous).changeVsPrevious).toBe(50);
  });

  it("returns a null change when there is no previous data", () => {
    expect(computeCompletion([s("COMPLETED", 1)], []).changeVsPrevious).toBeNull();
  });

  it("returns zeroes rather than NaN for an empty period", () => {
    const result = computeCompletion([], []);
    expect(result).toEqual({ completed: 0, scheduled: 0, percent: 0, changeVsPrevious: null });
  });
});

describe("computePainSummary", () => {
  const points: PainPoint[] = [
    { value: 7, recordedAt: daysAgo(28) },
    { value: 5, recordedAt: daysAgo(14) },
    { value: 2, recordedAt: daysAgo(1) },
  ];

  it("takes the earliest point as baseline and the latest as current", () => {
    const result = computePainSummary(points);
    expect(result.baseline).toBe(7);
    expect(result.latest).toBe(2);
  });

  it("computes the percent change from baseline to latest", () => {
    expect(computePainSummary(points).percentChange).toBe(-71);
  });

  it("is order-independent", () => {
    const shuffled = [points[2], points[0], points[1]];
    expect(computePainSummary(shuffled).baseline).toBe(7);
    expect(computePainSummary(shuffled).latest).toBe(2);
  });

  it("returns nulls when there are no points", () => {
    expect(computePainSummary([])).toEqual({ baseline: null, latest: null, percentChange: null });
  });

  it("returns a null percentChange for a single point", () => {
    const one = [{ value: 4, recordedAt: daysAgo(1) }];
    expect(computePainSummary(one)).toEqual({ baseline: 4, latest: 4, percentChange: null });
  });

  it("returns a null percentChange when the baseline is zero", () => {
    const fromZero = [
      { value: 0, recordedAt: daysAgo(10) },
      { value: 3, recordedAt: daysAgo(1) },
    ];
    expect(computePainSummary(fromZero).percentChange).toBeNull();
  });
});

describe("filterPainPointsByWeeks", () => {
  it("keeps only points inside the window", () => {
    const points: PainPoint[] = [
      { value: 8, recordedAt: daysAgo(60) },
      { value: 5, recordedAt: daysAgo(10) },
    ];
    expect(filterPainPointsByWeeks(points, 4, NOW)).toHaveLength(1);
    expect(filterPainPointsByWeeks(points, 12, NOW)).toHaveLength(2);
  });
});

describe("pickRecentActivity", () => {
  it("returns completed and missed sessions, newest first, capped at the limit", () => {
    const sessions = [s("COMPLETED", 5), s("MISSED", 1), s("SCHEDULED", 0), s("COMPLETED", 3)];
    const recent = pickRecentActivity(sessions, 3);
    expect(recent).toHaveLength(3);
    expect(recent[0].scheduledDate).toEqual(daysAgo(1));
    expect(recent.some((r) => r.status === "SCHEDULED")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/services/__tests__/client-progress.service.test.ts`
Expected: FAIL — cannot resolve `../client-progress.service`.

- [ ] **Step 3: Implement the pure functions**

Create `lib/services/client-progress.service.ts`:

```ts
/**
 * Data for the Client Progress Overview.
 *
 * The computation half is pure and exported for unit testing; the Prisma
 * access sits at the bottom of the file. The MVP deliberately omits total
 * volume, total reps, session duration and readiness — see the spec.
 */

export interface ProgressSession {
  status: string;
  scheduledDate: Date;
  completedAt: Date | null;
  workoutName: string | null;
}

export interface PainPoint {
  value: number;
  recordedAt: Date;
}

export interface CompletionSummary {
  completed: number;
  scheduled: number;
  percent: number;
  changeVsPrevious: number | null;
}

export interface PainSummary {
  baseline: number | null;
  latest: number | null;
  percentChange: number | null;
}

const DAY_MS = 1000 * 60 * 60 * 24;

function percentOf(completed: number, scheduled: number): number {
  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}

export function computeCompletion(
  current: ProgressSession[],
  previous: ProgressSession[]
): CompletionSummary {
  const completed = current.filter((s) => s.status === "COMPLETED").length;
  const scheduled = current.length;
  const percent = percentOf(completed, scheduled);

  let changeVsPrevious: number | null = null;
  if (previous.length > 0) {
    const prevPercent = percentOf(
      previous.filter((s) => s.status === "COMPLETED").length,
      previous.length
    );
    changeVsPrevious = percent - prevPercent;
  }

  return { completed, scheduled, percent, changeVsPrevious };
}

export function computePainSummary(points: PainPoint[]): PainSummary {
  if (points.length === 0) {
    return { baseline: null, latest: null, percentChange: null };
  }

  const sorted = [...points].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
  );
  const baseline = sorted[0].value;
  const latest = sorted[sorted.length - 1].value;

  // A single reading has no trend, and a zero baseline makes percent change
  // meaningless (divide by zero) rather than infinite.
  const percentChange =
    sorted.length < 2 || baseline === 0
      ? null
      : Math.round(((latest - baseline) / baseline) * 100);

  return { baseline, latest, percentChange };
}

export function filterPainPointsByWeeks(
  points: PainPoint[],
  weeks: number,
  now: Date
): PainPoint[] {
  const cutoff = now.getTime() - weeks * 7 * DAY_MS;
  return points.filter((p) => p.recordedAt.getTime() >= cutoff);
}

export function pickRecentActivity(
  sessions: ProgressSession[],
  limit: number
): ProgressSession[] {
  return sessions
    .filter((s) => s.status === "COMPLETED" || s.status === "MISSED")
    .sort((a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime())
    .slice(0, limit);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/services/__tests__/client-progress.service.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Stop for review**

Do not commit.

---

## Task 16: Progress data access

Adds the Prisma half of spec §6. Depends on Task 15.

**Files:**
- Modify: `lib/services/client-progress.service.ts` — append the loader

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`; the pure functions from Task 15
- Produces:

```ts
export interface ClientProgressReport {
  completion: CompletionSummary;
  pain: PainSummary;
  painPoints: PainPoint[];
  recentActivity: ProgressSession[];
  notes: { text: string; author: string; createdAt: Date; context: string | null }[];
}
export async function getClientProgressReport(
  clientId: string,
  range: { from: Date; to: Date }
): Promise<ClientProgressReport>;
```

- [ ] **Step 1: Check the scheduled-program filter before writing queries**

Open `lib/services/dashboard-insights.service.ts` and read the `SCHEDULED_PROGRAM_WHERE` constant. Resources (`ON_DEMAND`) must be excluded from completion, exactly as the dashboard does. Reuse the same filter shape — export it from the insights service if it is not already exported, rather than duplicating the literal.

- [ ] **Step 2: Append the loader**

Add to `lib/services/client-progress.service.ts`:

```ts
import { prisma } from "@/lib/prisma";

export interface ClientProgressReport {
  completion: CompletionSummary;
  pain: PainSummary;
  painPoints: PainPoint[];
  recentActivity: ProgressSession[];
  notes: { text: string; author: string; createdAt: Date; context: string | null }[];
}

function toProgressSessions(
  rows: { status: string; scheduledDate: Date; completedAt: Date | null; workout: { name: string | null } | null }[]
): ProgressSession[] {
  return rows.map((r) => ({
    status: r.status,
    scheduledDate: r.scheduledDate,
    completedAt: r.completedAt,
    workoutName: r.workout?.name ?? null,
  }));
}

export async function getClientProgressReport(
  clientId: string,
  range: { from: Date; to: Date }
): Promise<ClientProgressReport> {
  const spanMs = range.to.getTime() - range.from.getTime();
  const prevFrom = new Date(range.from.getTime() - spanMs);

  const sessionSelect = {
    status: true,
    scheduledDate: true,
    completedAt: true,
    workout: { select: { name: true } },
  } as const;

  const [currentRows, previousRows, painRows, feedbackRows] = await Promise.all([
    prisma.workoutSessionV2.findMany({
      where: {
        clientId,
        scheduledDate: { gte: range.from, lte: range.to },
        workout: { program: SCHEDULED_PROGRAM_WHERE },
      },
      select: sessionSelect,
      orderBy: { scheduledDate: "desc" },
    }),
    prisma.workoutSessionV2.findMany({
      where: {
        clientId,
        scheduledDate: { gte: prevFrom, lt: range.from },
        workout: { program: SCHEDULED_PROGRAM_WHERE },
      },
      select: sessionSelect,
    }),
    // Pain is a client-self-reported Assessment, not a session field.
    prisma.assessment.findMany({
      where: { clientId, assessmentType: "pain_level" },
      select: { value: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    // Client-authored feedback only. ClinicalNote is the TRAINER's SOAP note
    // and must never appear here.
    prisma.sessionFeedback.findMany({
      where: { clientId, comment: { not: null }, createdAt: { gte: range.from, lte: range.to } },
      select: { comment: true, rating: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const current = toProgressSessions(currentRows);

  // Every pain point ever logged — the trend chart applies its own 4W/8W/12W
  // window client-side, independent of the header's date range.
  const painPoints: PainPoint[] = painRows.map((p) => ({
    value: p.value,
    recordedAt: p.createdAt,
  }));

  // The summary's baseline is the earliest point INSIDE the selected range,
  // per the spec — not the earliest ever, which would report a baseline from
  // outside the period the trainer is looking at.
  const painInRange = painPoints.filter(
    (p) => p.recordedAt >= range.from && p.recordedAt <= range.to
  );

  return {
    completion: computeCompletion(current, toProgressSessions(previousRows)),
    pain: computePainSummary(painInRange),
    painPoints,
    recentActivity: pickRecentActivity(current, 5),
    notes: feedbackRows.map((f) => ({
      text: f.comment as string,
      author: "client",
      createdAt: f.createdAt,
      context: f.rating ?? null,
    })),
  };
}
```

Import `SCHEDULED_PROGRAM_WHERE` from the insights service per Step 1.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — no new errors. Pay attention to the Prisma select types; adjust `toProgressSessions`'s parameter type to match what Prisma actually returns rather than casting.
Run: `npx vitest run lib/services/__tests__/client-progress.service.test.ts` — still PASS. The mocked `prisma` is `{}`, so the loader is never called by these tests; that is intentional.

- [ ] **Step 4: Stop for review**

Do not commit. Report whether `ExerciseFeedback` and `SessionExerciseLog.clientNote` should also feed `notes` — the spec lists four client-authored sources and this task wires only `SessionFeedback`. If the other three are wanted, that is a follow-up task, not scope creep into this one.

---

## Task 17: The Client Progress Overview modal

Implements the UI of spec §6. Depends on Task 16.

**Files:**
- Create: `components/progress/client-progress-overview-dialog.tsx`
- Create: `components/progress/pain-trend-chart.tsx`

**Interfaces:**
- Consumes: `ClientProgressReport` and its sub-types from Task 16; `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from `@/components/ui/dialog`
- Produces — Task 18 renders these with exactly these props:
  - `ClientProgressOverviewDialog({ open: boolean, onOpenChange: (open: boolean) => void, clientId: string, clientName: string, report: ClientProgressReport | null, range: { from: Date; to: Date }, onRangeChange: (range: { from: Date; to: Date }) => void })` — `report: null` renders a loading state, so Task 18 may render the dialog before its data resolves.
  - `PainTrendChart({ points: PainPoint[], weeks: number, onWeeksChange: (weeks: number) => void, now?: Date })` — used internally by the dialog; Task 18 does not render it directly.

- [ ] **Step 1: Build the chart**

Read `components/progress/body-metric-chart.tsx` first — it is an existing inline-SVG chart in this codebase. Match its conventions (no charting dependency) where they differ from the scaffold below.

Create `components/progress/pain-trend-chart.tsx`:

```tsx
"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { filterPainPointsByWeeks, type PainPoint } from "@/lib/services/client-progress.service";

const WEEK_OPTIONS = [4, 8, 12] as const;

// Pain is always a 0–10 scale, so the axis is fixed. Auto-scaling would
// exaggerate a one-point change into a dramatic slope.
const Y_MAX = 10;
const W = 640;
const H = 180;
const PAD = { top: 8, right: 8, bottom: 24, left: 28 };

export function PainTrendChart({
  points,
  weeks,
  onWeeksChange,
  now = new Date(),
}: {
  points: PainPoint[];
  weeks: number;
  onWeeksChange: (weeks: number) => void;
  now?: Date;
}) {
  const visible = filterPainPointsByWeeks(points, weeks, now).sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
  );

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const first = visible[0]?.recordedAt.getTime() ?? 0;
  const last = visible[visible.length - 1]?.recordedAt.getTime() ?? 1;
  const span = Math.max(last - first, 1);

  const x = (d: Date) => PAD.left + ((d.getTime() - first) / span) * plotW;
  const y = (v: number) => PAD.top + (1 - v / Y_MAX) * plotH;

  const path = visible.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.recordedAt)} ${y(p.value)}`).join(" ");

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold">Pain Level Trend</p>
          <p className="text-xs text-muted-foreground">Self-reported pain (0–10)</p>
        </div>
        <div className="flex gap-1">
          {WEEK_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onWeeksChange(w)}
              aria-pressed={weeks === w}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                weeks === w
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {w}W
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">No pain scores logged yet</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground/70">
            Pain scores appear here once the client records a pain assessment from their
            Assessments page.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label="Pain level over time">
            {[0, 5, 10].map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
                <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
                  {tick}
                </text>
              </g>
            ))}
            <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} />
            {visible.map((p) => (
              <circle key={p.recordedAt.toISOString()} cx={x(p.recordedAt)} cy={y(p.value)} r={3} fill="var(--primary)" />
            ))}
            {visible.length > 1 && (
              <>
                <text x={PAD.left} y={H - 6} className="fill-muted-foreground text-[9px]">
                  {format(visible[0].recordedAt, "MMM d")}
                </text>
                <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-muted-foreground text-[9px]">
                  {format(visible[visible.length - 1].recordedAt, "MMM d")}
                </text>
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
```

A single visible point renders as a lone dot with no line and no date labels — that is correct, not a bug to engineer around.

- [ ] **Step 2: Build the modal**

Create `components/progress/client-progress-overview-dialog.tsx`. Reuse the donut maths already in `components/dashboard/client-progress-overview-card.tsx:22-26` (`RADIUS`, `STROKE`, `CIRCUMFERENCE`, the `strokeDasharray` approach) rather than reinventing it.

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PainTrendChart } from "./pain-trend-chart";
import type { ClientProgressReport } from "@/lib/services/client-progress.service";

const RADIUS = 52;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Directional stat line. `goodDirection` differs per metric: rising completion
 * is good, rising pain is not — so the arrow colour is driven by intent, not
 * by the sign of the number.
 */
function Delta({ value, goodDirection }: { value: number | null; goodDirection: "up" | "down" }) {
  if (value === null) return null;
  const rising = value > 0;
  const good = goodDirection === "up" ? rising : !rising;
  const Icon = rising ? ArrowUp : ArrowDown;
  return (
    <span className={cn("flex items-center gap-1 text-sm font-semibold", good ? "text-success" : "text-red-600")}>
      <Icon className="h-4 w-4" />
      {Math.abs(value)}%
    </span>
  );
}

export function ClientProgressOverviewDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  report,
  range,
  onRangeChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  report: ClientProgressReport | null;
  range: { from: Date; to: Date };
  onRangeChange: (range: { from: Date; to: Date }) => void;
}) {
  const [weeks, setWeeks] = useState(4);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle className="text-xl font-bold">Client Progress Overview</DialogTitle>
              <p className="text-sm text-muted-foreground">{clientName}</p>
            </div>
            <RangePicker range={range} onChange={onRangeChange} />
          </div>
        </DialogHeader>

        {!report ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <CompletionCard completion={report.completion} />
              <PainCard pain={report.pain} />
            </div>

            <Card>
              <CardContent className="p-4 sm:p-5">
                <PainTrendChart points={report.painPoints} weeks={weeks} onWeeksChange={setWeeks} />
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <RecentActivityCard activity={report.recentActivity} clientId={clientId} />
              <ClientNotesCard notes={report.notes} clientId={clientId} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompletionCard({ completion }: { completion: ClientProgressReport["completion"] }) {
  const { completed, scheduled, percent, changeVsPrevious } = completion;
  const length = (percent / 100) * CIRCUMFERENCE;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <p className="mb-4 text-base font-semibold">Workout Completion</p>
        {scheduled === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No workouts scheduled in this period
          </p>
        ) : (
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <svg width={128} height={128} viewBox="0 0 128 128" className="-rotate-90">
                <circle cx={64} cy={64} r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
                <circle
                  cx={64}
                  cy={64}
                  r={RADIUS}
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth={STROKE}
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold tabular-nums">{percent}%</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums">
                {completed} of {scheduled}
              </p>
              <p className="text-sm text-muted-foreground">workouts completed</p>
              <div className="mt-2">
                <Delta value={changeVsPrevious} goodDirection="up" />
                {changeVsPrevious !== null && (
                  <p className="text-xs text-muted-foreground">vs. previous period</p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PainCard({ pain }: { pain: ClientProgressReport["pain"] }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <p className="mb-4 text-base font-semibold">Pain Level</p>
        {pain.latest === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No pain scores logged in this period
          </p>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-4xl font-bold tabular-nums">
                {pain.latest}
                <span className="text-xl font-normal text-muted-foreground"> / 10</span>
              </p>
              <div className="mt-2">
                {/* Falling pain is improvement, so "down" is the good direction. */}
                <Delta value={pain.percentChange} goodDirection="down" />
                {pain.percentChange !== null && (
                  <p className="text-xs text-muted-foreground">vs. start ({pain.baseline}/10)</p>
                )}
              </div>
            </div>
            <div className="shrink-0 space-y-1 text-sm">
              <p className="text-muted-foreground">
                Start: <span className="font-semibold text-foreground">{pain.baseline}/10</span>
              </p>
              <p className="text-muted-foreground">
                Latest: <span className="font-semibold text-foreground">{pain.latest}/10</span>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivityCard({
  activity,
  clientId,
}: {
  activity: ClientProgressReport["recentActivity"];
  clientId: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-semibold">Recent Activity</p>
          <Link href={`/clients/${clientId}/adherence`} className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No activity in this period</p>
        ) : (
          <div className="space-y-2">
            {activity.map((s) => {
              const done = s.status === "COMPLETED";
              return (
                <div key={`${s.scheduledDate.toISOString()}-${s.workoutName}`} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      done ? "bg-success" : "bg-red-500"
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5 text-white" /> : <X className="h-3.5 w-3.5 text-white" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{done ? "Completed workout" : "Missed workout"}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.workoutName ?? "Workout"}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(s.scheduledDate, "MMM d, yyyy")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClientNotesCard({
  notes,
  clientId,
}: {
  notes: ClientProgressReport["notes"];
  clientId: string;
}) {
  const latest = notes[0];
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-semibold">Client Notes</p>
          <Link href={`/clients/${clientId}/progress`} className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        {!latest ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No client notes in this period</p>
        ) : (
          <blockquote className="rounded-xl border border-border/60 p-3">
            <p className="text-sm">&ldquo;{latest.text}&rdquo;</p>
            <footer className="mt-2 text-xs text-muted-foreground">
              — {latest.author}, {format(latest.createdAt, "MMM d, yyyy")}
            </footer>
          </blockquote>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Build the range picker**

Add `RangePicker` to the same file — a small control offering Last 4 weeks / Last 8 weeks / Last 12 weeks, calling `onChange({ from, to })` with `to = new Date()`. Render the active range as `MMM d, yyyy – MMM d, yyyy`, matching the mockup's header pill. Keep it simple; a full calendar picker is not required by the spec.

**Do not add** total volume, total reps, session duration or readiness to any of these panels.

Note that every panel renders its own empty state, so one missing data source never blanks the modal.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — no new errors.
Run: `npm run lint` — no new errors.

The modal is not yet reachable; Task 18 wires it. Temporarily render it from a page with hand-written fixture data to check the layout at desktop and at ~400px width, then remove the temporary usage. Check specifically: a report with zero pain points, and one with a single pain point.

- [ ] **Step 5: Stop for review**

Do not commit.

---

## Task 18: Wire up both entry points

Completes spec §6. Depends on Task 17.

**Files:**
- Modify: `components/dashboard/client-progress-overview-card.tsx` — "View report"
- Modify: `app/(platform)/clients/[id]/page.tsx` — a progress button
- Create: a small client wrapper that owns the dialog's open state and fetches the report

**Interfaces:**
- Consumes: `getClientProgressReport` (Task 16), `ClientProgressOverviewDialog` (Task 17)

- [ ] **Step 1: Decide how the report reaches the client component**

`getClientProgressReport` is a server function and the dialog needs to refetch when the date range changes. Add a server action wrapping it — follow the existing pattern in `actions/` (see `actions/program-actions.ts` for the `{ success, data?, error? }` return shape this codebase uses consistently) — so the dialog can call it on range change.

Guard it: the caller must be a `TRAINER` and the client must belong to them. `getClientIdsForTrainer(user.id)` is the check used elsewhere (e.g. `app/(platform)/clients/[id]/progress/page.tsx:23-24`). Do not skip this — it is the only thing stopping one trainer reading another's client data.

- [ ] **Step 2: Open the modal from the dashboard**

In `components/dashboard/client-progress-overview-card.tsx:37`, "View report" is a `<Link href="/clients">`. The dashboard card is an aggregate across all clients, so there is no single client to report on. Change it to navigate to `/clients` **only if** no client is in context; otherwise open the modal.

Given the card shows a breakdown of all clients, the correct behaviour is: keep "View report" pointing at `/clients`, where each client's own progress is reachable. **Confirm this with the repo owner before changing it** — the doc says the dashboard's View report should open the overview, but the overview is per-client and this card is not. Report the conflict rather than guessing.

- [ ] **Step 3: Open the modal from the Client Profile**

This entry point is unambiguous — there is exactly one client in context. In `app/(platform)/clients/[id]/page.tsx`, add a button to the header action row that opens the dialog for this client, defaulting the range to the last 4 weeks:

```tsx
<Button variant="outline" size="sm">
  <TrendingUp className="mr-1 h-4 w-4" />
  Progress
</Button>
```

There is a commented-out Progress button at `:131-136` linking to `/clients/[id]/progress` — replace it with this, and leave the separate `/clients/[id]/progress` page intact as the "View all" destination for notes.

- [ ] **Step 4: Verify**

Run: `npm test` — full suite passes.
Run: `npx tsc --noEmit` — no new errors.
Run: `npm run lint` — no new errors.

In the browser as a trainer:
- Open a client profile → Progress → the modal opens with that client's real data.
- Change the date range → completion and its delta recalculate.
- Switch 4W / 8W / 12W → the trend chart rerenders; the header range is unaffected.
- "View all" under Recent Activity → `/clients/[id]/adherence`; under Client Notes → `/clients/[id]/progress`.
- Open it for a client with **no** pain assessments → the Pain Level and Pain Trend panels show empty states while Workout Completion and Recent Activity still render.
- Confirm no total volume, total reps, session duration or readiness appears anywhere.

- [ ] **Step 5: Stop for review**

Do not commit. Summarise the full change set across all 18 tasks and flag the Step 2 dashboard question.

---

## Self-Review Notes

**Spec coverage** — every numbered requirement maps to a task:

| Spec | Task |
|---|---|
| §1.1 Start Workout above calendar | 2 |
| §1.2 Resources drop "Day" | 1 |
| §1.3 "Start Session" | 1 |
| §1.4 Inbox on client dashboard | 3 |
| §2.1 AI Insights collapsible | 4 |
| §2.2 M T W T F S S | 6 |
| §2.3 Resource day count | 8 |
| §2.4 Remove Time of Day | 7 |
| §2.5 Flag reasons | 9 |
| §2.6 Client Profile tooltips | 10 |
| §3 One-set default | 5 |
| §4 Focus / View All | 11, 12 |
| §5.1 Create Program button | 14 |
| §5.2 clientId plumbing | 13 |
| §6 Client Progress Overview | 15, 16, 17, 18 |

**Known open questions**, surfaced rather than guessed:
1. **Task 18 Step 2** — the dashboard's "View report" sits on an all-clients aggregate card, but the Client Progress Overview is per-client. The doc asks for the former to open the latter; that needs a product decision.
2. **Task 16 Step 4** — `notes` currently draws only on `SessionFeedback`. The spec lists four client-authored sources.
3. **Task 9 Step 5** — whether `PlanExercise` resolves to an exercise name is unverified against real data; the plan degrades gracefully either way.
4. **Task 7 Step 3** — whether react-big-calendar still renders an empty hour column once events are all-day.
