# Session Schedule Variance & Reschedule History — Design

## Context

Source: `Inmotus_RX_Client_Scheduling_and_AI_Workout_Logic_Engineer_Brief.docx` (client-provided brief covering a broader client-scheduling/UX overhaul, §§1–15). That brief is too large for one spec and was decomposed into six sub-projects:

1. **Scheduling data model + behavioral-state logic** (this spec) — brief §8–11, §14 HIGH items.
2. Client dashboard hero + calendar/upcoming redesign (§2–4).
3. Workout detail & progress metrics polish (§5–6).
4. Future-workout flexibility UX — preview + "start early" confirmation (§7, §12). Depends on #1.
5. AI analysis consuming the new model — adherence/progression logic (§9–10). Depends on #1.
6. Coach controls — reschedule, view schedule-vs-actual, permissions (§13). Depends on #1.

This spec covers **#1 only**: the data model and service-layer logic that #2, #4, #5, #6 will all read from or write to.

### Existing state (verified in codebase before designing)

`WorkoutSessionV2` (`prisma/schema.prisma:519`) already has `scheduledDate`, `startedAt`, `completedAt`, and `status` — the brief's requested scheduled-vs-actual split already exists. What's missing:

- `lib/services/session.service.ts:140` `rescheduleSession(sessionId, newDate)` overwrites `scheduledDate` directly with no history preserved — the exact gap brief §13 warns against ("Do not overwrite original scheduling history when a session is moved").
- No `scheduleVariance`/behavioral-state classification (on-time/early/delayed) exists anywhere.
- A `SKIPPED` status value is read in stats (`session.service.ts:47`) but never set anywhere in the codebase — dead state today.
- `app/api/cron/mark-missed-sessions/route.ts` + `markPastDueSessionsMissed` (`session.service.ts:258`) already auto-flip `SCHEDULED → MISSED` after a 24h grace period (`MISSED_SESSION_GRACE_HOURS`).

## Decisions

These were confirmed with the user during brainstorming:

- **On-time tolerance**: same calendar day. Completed same calendar day as `scheduledDate` → on time; earlier day → early; later day → delayed.
- **Variance storage**: stored field (`scheduleVariance`), computed centrally in the service layer at the point of status transition — not derived ad hoc by each caller.
- **Reschedule history depth**: original + current only (no full multi-hop chain). `originalScheduledDate` (set once) + `rescheduledBy`/`rescheduledAt` (latest reschedule only).
- **Skipped vs. Missed**: no separate manual "skip" action. `MISSED` (auto-detected by the existing cron) remains the only miss-adjacent state; `SKIPPED` is not wired up further.

## Schema changes — `WorkoutSessionV2`

The brief's literal field list (`scheduled_date` + `rescheduled_date` as two separate "current plan" fields) is adapted to avoid duplicating "current date" across two fields, and because `scheduledDate` is already load-bearing throughout the codebase (cron, calendar queries, sort order, the `[clientId, scheduledDate]` index). Concretely:

```prisma
model WorkoutSessionV2 {
  // ...existing fields unchanged...
  scheduledDate         DateTime   // existing — stays the CURRENT effective planned date; unchanged semantics
  originalScheduledDate DateTime?  // NEW — set once, first time this session is rescheduled; never touched again
  rescheduledBy         String?    // NEW — "client" | "coach" | "system"; who triggered the most recent reschedule
  rescheduledAt         DateTime?  // NEW — when the most recent reschedule happened
  scheduleVariance       String?   // NEW — "ON_TIME" | "EARLY" | "DELAYED"; set only when status transitions to COMPLETED
}
```

`scheduledDate` keeps functioning exactly as it does today — every existing query, index, and the missed-session cron are unaffected.

`scheduleVariance` is `null` for anything not `COMPLETED`; `status` already conveys `SCHEDULED`/`IN_PROGRESS`/`MISSED`, so there's no reason to duplicate that into variance.

**Adherence rule**: variance is computed against the *current* `scheduledDate`, never `originalScheduledDate`. A session that was legitimately rescheduled by a coach and completed on the new date reads as `ON_TIME` — a reschedule never silently counts against adherence (brief §10: "Rescheduling: intentional schedule changes should not automatically be treated as poor adherence"). Whether a session was ever rescheduled at all (`originalScheduledDate != null`) is a separate, orthogonal fact for later AI/coach consumption (sub-projects #5/#6) — it does not feed into the variance computation itself.

## Service layer changes — `lib/services/session.service.ts`

- **`rescheduleSession(sessionId, newDate, rescheduledBy)`** — gains a `rescheduledBy: "client" | "coach" | "system"` parameter. Reads the session's current `scheduledDate` first; if `originalScheduledDate` is not already set, sets it to that pre-change value. Always sets `rescheduledAt = now` and `rescheduledBy`, then updates `scheduledDate = newDate`.
- **`rescheduleSessionAction` (`actions/session-actions.ts`)** — the only caller of `rescheduleSession`, used by all three reschedule UIs (`calendar-with-sidebar.tsx`, `client-calendar.tsx`, `program-schedule-view.tsx`). It already fetches `dbUser` (with `dbUser.role`, a `UserRole` of `"TRAINER" | "CLIENT"`) for auth. It derives `rescheduledBy` server-side from that role (`"TRAINER" → "coach"`, `"CLIENT" → "client"`) and passes it through — no changes needed to the three calling components or their props.
- **`computeScheduleVariance(scheduledDate: Date, completedAt: Date): "ON_TIME" | "EARLY" | "DELAYED"`** — new exported pure function. Compares UTC year/month/day of both dates directly — `scheduledDate` is already stored UTC-midnight-anchored, and this is a server-side comparison (not feeding a browser-local-time UI library), so `calendar-date.ts`'s local-time reinterpretation doesn't apply here. Raw UTC comparison carries the same small timezone imprecision the existing `MISSED_SESSION_GRACE_HOURS` cutoff already accepts (see its doc comment in `session.service.ts`) — consistent with, not a regression from, current behavior. Unit-tested in isolation.
- **Actual completion path — `completeSessionV2Action` (`actions/session-v2-actions.ts:294`)** — this is where sessions are really marked `COMPLETED` today (`session.service.ts`'s `updateSessionStatus` has zero callers and stays dead code, same as `SKIPPED`). Before updating, it fetches the session's current `scheduledDate`, computes `scheduleVariance` via `computeScheduleVariance`, and includes it in the same `prisma.workoutSessionV2.update` call alongside `status`/`completedAt`/`overallRPE`/`overallNotes`.
- **`markPastDueSessionsMissed`** — unchanged; `scheduleVariance` stays `null` for `MISSED` sessions.
- **Backfill script** — one-off script computing `scheduleVariance` for existing `COMPLETED` sessions that predate this change, so historical adherence data isn't a gap when sub-project #5 (AI consumption) is built.

## Testing

- Unit tests for `computeScheduleVariance` covering: same-day at various times, day-before, day-after, and timezone-boundary edge cases (midnight rollovers), consistent with existing `calendar-date.ts` test patterns.
- Unit tests for `rescheduleSession`: first reschedule sets `originalScheduledDate`; a second reschedule on the same session leaves `originalScheduledDate` unchanged while updating `rescheduledAt`/`rescheduledBy`/`scheduledDate`.
- Unit test confirming a rescheduled-then-on-time-completed session yields `scheduleVariance = "ON_TIME"` (the adherence-neutrality rule above).
- The backfill script itself is untested, matching every existing script in `lib/db/scripts/`/`lib/db/seed/` (none have test coverage) — it's a thin wrapper that reuses the already-unit-tested `computeScheduleVariance`, so correctness is covered indirectly.

## Out of scope (deferred to later sub-projects)

- Dashboard/calendar UI changes (#2).
- The "start a future workout" confirmation modal (#4).
- Coach-facing reschedule UI and permissions (#6).
- AI insight/adherence logic that actually reads `scheduleVariance`/`originalScheduledDate` to reason about client behavior (#5).

This sub-project only produces the data and service-layer primitives those consume.
