# Inmotus RX — MVP UI/UX and Program-Building Updates

**Date:** 2026-09-15
**Source:** `Inmotus_RX_Engineer_To_Do_List_With_Images.docx` (6 sections + 3 reference screenshots)
**Status:** Approved design, pending implementation plan

## Purpose

Deliver the engineer to-do list from the product doc: a batch of client- and
trainer-facing UI corrections, a rework of how sets and exercises are edited in
the Program Builder, a single entry point for the three program-creation
methods, and one new read-only surface — the Client Progress Overview.

The doc is the requirements source. This spec records what already exists, what
the actual gap is, and the decisions made where the doc was ambiguous.

## What already exists

Several items in the doc are already built. Scoping them out is the single
biggest reduction in this work:

| Doc item | Reality |
|---|---|
| §3 "default every new exercise to ONE set" | `program-builder.tsx:386` already creates exactly one set |
| §3 "provide + Add Set" | `set-editor.tsx:22` `addSet()`, rendered at `:124` and `:246` |
| §5 Upload Program (PDF/Word/Excel → editable preview) | `program-brief-upload.tsx` (1063 lines) + `lib/services/program-brief.service.ts` |
| §5 "flag unmatched exercises for trainer review" | `flagUntraceableExercises()` in `program-brief.service.ts:772`, surfaced by `flagged-exercise-row.tsx` |
| §5 "one menu offering all three methods" | `create-program-menu.tsx` already lists Generate / Start from scratch / Upload / Template |
| §1 Inbox card | `dashboard-inbox-card.tsx` is role-agnostic and reusable as-is |

## Resolved ambiguities

Four items in the doc did not map onto anything in the codebase. Decisions
taken with the product owner on 2026-09-15:

1. **"Watch/Alerts"** → means the **Today's Priorities** card
   (`todays-priorities-card.tsx`, fed by `PriorityAlert`). Not a new clinical
   flagging engine.
2. **"Program Details → Schedule: Remove Time of Day"** → means the
   **react-big-calendar hour gutter** rendered by the Week/Day views in
   `program-schedule-view.tsx`.
3. **Pain data source** → existing `Assessment` rows where
   `assessmentType = "pain_level"` (unit `/10`, defined in
   `lib/utils/constants.ts:155`). Clients self-log these at `/assessments`.
   No schema change.
4. **Client Progress Overview presentation** → a **modal**, matching Reference
   C, opened from both the dashboard's "View report" and the Client Profile.

### Scope boundary on flag reasons

The doc's example reason — *"Loaded knee flexion >60°"* — is clinical. Every
existing `PriorityAlert` is adherence-derived (inactivity, completion rate,
schedule variance, pain feedback). `Exercise.contraindications` exists in the
schema but is never evaluated against a client's diagnosis.

This spec delivers **specific, evidence-backed adherence reasons**. Clinical
contraindication matching is explicitly out of scope and would be its own
feature.

## Section 1 — Client Experience

### 1.1 Start Workout above the calendar

`components/programs/program-detail-view.tsx`. On the client's My Program view,
the only way to start a session is a per-row button inside the workout list,
below the Overview/Schedule tabs. Hoist a single primary **Start Workout**
action above the tabs, targeting today's session, else the next upcoming one.
Per-row buttons remain for resources.

### 1.2 Resources: remove the word "Day"

`program-detail-view.tsx:457` renders a `Day {dayPos + 1}` chip on every workout
row. When the program's scheduling type is `ON_DEMAND` **and** it has a single
workout, omit the chip entirely and show only the workout name.

### 1.3 "Start Resource Session" → "Start Session"

`program-detail-view.tsx:494`. String change; the "Starting..." pending label is
unchanged.

### 1.4 Inbox on the client dashboard

`app/(platform)/dashboard/page.tsx` **already** calls
`messageService.getInboxThreads(user.id)` on the client branch (line 130) to
feed the trainer-message banner. Pass those same threads into `ClientDashboard`
and render `<DashboardInboxCard threads={...} />`. No new query, no new
component.

Placement: alongside the existing progress cards, above the secondary stats row.

## Section 2 — Trainer Dashboard

### 2.1 AI Insights collapsible

`components/dashboard/ai-insights-card.tsx`. Wrap the card body in a
collapsible, header acting as the trigger with a chevron. Default **open**, so
existing behaviour is unchanged for a trainer who never touches it. Follow the
Accordion pattern already used by `todays-priorities-card.tsx`.

### 2.2 Week days as M T W T F S S

`components/dashboard/week-workout-client-row.tsx`. The week strip currently
renders seven unlabelled 10px dots. Replace with seven small cells, each a
weekday initial above its status dot.

- Keep the Monday-start week (`buildWeekDays` in `week-workouts-card.tsx:71`).
- Keep `dayDotStyles`, `dayDotLabels` and the existing `title` tooltip.
- Duplicate initials (T/T, S/S) are expected and acceptable — the doc asks for
  exactly `M T W T F S S`.
- The strip is `hidden sm:flex`; that responsive behaviour stays.

### 2.3 Resources: allow the trainer to add days

`components/programs/generate-program-form.tsx:133-134`. An `ON_DEMAND` program
is currently pinned to `effectiveDurationWeeks = 1` and
`effectiveDaysPerWeek = 1`.

Allow a Resource to specify a **day count** (how many standalone sessions to
generate). A Resource still has no start date and no preferred weekdays — it is
unscheduled by definition, so `preferredWeekdays` stays `[]` and
`durationWeeks` stays `1`. Only the count of generated sessions becomes
configurable.

### 2.4 Remove Time of Day from Program Details → Schedule

`components/programs/program-schedule-view.tsx`. The Schedule tab uses
react-big-calendar, whose Week and Day views render an hour gutter. Restrict the
available views so no clock time is ever shown, treating every session as an
all-day event. Verify the toolbar (`:530`) and the week-jump pills still behave
once the view set changes.

### 2.5 Show the specific reason an item was flagged

Add `reason: string` to `PriorityAlert` (`lib/services/dashboard-insights.service.ts:41`)
and render it as a secondary line beneath `message` in `TodaysPrioritiesCard`.

Reason content by `AlertKind`:

| Kind | Reason |
|---|---|
| `low_completion` | "N of M scheduled workouts completed in the last 14 days" |
| `inactive` | Last completed workout name and date |
| `no_sessions_started` | Program name and its start date |
| `delayed_pattern` | "N of M completed 2+ days after their scheduled date" |
| `pain_feedback` | Exercise name + the client's own comment |
| `discomfort` | Exercise name + the client's own comment |
| `program_ending` | Program name and its end date |
| `fully_completed` | "N of N scheduled workouts completed" |

The two feedback kinds need data not currently selected: widen the
`exerciseFeedback.findMany` select at
`dashboard-insights.service.ts:410` to include `comment` and the related
exercise name. Every other reason is derivable from data already loaded into
`ClientSnapshot`.

`buildPriorityAlerts` is a pure function with existing test coverage — reasons
are unit-testable without touching the database.

### 2.6 Client Profile tooltips

`app/(platform)/clients/[id]/page.tsx`, Clinical Profile card.
`components/ui/tooltip.tsx` already exports `Tooltip`, `TooltipTrigger`,
`TooltipContent`, `TooltipProvider`.

Add an info affordance with explanatory copy to: Pain Score (what the 0–10
scale means and that it is client-self-reported), Primary/Secondary Diagnosis,
Limitations, Comorbidities, Functional Challenges, and Activity Level.

Tooltips must be keyboard-reachable, not hover-only.

## Section 3 — Sets

The only violation of "default every newly added exercise to ONE set" is
`components/programs/program-schedule-view.tsx:1404`:

```ts
const setCount = exercise.defaultSets ?? 3;
```

becomes a constant `1`. The library's `defaultSets` value stops seeding new
rows; the trainer adds Set 2 and Set 3 deliberately.

The inline schedule editor exposes `setCount` as a number input (`:889`), which
already satisfies "added only when needed". `program-builder.tsx` and
`set-editor.tsx` need no change.

## Section 4 — Focus / View All

The largest UI piece. `components/programs/program-builder.tsx` currently
renders **every** exercise fully expanded (notes textarea + `SetEditor`, around
`:1113-1133`), so a block of ten exercises is an unusable wall.

### Behaviour

New builder-local state:

```ts
const [viewMode, setViewMode] = useState<"focus" | "all">("focus");
const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
```

**Focus mode (default)**
- Only exercises in `openKeys` render notes + `SetEditor`.
- The first exercise added to a block opens automatically.
- A plain click on a collapsed exercise opens it and **clears** the others —
  the doc's "open that exercise and collapse the previously active exercise".
- The chevron affordance toggles one exercise without collapsing the rest,
  satisfying "the trainer must still be able to manually expand multiple".
- Collapsed rows show a one-line summary: name, prescription
  (`3 × 10`, or `3 × 30s` for duration), and the video badge.

**View All mode**
- `openKeys` is ignored; every exercise renders expanded on one continuous
  sheet with all programming fields.
- Drag-and-drop reordering is unaffected — it already operates on the row
  wrapper (`SortableExercise`), not the expanded body.

A `Focus | View All` segmented toggle sits in the builder toolbar.

### The no-data-loss invariant

"Switching views must never cause entered program information to be lost."

This is guaranteed **by construction**, not by save-on-switch: both modes render
from the same `workouts` prop and call the same `onChange`. `viewMode` and
`openKeys` control **visibility only**. No expanded body holds local draft state
— `SetEditor` and the notes `Textarea` are already fully controlled and lift
every keystroke to `onChange`.

The risk to guard against is a future refactor introducing a local buffer, so
this gets an explicit regression test (see Testing).

## Section 5 — Client Profile: Create Program

The pipeline is built; the **entry point** and **client pre-selection** are the
gap.

### 5.1 The button

Add one primary `+ Create Program` to the Client Profile header
(`app/(platform)/clients/[id]/page.tsx`, the action row at `:113-137`), wired to
`<CreateProgramMenu clientId={id} />`. Its four existing items — Generate,
Start from scratch, Upload, Use a template — are exactly the doc's methods.

### 5.2 Carrying clientId through all methods

The doc requires all methods to "ultimately enter the same Program Builder
editing/assignment workflow" with the client already in context. Current state:

| Route | Accepts `?clientId=` | Work needed |
|---|---|---|
| `/programs/generate` | Yes — `page.tsx:38` → `initialClientId` | None |
| `/programs/upload` | **No** | Add `searchParams.clientId`, add `initialClientId` prop to `ProgramBriefUpload`, seed its `assignClientId` state (`program-brief-upload.tsx:611`) |
| `/programs/new` | **No** | Add `searchParams.clientId`, thread through `ProgramEditor` to its assign step |

## Section 6 — Client Progress Overview

The one genuinely new subsystem. Matches Reference C.

### Presentation

A `<Dialog>` opened from two places, sharing one component:
- `client-progress-overview-card.tsx:37` — the dashboard "View report" link
  (currently navigating to `/clients`).
- The Client Profile header.

Header carries the client name and a **date-range selector**, defaulting to the
last 4 weeks.

### Data layer

New `lib/services/client-progress.service.ts`, with pure computation functions
separated from Prisma access so they are unit-testable.

**Workout Completion** — from `WorkoutSessionV2` for the client within range,
excluding `ON_DEMAND` resources (consistent with `SCHEDULED_PROGRAM_WHERE`,
already used throughout `dashboard-insights.service.ts`). Yields completed
count, scheduled count, percentage, and the delta against the immediately
preceding equal-length period.

**Pain Level** — `Assessment` rows where `assessmentType = "pain_level"`,
ordered by `createdAt`. Yields baseline (earliest in range), latest, and the
change as both points and percentage.

**Pain Trend** — the same rows as a series, with 4W / 8W / 12W filters
independent of the header's date range (as in the mockup).

**Recent Activity** — the last 5 completed or missed `WorkoutSessionV2` rows
with workout name and date. "View all" → `/clients/[id]/adherence`.

**Client Notes / Feedback** — must be **client-authored** text, as in the
mockup where the note is quoted and attributed to the client. `ClinicalNote` is
the trainer's own SOAP note and is **not** a valid source here.

Merge these client-authored sources into one reverse-chronological list:
- `SessionFeedback.comment` (with its `rating`)
- `ExerciseFeedback.comment` (with the exercise name)
- `SessionExerciseLog.clientNote`
- `WorkoutSessionV2.overallNotes`

Show the most recent; "View all" opens the full merged list.

### Explicitly excluded

Per the doc: Total Volume, Total Reps, Session Duration, Readiness. These must
not appear, even though `WorkoutSessionV2.durationMinutes` and `overallRPE`
exist and would be easy to add.

### Empty states

Each panel degrades independently. A client who has never logged a `pain_level`
assessment sees a prompt to record one — not a zero-value chart, and not a
broken axis. This matters: `pain_level` is optional and many clients will have
none.

### Design principle

The doc's constraint governs review: the trainer answers *Is the client doing
the program? Are symptoms improving? What happened recently?* within seconds.
No additional charts or secondary metrics.

## Testing

Vitest is configured (`vitest.config.ts`) with precedent at
`components/dashboard/__tests__` and `lib/services/__tests__`.

**Unit tests**
- `client-progress.service` — completion percentage, previous-period delta,
  pain baseline/latest/change, and every empty-data path.
- `buildPriorityAlerts` — a correct `reason` for each of the eight `AlertKind`
  values (extends the existing suite).
- Focus/View All — the regression test for the invariant: edit a set value,
  switch `Focus → View All → Focus`, assert `onChange` payload is intact and no
  entered value was dropped.

**Manual verification**
String and layout changes in §1, §2.1, §2.2, §2.4, §2.6 are verified by running
the app against a seeded trainer and client.

## Sequencing

Ordered so that low-risk work lands first and the two largest pieces are
independent of each other:

1. **Strings and layout** — §1.1–1.3, §1.4, §2.1, §3. Small, isolated.
2. **Data-backed dashboard** — §2.2, §2.3, §2.4, §2.5, §2.6.
3. **Focus / View All** — §4. Self-contained in `program-builder.tsx`.
4. **Create Program entry point** — §5, including the `clientId` plumbing.
5. **Client Progress Overview** — §6. New service, new modal, two entry points.

## Risks

- **§2.4** — restricting react-big-calendar views may interact with the
  drag-to-reschedule behaviour in `program-schedule-view.tsx`. Confirm
  rescheduling still works after the change.
- **§4** — `program-builder.tsx` is 1240 lines. The collapsed-row summary should
  be extracted as its own component rather than inlined, to avoid growing it
  further.
- **§2.5** — `ExerciseFeedback` links to `PlanExercise`, a **V1** model, while
  sessions run on `WorkoutSessionV2`. Before building the `pain_feedback` and
  `discomfort` reasons, confirm the V2 flow still writes `ExerciseFeedback`
  rows with a resolvable exercise name. If it does not, those two reasons fall
  back to the feedback comment and timestamp alone, without the exercise name.
- **§6** — `pain_level` assessments are optional and likely sparse in real data.
  The Pain Level and Pain Trend panels may be empty for most clients at launch.
  This is a product reality to surface, not a bug to engineer around.
