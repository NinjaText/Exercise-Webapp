# Coach Controls & Session Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a real ownership/authorization gap (any authenticated user can reschedule any session or view any client's detail pages by id) and surface schedule-vs-actual data (variance, reschedule history) on the coach-facing adherence page.

**Architecture:** Two independent fixes sharing one theme — authorization. `rescheduleSessionAction` gains a session-ownership check matching the existing `getSessionsForTrainer` scoping convention (trainer owns via program, client owns via `clientId`). Four `/clients/[id]/*` pages gain the same org-scoped ownership check via the already-existing `getClientIdsForTrainer`. The adherence page additionally renders scheduling data (`scheduleVariance`, `originalScheduledDate`, `rescheduledBy`) it already fetches but never displays. No schema or new service functions — every fix reuses an existing convention or an already-fetched field.

**Tech Stack:** Next.js App Router server actions and Server Components, Prisma (MongoDB), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-coach-controls-design.md`

## Global Constraints

- No schema changes, no new Prisma migrations — every fix reads data that's already stored and, in the adherence page's case, already fetched.
- Ownership checks reuse existing conventions rather than inventing new ones: `getSessionsForTrainer`'s `workout.program.trainerId` scoping for session-level trainer ownership, `getClientIdsForTrainer`'s org-scoped (`clerkOrgId`) membership for client-level trainer ownership.
- An unauthorized access and a genuinely-missing resource must be indistinguishable to the caller — use the same failure path (`notFound()` for pages, an `Unauthorized`/`Session not found` error shape for the action) that already exists for "doesn't exist," not a different one for "exists but not yours."
- This repo has no page/route-level test coverage anywhere and no component-rendering test infrastructure (see the two prior sub-projects' plans) — the `/clients/[id]/*` page changes get no new automated tests; verification is reading the diff plus (where practical) a manual check. The `rescheduleSessionAction` ownership check, being a plain server action already covered by existing tests, does get tests.

---

### Task 1: `rescheduleSessionAction` ownership check

**Files:**
- Modify: `actions/session-actions.ts` (`rescheduleSessionAction`)
- Modify: `actions/__tests__/session-actions.test.ts` (update 2 existing tests' mocks, add 4 new tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: `rescheduleSessionAction`'s external signature and success/error shape are unchanged; it now returns `{ success: false, error: "Unauthorized" }` before ever calling `sessionService.rescheduleSession` when the caller doesn't own the session. Not consumed by any other task.

- [ ] **Step 1: Update the two existing tests' mocks**

The two existing tests in `actions/__tests__/session-actions.test.ts` (`'derives rescheduledBy="coach"...'` and `'derives rescheduledBy="client"...'`) currently mock `mockSessionFind.mockResolvedValue({ scheduledDate, originalScheduledDate })` for every call. Once Step 3 adds a new ownership-check `findUnique` call *before* the service's own `findUnique`, both tests need `mockResolvedValueOnce` chaining: the first call is the new ownership check (needs `clientId`/`workout.program.trainerId`), the second is the service's existing-session fetch (needs `scheduledDate`/`originalScheduledDate`, as before).

Replace the first test's setup:

```ts
mockSessionFind.mockResolvedValue({
  scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
  originalScheduledDate: null,
} as never)
```

with:

```ts
mockSessionFind
  .mockResolvedValueOnce({
    clientId: 'client_1',
    workout: { program: { trainerId: 'trainer_1' } },
  } as never)
  .mockResolvedValueOnce({
    scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
    originalScheduledDate: null,
  } as never)
```

Apply the identical replacement to the second test (`'derives rescheduledBy="client"...'`) — same two `mockResolvedValueOnce` values, since that test's `dbClient` (`id: 'client_1'`) matches the same `clientId: 'client_1'`.

- [ ] **Step 2: Write the 4 new failing ownership tests**

Add a new `describe` block to the same file, after the existing `describe('rescheduleSessionAction', ...)` block:

```ts
describe('rescheduleSessionAction — ownership', () => {
  it('allows a trainer to reschedule a session in their own program', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockSessionFind
      .mockResolvedValueOnce({ clientId: 'client_1', workout: { program: { trainerId: 'trainer_1' } } } as never)
      .mockResolvedValueOnce({ scheduledDate: new Date('2026-08-20T00:00:00.000Z'), originalScheduledDate: null } as never)
    mockSessionUpdate.mockResolvedValue({ id: 'session_1' } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result.success).toBe(true)
  })

  it('rejects a trainer rescheduling a session outside their own program', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockSessionFind.mockResolvedValueOnce({
      clientId: 'client_1',
      workout: { program: { trainerId: 'someone_else' } },
    } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result.success).toBe(false)
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('allows a client to reschedule their own session', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind
      .mockResolvedValueOnce({ clientId: 'client_1', workout: { program: { trainerId: 'trainer_1' } } } as never)
      .mockResolvedValueOnce({ scheduledDate: new Date('2026-08-20T00:00:00.000Z'), originalScheduledDate: null } as never)
    mockSessionUpdate.mockResolvedValue({ id: 'session_1' } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result.success).toBe(true)
  })

  it("rejects a client rescheduling another client's session", async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValueOnce({
      clientId: 'someone_else',
      workout: { program: { trainerId: 'trainer_1' } },
    } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result.success).toBe(false)
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run actions/__tests__/session-actions.test.ts`
Expected: the 2 existing tests still pass (their mocks were already updated in Step 1 to match the code that's about to exist); the 4 new tests FAIL — `rescheduleSessionAction` doesn't yet fetch the session for an ownership check, so it always proceeds straight to `sessionService.rescheduleSession`, meaning the "rejects" tests wrongly succeed and the "allows" tests may fail on the mock call-count mismatch (only one `findUnique` call happens today, but the test primed two).

- [ ] **Step 4: Implement the ownership check**

In `actions/session-actions.ts`, update `rescheduleSessionAction`:

```ts
export async function rescheduleSessionAction(
  sessionId: string,
  newDate: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  const existingSession = await prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    select: { clientId: true, workout: { select: { program: { select: { trainerId: true } } } } },
  });
  if (!existingSession) return { success: false as const, error: "Session not found" };

  const isOwner =
    dbUser.role === "TRAINER"
      ? existingSession.workout.program.trainerId === dbUser.id
      : existingSession.clientId === dbUser.id;
  if (!isOwner) return { success: false as const, error: "Unauthorized" };

  try {
    const session = await sessionService.rescheduleSession(
      sessionId,
      new Date(newDate),
      dbUser.role === "TRAINER" ? "coach" : "client"
    );
    revalidatePath("/dashboard");
    revalidatePath("/programs");
    return { success: true as const, data: session };
  } catch (error) {
    console.error("Failed to reschedule session:", error);
    return { success: false as const, error: "Failed to reschedule session" };
  }
}
```

(Only the new `existingSession`/`isOwner` block before the `try` is new — everything inside the `try` is unchanged from before.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/session-actions.test.ts`
Expected: PASS, all 6 cases (2 existing + 4 new).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — confirms nothing else broke.

- [ ] **Step 7: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 2: Ownership checks on `/clients/[id]`, `/clients/[id]/progress`, `/clients/[id]/outcomes`

These three pages get an identical one-shape fix — add to a single dispatch since they're the same mechanical edit repeated across three files.

**Files:**
- Modify: `app/(platform)/clients/[id]/page.tsx`
- Modify: `app/(platform)/clients/[id]/progress/page.tsx`
- Modify: `app/(platform)/clients/[id]/outcomes/page.tsx`

**Interfaces:**
- Consumes: `getClientIdsForTrainer` from `@/lib/services/client.service` (existing function, unchanged).
- Produces: nothing consumed by Task 3.

- [ ] **Step 1: `app/(platform)/clients/[id]/page.tsx`**

Current import line 5: `import { getClientDetail } from "@/lib/services/client.service";` — widen to:

```ts
import { getClientDetail, getClientIdsForTrainer } from "@/lib/services/client.service";
```

This file already destructures `user` from `requireRole("TRAINER")`:
```ts
const [user, { orgId: sessionOrgId }] = await Promise.all([
  requireRole("TRAINER"),
  auth(),
]);
```

Immediately after that block (and before `const client = await getClientDetail(id);`), add:

```ts
const clientIds = await getClientIdsForTrainer(user.id);
if (!clientIds.includes(id)) notFound();
```

(`notFound` is already imported at the top of this file.)

- [ ] **Step 2: `app/(platform)/clients/[id]/progress/page.tsx`**

Current import line 4: `import { getClientDetail } from "@/lib/services/client.service";` — widen to:

```ts
import { getClientDetail, getClientIdsForTrainer } from "@/lib/services/client.service";
```

This file already has `const user = await requireRole("TRAINER");` at line 22, followed by `const client = await getClientDetail(id);` at line 23. Insert between them:

```ts
const user = await requireRole("TRAINER");
const clientIds = await getClientIdsForTrainer(user.id);
if (!clientIds.includes(id)) notFound();
const client = await getClientDetail(id);
```

(`notFound` is already imported at the top of this file.)

- [ ] **Step 3: `app/(platform)/clients/[id]/outcomes/page.tsx`**

This file currently does `await requireRole("TRAINER");` (return value discarded) then `const client = await prisma.user.findUnique({ where: { id } });`. Change to capture the user and add the check:

```ts
const user = await requireRole("TRAINER");
const clientIds = await getClientIdsForTrainer(user.id);
if (!clientIds.includes(id)) notFound();

const client = await prisma.user.findUnique({ where: { id } });
```

Add the import: `import { getClientIdsForTrainer } from "@/lib/services/client.service";` (this file doesn't currently import from that module at all — add a new import line near the other service imports).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — no test in this repo covers these page files directly (no page-level test infrastructure, per Global Constraints), so this just confirms no regression elsewhere.

- [ ] **Step 6: Manual verification note (leave a note for the controller — do not skip)**

Note in your report that the controller should verify: as a trainer, visiting `/clients/{a-real-client-id-in-your-org}/*` still works normally, and visiting `/clients/{some-id-not-in-your-org}/*` (or a nonexistent id) now 404s instead of leaking data.

- [ ] **Step 7: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 3: Adherence page — ownership check + schedule-vs-actual display

**Files:**
- Modify: `app/(platform)/clients/[id]/adherence/page.tsx`

**Interfaces:**
- Consumes: `getClientIdsForTrainer` from `@/lib/services/client.service`; `scheduleVariance`/`originalScheduledDate`/`rescheduledBy` fields already returned by the existing `getClientPastSessions` call (no query change).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Add the ownership check**

This file currently does `await requireRole("TRAINER");` (return value discarded) then `const client = await prisma.user.findUnique({ where: { id } });`. Change to:

```ts
const user = await requireRole("TRAINER");
const clientIds = await getClientIdsForTrainer(user.id);
if (!clientIds.includes(id)) notFound();

const client = await prisma.user.findUnique({ where: { id } });
```

Add the import: `import { getClientIdsForTrainer } from "@/lib/services/client.service";`

- [ ] **Step 2: Add variance/reschedule display constants**

Near the existing `statusColors` constant, add:

```ts
const varianceColors: Record<string, string> = {
  ON_TIME: "bg-success/10 text-success",
  EARLY:   "bg-blue-100 text-blue-700",
  DELAYED: "bg-amber-100 text-amber-700",
};

const varianceLabels: Record<string, string> = {
  ON_TIME: "On Time",
  EARLY:   "Early",
  DELAYED: "Delayed",
};
```

- [ ] **Step 3: Render the variance badge and reschedule note**

In the session list's `Link` for each session, the current structure is:

```tsx
<div className="min-w-0">
  <p className="font-medium text-sm truncate">
    {session.workout.name}
  </p>
  <p className="text-xs text-muted-foreground">
    {format(new Date(session.scheduledDate), "MMM d, yyyy")}
    {session.workout.program?.name && (
      <span className="ml-2 opacity-60">· {session.workout.program.name}</span>
    )}
  </p>
</div>
<div className="flex items-center gap-2 shrink-0 ml-3">
  {session.overallRPE != null && (
    <span className="text-xs text-muted-foreground">RPE {session.overallRPE}/10</span>
  )}
  <Badge
    className={`border-0 text-xs font-medium ${statusColors[session.status] ?? "bg-muted text-muted-foreground"}`}
  >
    {session.status.charAt(0) + session.status.slice(1).toLowerCase()}
  </Badge>
</div>
```

Change to (adds a reschedule note under the date, and a variance badge before the status badge):

```tsx
<div className="min-w-0">
  <p className="font-medium text-sm truncate">
    {session.workout.name}
  </p>
  <p className="text-xs text-muted-foreground">
    {format(new Date(session.scheduledDate), "MMM d, yyyy")}
    {session.workout.program?.name && (
      <span className="ml-2 opacity-60">· {session.workout.program.name}</span>
    )}
  </p>
  {session.originalScheduledDate && (
    <p className="text-xs text-muted-foreground/70 mt-0.5">
      Rescheduled from {format(new Date(session.originalScheduledDate), "MMM d, yyyy")}
      {session.rescheduledBy && ` by ${session.rescheduledBy}`}
    </p>
  )}
</div>
<div className="flex items-center gap-2 shrink-0 ml-3">
  {session.overallRPE != null && (
    <span className="text-xs text-muted-foreground">RPE {session.overallRPE}/10</span>
  )}
  {session.scheduleVariance && (
    <Badge
      className={`border-0 text-xs font-medium ${varianceColors[session.scheduleVariance] ?? "bg-muted text-muted-foreground"}`}
    >
      {varianceLabels[session.scheduleVariance] ?? session.scheduleVariance}
    </Badge>
  )}
  <Badge
    className={`border-0 text-xs font-medium ${statusColors[session.status] ?? "bg-muted text-muted-foreground"}`}
  >
    {session.status.charAt(0) + session.status.slice(1).toLowerCase()}
  </Badge>
</div>
```

Do not touch the pre-existing `session.status.charAt(0) + session.status.slice(1).toLowerCase()` cosmetic quirk (it mangles "IN_PROGRESS" to "In_progress") — it's pre-existing and out of this task's scope.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean — `session` objects returned by `getClientPastSessions` already include `scheduleVariance`/`originalScheduledDate`/`rescheduledBy` as real Prisma-generated fields (verify this compiles without needing any type assertion; if TypeScript complains the fields don't exist on the inferred type, that would mean the `include`-based query doesn't return them and this step needs to stop and report back rather than guessing a fix).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — confirms no regression elsewhere.

- [ ] **Step 6: Manual verification note (leave a note for the controller — do not skip)**

Note in your report that the controller should verify in a browser: a completed, on-time session shows an "On Time" badge; a session that was rescheduled shows the "Rescheduled from {date}" line; ownership check still allows normal access to a real client in-org and 404s for one outside it.

- [ ] **Step 7: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.
