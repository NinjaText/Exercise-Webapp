# Dashboard Hero + Calendar UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the client dashboard's hero card and unlock the calendar so clients can start a future session early or a missed session late, with a confirmation only for early starts.

**Architecture:** Four small, independent surface changes: (1) one added Prisma select field feeding the dashboard hero, (2) the hero card itself redesigned around extracted pure helper functions, (3) the embedded calendar's clickability widened from "today/past + SCHEDULED/IN_PROGRESS only" to "any non-completed session," and (4) the workout tracker's pre-start screen gains an early-start confirmation via the existing shared `ConfirmDialog` component. No backend/service-layer or data-model changes — this sub-project is pure UI, built entirely on the scheduling data model an earlier sub-project already shipped.

**Tech Stack:** Next.js App Router, React Server/Client Components, Prisma (MongoDB), date-fns, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-dashboard-calendar-ux-design.md`

## Global Constraints

- This repo has **no component-rendering test infrastructure** (no `@testing-library/react`, no `jsdom`, `vitest.config.ts` uses `environment: 'node'`, zero existing `.test.tsx` files). Do not add one for this plan. Extract logic into plain, exported functions (same pattern as `computeScheduleVariance` in an earlier sub-project) and unit-test those directly via Vitest's node environment — importing a plain function from a `"use client"` `.tsx` file works fine as long as the test never renders a component. Actual visual/interaction verification happens by hand in a running dev server, not by an automated render test.
- `scheduledDate` is stored UTC-midnight-anchored; any comparison against "today" or formatting for display must go through `toLocalCalendarDate` from `lib/utils/calendar-date.ts` first, matching the existing convention (see that file's own doc comment).
- No changes to any backend service, server action business logic, or the Prisma schema — every change here is either a `select` addition or a client component.
- Workout names in this codebase are plain descriptive strings (e.g. "Lower Body A - Squat Focus") with no "Day N:" prefix — that prefix is always composed from `dayIndex` (0-indexed, so display as `dayIndex + 1`).
- Use the existing shared `components/shared/confirm-dialog.tsx` (`ConfirmDialog`) for the early-start confirmation — do not hand-roll a new `AlertDialog` usage.

---

### Task 1: Add `dayIndex`/`estimatedMinutes` to the dashboard query

**Files:**
- Modify: `app/(platform)/dashboard/page.tsx:104-118` (the `calendarSessions` query's `workout.select`)

**Interfaces:**
- Produces: `calendarSessions`/`upcomingSessions` session objects whose `workout` now includes `dayIndex: number` and `estimatedMinutes: number | null`, in addition to the existing `name` and `blocks`. Consumed by Task 2.

- [ ] **Step 1: Add the two fields to the query**

In `app/(platform)/dashboard/page.tsx`, update the `workout.select` block inside the `calendarSessions` query:

```ts
workout: {
  select: {
    name: true,
    dayIndex: true,
    estimatedMinutes: true,
    blocks: {
      select: {
        exercises: { select: { id: true } },
      },
    },
  },
},
```

(Only `dayIndex: true` and `estimatedMinutes: true` are new lines — everything else in this query is unchanged.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (`upcomingSessions`/`calendarSessions` are passed to `ClientDashboard`/`ClientSessionCalendar` via `as any` casts today, so this alone won't surface a type error — Task 2 adds the real type.)

- [ ] **Step 3: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 2: Redesign the dashboard hero card

**Files:**
- Modify: `components/dashboard/client-dashboard.tsx`
- Test: Create `components/dashboard/__tests__/client-dashboard.test.ts`

**Interfaces:**
- Consumes: the widened `workout` shape from Task 1 (`dayIndex`, `estimatedMinutes`, plus existing `name`/`blocks`).
- Produces: `export function formatDayLabel(...)`, `export function formatWorkoutMetaLine(...)`, `export function countExercises(...)` — plain functions, exported for the test file to import directly. Not consumed by any other task.

- [ ] **Step 1: Write the failing tests**

Create `components/dashboard/__tests__/client-dashboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatDayLabel, formatWorkoutMetaLine, countExercises } from '../client-dashboard'

describe('formatDayLabel', () => {
  it('composes "Day N: name" from a 0-indexed dayIndex', () => {
    expect(formatDayLabel({ dayIndex: 1, name: 'Upper Body + Shoulder Stability' })).toBe(
      'Day 2: Upper Body + Shoulder Stability'
    )
  })

  it('falls back to "Workout Session" when there is no workout', () => {
    expect(formatDayLabel(null)).toBe('Workout Session')
    expect(formatDayLabel(undefined)).toBe('Workout Session')
  })

  it('falls back to "Workout Session" when the workout has no name', () => {
    expect(formatDayLabel({ dayIndex: 0, name: null })).toBe('Day 1: Workout Session')
  })

  it('omits the "Day N:" prefix when dayIndex is missing', () => {
    expect(formatDayLabel({ name: 'Mobility Flow' })).toBe('Mobility Flow')
  })
})

describe('formatWorkoutMetaLine', () => {
  it('includes duration when estimatedMinutes is set', () => {
    expect(formatWorkoutMetaLine(40, 10)).toBe('~40 min • 10 exercises')
  })

  it('uses singular "exercise" for a count of 1', () => {
    expect(formatWorkoutMetaLine(15, 1)).toBe('~15 min • 1 exercise')
  })

  it('omits duration when estimatedMinutes is null', () => {
    expect(formatWorkoutMetaLine(null, 8)).toBe('8 exercises')
  })

  it('omits duration when estimatedMinutes is undefined', () => {
    expect(formatWorkoutMetaLine(undefined, 8)).toBe('8 exercises')
  })
})

describe('countExercises', () => {
  it('sums exercises across all blocks', () => {
    expect(
      countExercises({
        blocks: [{ exercises: [{ id: '1' }, { id: '2' }] }, { exercises: [{ id: '3' }] }],
      })
    ).toBe(3)
  })

  it('returns 0 for a null/undefined workout', () => {
    expect(countExercises(null)).toBe(0)
    expect(countExercises(undefined)).toBe(0)
  })

  it('returns 0 for a workout with no blocks', () => {
    expect(countExercises({ blocks: [] })).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/dashboard/__tests__/client-dashboard.test.ts`
Expected: FAIL — `formatDayLabel`/`formatWorkoutMetaLine`/`countExercises` are not exported yet.

- [ ] **Step 3: Implement the pure helpers and the widened props type**

In `components/dashboard/client-dashboard.tsx`, add near the top (below the existing `isSameLocalDay` helper):

```ts
export function formatDayLabel(
  workout?: { dayIndex?: number | null; name?: string | null } | null
): string {
  if (!workout) return "Workout Session";
  const dayLabel = workout.dayIndex != null ? `Day ${workout.dayIndex + 1}: ` : "";
  return `${dayLabel}${workout.name || "Workout Session"}`;
}

export function formatWorkoutMetaLine(
  estimatedMinutes: number | null | undefined,
  exerciseCount: number
): string {
  const exercisePart = `${exerciseCount} ${exerciseCount === 1 ? "exercise" : "exercises"}`;
  if (estimatedMinutes == null) return exercisePart;
  return `~${estimatedMinutes} min • ${exercisePart}`;
}

export function countExercises(
  workout?: { blocks: { exercises: { id: string }[] }[] } | null
): number {
  if (!workout) return 0;
  return workout.blocks.reduce((n, b) => n + b.exercises.length, 0);
}
```

Update the `ClientDashboardProps` interface's `upcomingSessions` field:

```ts
upcomingSessions: {
  id: string;
  scheduledDate: Date;
  status: string;
  workout?: {
    name?: string | null;
    dayIndex?: number | null;
    estimatedMinutes?: number | null;
    blocks: { exercises: { id: string }[] }[];
  } | null;
}[];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/dashboard/__tests__/client-dashboard.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Redesign the hero card JSX**

Add to the top-of-file imports:

```ts
import { format } from "date-fns";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
```

Replace the entire "Today's workout hero" block (currently the `{todayWorkout ? (...) : (...)}` conditional) with:

```tsx
{todayWorkout ? (
  <div className="relative overflow-hidden rounded-2xl bg-muted p-6 shadow-sm">
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Badge className="mb-3 border-border bg-background text-foreground text-xs font-medium uppercase tracking-wide">
          Today&apos;s Workout
        </Badge>
        <h2 className="text-xl font-bold text-foreground">{formatDayLabel(todayWorkout.workout)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatWorkoutMetaLine(todayWorkout.workout?.estimatedMinutes, countExercises(todayWorkout.workout))}
        </p>
      </div>
      <Button
        size="lg"
        className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-lg border-0"
        asChild
      >
        <Link href={`/sessions/${todayWorkout.id}`}>
          <Play className="mr-2 h-4 w-4 fill-current" />
          Start Workout
        </Link>
      </Button>
    </div>
  </div>
) : nextFutureSession ? (
  <div className="relative overflow-hidden rounded-2xl bg-muted p-6 shadow-sm">
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Badge className="mb-3 border-border bg-background text-foreground text-xs font-medium uppercase tracking-wide">
          Next Workout
        </Badge>
        <p className="text-sm font-medium text-muted-foreground">
          {format(toLocalCalendarDate(nextFutureSession.scheduledDate), "EEEE, MMM d")}
        </p>
        <h2 className="text-xl font-bold text-foreground">{formatDayLabel(nextFutureSession.workout)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatWorkoutMetaLine(nextFutureSession.workout?.estimatedMinutes, countExercises(nextFutureSession.workout))}
        </p>
      </div>
      <Button size="lg" variant="outline" className="shrink-0 font-semibold" asChild>
        <Link href={`/sessions/${nextFutureSession.id}`}>
          View Workout
          <ChevronRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  </div>
) : (
  <div className="relative overflow-hidden rounded-2xl bg-muted p-6 shadow-sm text-center">
    <CalendarX className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
    <h2 className="text-lg font-bold text-foreground">Nothing Scheduled Right Now</h2>
    <p className="mt-2 text-xs text-muted-foreground italic">{quote}</p>
  </div>
)}
```

`Calendar` (the icon import) may become unused after this change if nothing else in the file references it — check and remove it from the `lucide-react` import if so; keep `CalendarX`, `Play`, and add `ChevronRight` if not already imported (it's used elsewhere in this file for the "Recent Assessments" link, so it should already be imported — verify, don't duplicate the import).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — confirms nothing else broke.

- [ ] **Step 7: Manual verification (leave a note for the controller — do not skip)**

This is a UI change with no render-test coverage. Note in your report that the controller (or the user) should start the dev server and visually check all three hero states (today/next/empty) in a browser before this task is considered fully done — do not claim visual correctness yourself from reading the code alone.

- [ ] **Step 8: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 3: Widen calendar clickability to unlock future and missed sessions

**Files:**
- Modify: `components/dashboard/client-session-calendar.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by other tasks (Task 4 is independent of this one).

- [ ] **Step 1: Widen `STATUS_DOT` and simplify `isClickable`**

In `components/dashboard/client-session-calendar.tsx`, update `STATUS_DOT`:

```ts
const STATUS_DOT: Record<string, string> = {
  COMPLETED: "bg-emerald-500",
  IN_PROGRESS: "bg-amber-500",
  SCHEDULED: "bg-blue-500",
  MISSED: "bg-slate-400",
};
```

Replace the `isClickable` function and its call site. Current:

```ts
function isClickable(date: Date, daySessions: CalendarSession[]): boolean {
  // Only today or past dates with non-completed sessions
  if (isAfter(startOfDay(date), today)) return false;
  return daySessions.some((s) => s.status === "SCHEDULED" || s.status === "IN_PROGRESS");
}
```

With this widening, every non-`COMPLETED` status is now actionable regardless of date, and the day-detail panel's `isCompleted ? A : selectedIsClickable ? B : C` conditional collapses to just `isCompleted ? A : B` (there is no longer a reachable third case). So: delete the `isClickable` function and the `selectedIsClickable` variable entirely, and simplify the detail-panel branch. Change:

```ts
const selectedSessions = selectedDate ? getSessionsForDay(selectedDate) : [];
const selectedIsClickable = selectedDate ? isClickable(selectedDate, selectedSessions) : false;
```

to just:

```ts
const selectedSessions = selectedDate ? getSessionsForDay(selectedDate) : [];
```

And change:

```tsx
{isCompleted ? (
  <p className="text-xs text-emerald-600 font-medium">✓ Workout completed</p>
) : selectedIsClickable ? (
  <div className="grid grid-cols-2 gap-2">
    ...
  </div>
) : (
  <p className="text-xs text-muted-foreground">Available on the scheduled date.</p>
)}
```

to:

```tsx
{isCompleted ? (
  <p className="text-xs text-emerald-600 font-medium">✓ Workout completed</p>
) : (
  <div className="grid grid-cols-2 gap-2">
    ...
  </div>
)}
```

(Keep the inner `<div className="grid grid-cols-2 gap-2">...</div>` content — the two `Link`s to `?mode=checklist` and `?mode=session` — completely unchanged; only the surrounding conditional structure changes.)

- [ ] **Step 2: Add a "Missed" legend entry**

In the legend array near the bottom of the component:

```ts
{ color: "bg-blue-500", label: "Scheduled" },
{ color: "bg-amber-500", label: "In Progress" },
{ color: "bg-emerald-500", label: "Completed" },
```

add:

```ts
{ color: "bg-slate-400", label: "Missed" },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean — confirm `isAfter`/`startOfDay` imports from `date-fns` are still used elsewhere in the file (they are, for `isFutureDay`/`isCurrentDay` in the day-cell rendering) so nothing needs removing from the import line.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — no test in this repo currently covers this file directly, so this just confirms no regression elsewhere.

- [ ] **Step 5: Manual verification (leave a note for the controller — do not skip)**

Note in your report that the controller should verify in a browser: a future day with a scheduled session is now clickable and shows the Checklist/Full Session action links (not "Available on the scheduled date"), and a day with a missed session shows the same.

- [ ] **Step 6: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 4: Early-start confirmation in the workout tracker

**Files:**
- Modify: `components/workout/workout-session-tracker.tsx`
- Test: Create `components/workout/__tests__/workout-session-tracker.test.ts`

**Interfaces:**
- Consumes: `ConfirmDialog` from `@/components/shared/confirm-dialog` (existing component, unchanged).
- Produces: `export function isSessionStartable(status: string): boolean` and `export function isEarlyStart(scheduledDate: Date | string, now?: Date): boolean` — plain functions, exported for the test file. Not consumed by any other task.

- [ ] **Step 1: Write the failing tests**

Create `components/workout/__tests__/workout-session-tracker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isSessionStartable, isEarlyStart } from '../workout-session-tracker'

describe('isSessionStartable', () => {
  it('is true for SCHEDULED', () => {
    expect(isSessionStartable('SCHEDULED')).toBe(true)
  })

  it('is true for MISSED', () => {
    expect(isSessionStartable('MISSED')).toBe(true)
  })

  it('is false for IN_PROGRESS', () => {
    expect(isSessionStartable('IN_PROGRESS')).toBe(false)
  })

  it('is false for COMPLETED', () => {
    expect(isSessionStartable('COMPLETED')).toBe(false)
  })
})

describe('isEarlyStart', () => {
  it('is true when scheduledDate is a later calendar day than now', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const now = new Date('2026-08-18T15:00:00.000Z')
    expect(isEarlyStart(scheduledDate, now)).toBe(true)
  })

  it('is false when scheduledDate is today', () => {
    const scheduledDate = new Date('2026-08-18T00:00:00.000Z')
    const now = new Date('2026-08-18T15:00:00.000Z')
    expect(isEarlyStart(scheduledDate, now)).toBe(false)
  })

  it('is false when scheduledDate is in the past (a missed session)', () => {
    const scheduledDate = new Date('2026-08-10T00:00:00.000Z')
    const now = new Date('2026-08-18T15:00:00.000Z')
    expect(isEarlyStart(scheduledDate, now)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/workout/__tests__/workout-session-tracker.test.ts`
Expected: FAIL — `isSessionStartable`/`isEarlyStart` are not exported yet.

- [ ] **Step 3: Implement the pure helpers, the type fix, and the confirmation flow**

Add to the top-of-file imports:

```ts
import { isAfter, startOfDay } from "date-fns";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { formatDate } from "@/lib/utils/formatting";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
```

(`formatDate` from `lib/utils/formatting` is used for the confirmation dialog's display text, matching the "Aug 20, 2026" style already used elsewhere in this codebase. `isAfter`/`startOfDay`/`toLocalCalendarDate` are only needed inside `isEarlyStart`'s comparison logic, not for display — no `date-fns` `format` import is needed in this file.)

Add near the top of the file, below the existing small helper functions (`isCircuitBlock`, etc.):

```ts
export function isSessionStartable(status: string): boolean {
  return status === "SCHEDULED" || status === "MISSED";
}

export function isEarlyStart(scheduledDate: Date | string, now: Date = new Date()): boolean {
  return isAfter(toLocalCalendarDate(new Date(scheduledDate)), startOfDay(now));
}
```

Update the `WorkoutSessionV2` type (around line 71) to add `scheduledDate`:

```ts
type WorkoutSessionV2 = {
  id: string; status: string; scheduledDate: Date | string;
  workout: { id: string; name: string; blocks: WorkoutBlock[] };
  exerciseLogs: SessionExerciseLog[];
};
```

Update the `sessionActive` initial state (around line 258):

```ts
const [sessionActive, setSessionActive] = useState(!isSessionStartable(session.status));
```

Add a new piece of local state near it:

```ts
const [showEarlyStartConfirm, setShowEarlyStartConfirm] = useState(false);
```

In the pre-start screen's "Start Session" button (around line 549-557), change the `onClick`:

```tsx
<Button
  size="lg"
  className="mt-6 w-full"
  onClick={() => {
    if (isEarlyStart(session.scheduledDate)) setShowEarlyStartConfirm(true);
    else handleStart();
  }}
  disabled={isLoading}
>
```

(Everything else about this button — its children, `disabled` state — is unchanged.)

Add the confirmation dialog just before the closing `</div>` of the pre-start screen's outer wrapper (i.e., as a sibling to the `<div className="mx-auto max-w-lg">...</div>`, inside the same `return (...)` in the `if (!sessionActive)` block):

```tsx
<ConfirmDialog
  open={showEarlyStartConfirm}
  onOpenChange={setShowEarlyStartConfirm}
  title="Start early?"
  description={`This workout is scheduled for ${formatDate(session.scheduledDate)}. Start it today instead?`}
  confirmLabel="Start Today"
  cancelLabel="Cancel"
  onConfirm={() => {
    setShowEarlyStartConfirm(false);
    handleStart();
  }}
/>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/workout/__tests__/workout-session-tracker.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — confirms nothing else broke.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Manual verification (leave a note for the controller — do not skip)**

Note in your report that the controller should verify in a browser: opening a future-scheduled session and clicking "Start Session" shows the confirmation dialog with the correct date; confirming starts the session; canceling returns to the pre-start screen with nothing started. Opening a missed session's pre-start screen and clicking "Start Session" starts immediately with no dialog.

- [ ] **Step 8: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.
