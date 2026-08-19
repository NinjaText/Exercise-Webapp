# Coach Controls & Session Ownership — Design

## Context

Source: `Inmotus_RX_Client_Scheduling_and_AI_Workout_Logic_Engineer_Brief.docx`, brief §13 ("Coach Controls"): coach can reschedule an assigned workout; coach can see scheduled date, actual completion date, and whether a session was early/on-time/delayed/skipped/rescheduled; original scheduling history must not be overwritten on reschedule. This is sub-project #6 of the original 6-way decomposition.

Two things were already true before this sub-project: coaches can already reschedule sessions via drag-to-reschedule in `client-calendar.tsx` and `program-schedule-view.tsx` (both call `rescheduleSessionAction`), and the underlying data (`scheduleVariance`, `originalScheduledDate`, `rescheduledBy`, `rescheduledAt`) has existed on `WorkoutSessionV2` since an earlier sub-project. What's missing is (a) the coach-facing *visibility* into that data, and (b) — discovered during this sub-project's research, not originally in its brief scope — a real authorization gap: `rescheduleSessionAction` and four `/clients/[id]/*` pages have no ownership verification at all, letting any authenticated user act on or view any session/client by id. The user explicitly asked to fix this broadly as part of this sub-project.

### Existing state (verified before designing)

- `actions/session-actions.ts`'s `rescheduleSessionAction` authenticates the caller and derives `rescheduledBy` from their role, but never verifies the session belongs to that caller (client) or that caller's program (trainer). Contrast with `getTrainerSessionsAction` in the same file, which does gate correctly (`dbUser.role !== "TRAINER"` plus scoping the query itself by `trainerId`).
- `lib/services/session.service.ts`'s `getSessionsForTrainer(trainerId, ...)` scopes sessions by `workout: { program: { trainerId } }` — this is the established convention for "does this trainer own this session."
- `lib/services/client.service.ts`'s `getClientIdsForTrainer(trainerId)` scopes clients by shared `clerkOrgId` — this is the established convention for "does this client belong to this trainer" (org-based, not a direct one-to-one assignment).
- Four pages — `/clients/[id]/page.tsx`, `/clients/[id]/progress/page.tsx`, `/clients/[id]/outcomes/page.tsx`, `/clients/[id]/adherence/page.tsx` — each call `requireRole("TRAINER")` then fetch the client by the URL's `id` with zero check that this client is actually in this trainer's org. Two use `getClientDetail(id)`, two use `prisma.user.findUnique({ where: { id } })` directly.
- `getClientPastSessions(clientId)` (used by the adherence page) already returns full `WorkoutSessionV2` rows via `include` — `scheduleVariance`, `originalScheduledDate`, `rescheduledBy`, `rescheduledAt` are already fetched today; the adherence page's UI simply never renders them.
- `lib/services/adherence.service.ts` is a legacy/parallel system built on the old V1 session models (`workoutSession`, not `workoutSessionV2`) — not part of this or any recent sub-project's data flow, not touched here.
- No "client-defined reschedule permission" concept exists anywhere in the codebase today.

## Decisions

Confirmed with the user during brainstorming:

- **IDOR scope**: fix broadly. In addition to `rescheduleSessionAction`, all four `/clients/[id]/*` pages get the same ownership check, using the codebase's existing `getClientIdsForTrainer` convention.
- **Client reschedule permission** (brief's hedged "consider allowing clients to reschedule within coach-defined permissions"): deferred. Clients can already reschedule their own sessions today with no existing restriction to lift; a coach-configurable toggle is new scope the brief only tentatively suggested, not something to build speculatively.

## Design

### 1. `rescheduleSessionAction` ownership check

In `actions/session-actions.ts`, before calling `sessionService.rescheduleSession`, fetch the session (`clientId`, and `workout.program.trainerId` via a nested select) and verify: a `CLIENT` caller must own the session (`session.clientId === dbUser.id`); a `TRAINER` caller must own the program (`session.workout.program.trainerId === dbUser.id`, matching `getSessionsForTrainer`'s existing scoping convention exactly). Reject with an `Unauthorized` error otherwise, without calling `rescheduleSession`.

### 2. `/clients/[id]/*` ownership checks

Each of the four pages gains, immediately after resolving `params` and `requireRole("TRAINER")`:

```ts
const clientIds = await getClientIdsForTrainer(user.id);
if (!clientIds.includes(id)) notFound();
```

(`user` here is the `User` returned by `requireRole`.) This reuses the existing `getClientIdsForTrainer` function verbatim — no new service function needed. `notFound()` is already imported in all four files and is the same failure mode each page already uses when the client record itself doesn't exist, so an unauthorized access and a genuinely-missing client are indistinguishable to the caller (correct: doesn't leak whether the id exists at all).

### 3. Surface schedule-vs-actual on the adherence page

In `/clients/[id]/adherence/page.tsx`'s session list, using data already returned by `getClientPastSessions` (no query change needed):

- Add a variance badge next to the existing status badge, shown only when `session.scheduleVariance` is set (i.e., only for `COMPLETED` sessions): `ON_TIME` / `EARLY` / `DELAYED`, each with its own color (distinct from the existing status-badge colors, so the two badges read as separate signals rather than competing).
- When `session.originalScheduledDate` is set (the session was rescheduled at least once), show a small secondary line under the date: "Rescheduled from {original date}" plus the actor (`rescheduledBy`) when present.

## Testing

- Unit tests for `rescheduleSessionAction`'s new ownership check: a client rescheduling their own session succeeds; a client attempting to reschedule another client's session is rejected; a trainer rescheduling a session in their own program succeeds; a trainer attempting to reschedule a session outside their program is rejected.
- No new tests for the four `/clients/[id]/*` pages — this repo has no page/route-level test coverage anywhere (consistent with the earlier-established "no component-rendering test infrastructure" constraint); verification is by reading the diff plus a manual check, matching how UI-only changes were verified in the prior sub-project.

## Out of scope (deferred)

- Coach-configurable client-reschedule permission toggle.
- `lib/services/adherence.service.ts` (legacy V1 system) — untouched.
- Program Schedule simplification (sub-project 2b), workout detail/progress-metrics polish, and AI adherence-consumption logic (sub-project #5) — separate sub-projects.
