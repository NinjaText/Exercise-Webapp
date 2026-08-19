# Session Schedule Variance & Reschedule History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reschedule-history tracking and on-time/early/delayed completion classification to `WorkoutSessionV2`, without changing any existing query/cron/UI behavior.

**Architecture:** Four new nullable fields on `WorkoutSessionV2` (`originalScheduledDate`, `rescheduledBy`, `rescheduledAt`, `scheduleVariance`). A new pure function `computeScheduleVariance` in `lib/services/session.service.ts` does the on-time/early/delayed comparison; it's wired into the two real call sites that mutate scheduling state today — `rescheduleSession` (called via `rescheduleSessionAction`) and `completeSessionV2Action` — rather than the currently-dead `updateSessionStatus`. A one-off backfill script fills in `scheduleVariance` for pre-existing completed sessions.

**Tech Stack:** Next.js server actions, Prisma (MongoDB provider), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-session-schedule-variance-design.md`

## Global Constraints

- `scheduledDate` keeps its current semantics and behavior exactly — every existing query, index, and the missed-session cron are unaffected.
- `scheduleVariance` is only ever set when a session transitions to `COMPLETED`; it must stay `null` for every other status.
- Variance is always computed against the session's *current* `scheduledDate`, never `originalScheduledDate` — a legitimate reschedule must never count as being "late."
- `originalScheduledDate` is set exactly once (on the first reschedule) and never overwritten by later reschedules.
- No changes to any of the three reschedule-UI components (`calendar-with-sidebar.tsx`, `client-calendar.tsx`, `program-schedule-view.tsx`) — the new `rescheduledBy` actor is derived server-side from the authenticated user's role, not passed from the client.

---

### Task 1: Schema — add reschedule-history and variance fields

**Files:**
- Modify: `prisma/schema.prisma:519-538` (`WorkoutSessionV2` model)

**Interfaces:**
- Produces: `WorkoutSessionV2.originalScheduledDate: DateTime?`, `.rescheduledBy: String?`, `.rescheduledAt: DateTime?`, `.scheduleVariance: String?` — consumed by Tasks 2-4.

- [ ] **Step 1: Add the four new fields to the model**

In `prisma/schema.prisma`, update the `WorkoutSessionV2` model:

```prisma
model WorkoutSessionV2 {
  id                    String               @id @default(auto()) @map("_id") @db.ObjectId
  workoutId             String               @db.ObjectId
  workout               Workout              @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  clientId              String               @map("patientId") @db.ObjectId
  client                User                 @relation("SessionsV2", fields: [clientId], references: [id])
  scheduledDate         DateTime
  originalScheduledDate DateTime?
  rescheduledBy         String?
  rescheduledAt         DateTime?
  startedAt             DateTime?
  completedAt           DateTime?
  status                String               @default("SCHEDULED")
  scheduleVariance      String?
  overallRPE            Int?
  overallNotes          String?
  durationMinutes       Int?
  createdAt             DateTime             @default(now())
  updatedAt             DateTime             @updatedAt
  exerciseLogs          SessionExerciseLog[]
  feedback              SessionFeedback[]

  @@index([clientId, scheduledDate])
}
```

(Only the four new lines — `originalScheduledDate`, `rescheduledBy`, `rescheduledAt`, `scheduleVariance` — are additions; every other line is unchanged from the current model.)

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: completes with no errors, updates `node_modules/@prisma/client` types to include the four new optional fields.

- [ ] **Step 3: Type-check the project**

Run: `npx tsc --noEmit`
Expected: no new type errors (the new fields are optional/nullable, so no existing code should break).

- [ ] **Step 4: Push the schema to the database**

Run: `npm run db:push`
Expected: reports the four new fields added to the `WorkoutSessionV2` collection's schema. This is additive/non-destructive — existing documents are simply missing the new optional fields until touched, same as every other optional-field addition already made to this model (e.g. `overallRPE`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add reschedule history and schedule variance fields to WorkoutSessionV2"
```

---

### Task 2: `computeScheduleVariance` pure function

**Files:**
- Modify: `lib/services/session.service.ts` (add near the top, after `MISSED_SESSION_GRACE_HOURS`)
- Test: `lib/services/__tests__/session.service.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, two `Date` inputs).
- Produces: `export type ScheduleVariance = "ON_TIME" | "EARLY" | "DELAYED"` and `export function computeScheduleVariance(scheduledDate: Date, completedAt: Date): ScheduleVariance` — consumed by Task 3's test setup context and Task 4's `completeSessionV2Action`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/services/__tests__/session.service.test.ts` (below the existing `computeAdherenceStats` describe block):

```ts
import { computeScheduleVariance } from '../session.service'
```

(add `computeScheduleVariance` to the existing import from `'../session.service'` rather than a new import line)

```ts
describe('computeScheduleVariance', () => {
  it('classifies same UTC calendar day as ON_TIME regardless of time of day', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const completedAt = new Date('2026-08-20T23:59:59.000Z')
    expect(computeScheduleVariance(scheduledDate, completedAt)).toBe('ON_TIME')
  })

  it('classifies a completion on an earlier UTC calendar day as EARLY', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const completedAt = new Date('2026-08-19T23:59:59.000Z')
    expect(computeScheduleVariance(scheduledDate, completedAt)).toBe('EARLY')
  })

  it('classifies a completion several days early as EARLY', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const completedAt = new Date('2026-08-15T10:00:00.000Z')
    expect(computeScheduleVariance(scheduledDate, completedAt)).toBe('EARLY')
  })

  it('classifies a completion on a later UTC calendar day as DELAYED', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const completedAt = new Date('2026-08-21T00:00:01.000Z')
    expect(computeScheduleVariance(scheduledDate, completedAt)).toBe('DELAYED')
  })

  it('classifies a completion several days late as DELAYED', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const completedAt = new Date('2026-08-25T10:00:00.000Z')
    expect(computeScheduleVariance(scheduledDate, completedAt)).toBe('DELAYED')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/session.service.test.ts -t computeScheduleVariance`
Expected: FAIL with "computeScheduleVariance is not a function" or similar (not exported yet).

- [ ] **Step 3: Implement `computeScheduleVariance`**

Add to `lib/services/session.service.ts`, directly below the `MISSED_SESSION_GRACE_HOURS` constant:

```ts
export type ScheduleVariance = "ON_TIME" | "EARLY" | "DELAYED";

/**
 * Compares the UTC calendar day of `completedAt` to `scheduledDate`.
 * `scheduledDate` is stored UTC-midnight-anchored; this comparison runs
 * server-side (not feeding a browser-local-time UI library like
 * lib/utils/calendar-date.ts's helpers do), so a direct UTC year/month/day
 * comparison is correct here. This carries the same small timezone
 * imprecision MISSED_SESSION_GRACE_HOURS above already accepts.
 */
export function computeScheduleVariance(
  scheduledDate: Date,
  completedAt: Date
): ScheduleVariance {
  const scheduledDay = Date.UTC(
    scheduledDate.getUTCFullYear(),
    scheduledDate.getUTCMonth(),
    scheduledDate.getUTCDate()
  );
  const completedDay = Date.UTC(
    completedAt.getUTCFullYear(),
    completedAt.getUTCMonth(),
    completedAt.getUTCDate()
  );

  if (completedDay === scheduledDay) return "ON_TIME";
  return completedDay < scheduledDay ? "EARLY" : "DELAYED";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/session.service.test.ts -t computeScheduleVariance`
Expected: PASS, all 5 cases.

- [ ] **Step 5: Commit**

```bash
git add lib/services/session.service.ts lib/services/__tests__/session.service.test.ts
git commit -m "feat: add computeScheduleVariance for on-time/early/delayed classification"
```

---

### Task 3: Reschedule history — `rescheduleSession` + `rescheduleSessionAction`

**Files:**
- Modify: `lib/services/session.service.ts:140-145` (`rescheduleSession`)
- Modify: `actions/session-actions.ts` (`rescheduleSessionAction`)
- Test: `lib/services/__tests__/session.service.test.ts`
- Test: Create `actions/__tests__/session-actions.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export type RescheduledBy = "client" | "coach" | "system"` and updated `rescheduleSession(sessionId: string, newDate: Date, rescheduledBy: RescheduledBy)` — the third parameter is new. `rescheduleSessionAction`'s own external signature (`sessionId: string, newDate: string`) is unchanged, since `rescheduledBy` is derived internally from `dbUser.role`.

- [ ] **Step 1: Write the failing service-layer tests**

Update the mocked prisma object at the top of `lib/services/__tests__/session.service.test.ts` to add `findUnique` and `update`:

```ts
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workoutSessionV2: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))
```

Add the corresponding mock handles and import:

```ts
const mockFindUnique = vi.mocked(prisma.workoutSessionV2.findUnique)
const mockUpdate = vi.mocked(prisma.workoutSessionV2.update)
```

(add `rescheduleSession` to the existing named import from `'../session.service'`)

```ts
describe('rescheduleSession', () => {
  it('sets originalScheduledDate to the prior scheduledDate on first reschedule', async () => {
    mockFindUnique.mockResolvedValue({
      scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
      originalScheduledDate: null,
    } as never)
    mockUpdate.mockResolvedValue({} as never)

    await rescheduleSession('session_1', new Date('2026-08-22T00:00:00.000Z'), 'coach')

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: {
        originalScheduledDate: new Date('2026-08-20T00:00:00.000Z'),
        rescheduledBy: 'coach',
        rescheduledAt: expect.any(Date),
        scheduledDate: new Date('2026-08-22T00:00:00.000Z'),
      },
    })
  })

  it('preserves an existing originalScheduledDate on a second reschedule', async () => {
    mockFindUnique.mockResolvedValue({
      scheduledDate: new Date('2026-08-22T00:00:00.000Z'),
      originalScheduledDate: new Date('2026-08-20T00:00:00.000Z'),
    } as never)
    mockUpdate.mockResolvedValue({} as never)

    await rescheduleSession('session_1', new Date('2026-08-24T00:00:00.000Z'), 'client')

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: expect.objectContaining({
        originalScheduledDate: new Date('2026-08-20T00:00:00.000Z'),
        rescheduledBy: 'client',
      }),
    })
  })

  it('throws when the session does not exist', async () => {
    mockFindUnique.mockResolvedValue(null as never)

    await expect(
      rescheduleSession('missing_session', new Date('2026-08-22T00:00:00.000Z'), 'system')
    ).rejects.toThrow('missing_session')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/session.service.test.ts -t rescheduleSession`
Expected: FAIL — current `rescheduleSession` takes 2 args and doesn't call `findUnique`.

- [ ] **Step 3: Implement the updated `rescheduleSession`**

Replace the existing function at `lib/services/session.service.ts:140-145`:

```ts
export type RescheduledBy = "client" | "coach" | "system";

export async function rescheduleSession(
  sessionId: string,
  newDate: Date,
  rescheduledBy: RescheduledBy
) {
  const existing = await prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    select: { scheduledDate: true, originalScheduledDate: true },
  });
  if (!existing) {
    throw new Error(`Session ${sessionId} not found`);
  }

  return prisma.workoutSessionV2.update({
    where: { id: sessionId },
    data: {
      originalScheduledDate: existing.originalScheduledDate ?? existing.scheduledDate,
      rescheduledBy,
      rescheduledAt: new Date(),
      scheduledDate: newDate,
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/session.service.test.ts -t rescheduleSession`
Expected: PASS, all 3 cases.

- [ ] **Step 5: Write the failing action-layer test**

Create `actions/__tests__/session-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workoutSessionV2: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { rescheduleSessionAction } from '../session-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockSessionFind = vi.mocked(prisma.workoutSessionV2.findUnique)
const mockSessionUpdate = vi.mocked(prisma.workoutSessionV2.update)

const dbTrainer = { id: 'trainer_1', clerkId: 'clerk_1', role: 'TRAINER' }
const dbClient = { id: 'client_1', clerkId: 'clerk_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('rescheduleSessionAction', () => {
  it('derives rescheduledBy="coach" for a TRAINER user', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockSessionFind.mockResolvedValue({
      scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
      originalScheduledDate: null,
    } as never)
    mockSessionUpdate.mockResolvedValue({ id: 'session_1' } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result.success).toBe(true)
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: expect.objectContaining({ rescheduledBy: 'coach' }),
    })
  })

  it('derives rescheduledBy="client" for a CLIENT user', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue({
      scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
      originalScheduledDate: null,
    } as never)
    mockSessionUpdate.mockResolvedValue({ id: 'session_1' } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result.success).toBe(true)
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: expect.objectContaining({ rescheduledBy: 'client' }),
    })
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run actions/__tests__/session-actions.test.ts`
Expected: FAIL — `rescheduleSessionAction` doesn't pass a third argument yet, so `rescheduledBy` in the update call is `undefined`, not `'coach'`/`'client'`.

- [ ] **Step 7: Wire the role derivation into `rescheduleSessionAction`**

In `actions/session-actions.ts`, update the body of `rescheduleSessionAction`:

```ts
export async function rescheduleSessionAction(
  sessionId: string,
  newDate: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

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

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run actions/__tests__/session-actions.test.ts`
Expected: PASS, both cases.

- [ ] **Step 9: Commit**

```bash
git add lib/services/session.service.ts lib/services/__tests__/session.service.test.ts actions/session-actions.ts actions/__tests__/session-actions.test.ts
git commit -m "feat: preserve reschedule history and derive rescheduledBy from user role"
```

---

### Task 4: Wire `scheduleVariance` into session completion

**Files:**
- Modify: `actions/session-v2-actions.ts:294-339` (`completeSessionV2Action`)
- Test: Create `actions/__tests__/session-v2-actions.test.ts`

**Interfaces:**
- Consumes: `computeScheduleVariance` from `@/lib/services/session.service` (Task 2).
- Produces: `completeSessionV2Action`'s external signature is unchanged (`sessionId, overallRPE?, overallNotes?`); its `prisma.workoutSessionV2.update` call now includes `scheduleVariance`.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/session-v2-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workoutSessionV2: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/notification.service', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { SESSION_COMPLETED: 'SESSION_COMPLETED', EXERCISE_NOTE: 'EXERCISE_NOTE' },
}))
vi.mock('@/lib/email/resend', () => ({
  getResend: vi.fn(() => ({ emails: { send: vi.fn().mockResolvedValue({}) } })),
}))
vi.mock('@/lib/email/templates/session-completed', () => ({ SessionCompletedEmail: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { completeSessionV2Action } from '../session-v2-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockSessionFind = vi.mocked(prisma.workoutSessionV2.findUnique)
const mockSessionUpdate = vi.mocked(prisma.workoutSessionV2.update)

const dbClient = { id: 'client_1', clerkId: 'clerk_1', firstName: 'Jane', lastName: 'Doe', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('completeSessionV2Action', () => {
  it('stamps scheduleVariance="ON_TIME" when completed the same UTC day as scheduled', async () => {
    vi.setSystemTime(new Date('2026-08-20T15:00:00.000Z'))
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind
      .mockResolvedValueOnce({ scheduledDate: new Date('2026-08-20T00:00:00.000Z') } as never)
      .mockResolvedValue(null as never)
    mockSessionUpdate.mockResolvedValue({} as never)

    const result = await completeSessionV2Action('session_1', 7, 'felt good')

    expect(result.success).toBe(true)
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1', clientId: 'client_1' },
      data: {
        status: 'COMPLETED',
        completedAt: new Date('2026-08-20T15:00:00.000Z'),
        overallRPE: 7,
        overallNotes: 'felt good',
        scheduleVariance: 'ON_TIME',
      },
    })
  })

  it('stamps scheduleVariance="EARLY" when completed before the scheduled UTC day', async () => {
    vi.setSystemTime(new Date('2026-08-18T15:00:00.000Z'))
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind
      .mockResolvedValueOnce({ scheduledDate: new Date('2026-08-20T00:00:00.000Z') } as never)
      .mockResolvedValue(null as never)
    mockSessionUpdate.mockResolvedValue({} as never)

    await completeSessionV2Action('session_1')

    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1', clientId: 'client_1' },
      data: expect.objectContaining({ scheduleVariance: 'EARLY' }),
    })
  })

  it('returns an error and skips the update when the session is not found', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue(null as never)

    const result = await completeSessionV2Action('missing_session')

    expect(result.success).toBe(false)
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('stamps ON_TIME against a rescheduled session\'s CURRENT scheduledDate, not its original', async () => {
    // Regression guard for the adherence-neutrality rule: a session that was
    // rescheduled and then completed on the new date must read as ON_TIME.
    // completeSessionV2Action always fetches the session's current scheduledDate
    // fresh from the DB, so this passes by construction as long as nothing
    // reintroduces a cached/original date into this path.
    vi.setSystemTime(new Date('2026-08-24T12:00:00.000Z'))
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind
      // scheduledDate reflects the NEW date after a reschedule away from an
      // original of 2026-08-20 (originalScheduledDate is irrelevant here).
      .mockResolvedValueOnce({ scheduledDate: new Date('2026-08-24T00:00:00.000Z') } as never)
      .mockResolvedValue(null as never)
    mockSessionUpdate.mockResolvedValue({} as never)

    await completeSessionV2Action('session_1')

    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1', clientId: 'client_1' },
      data: expect.objectContaining({ scheduleVariance: 'ON_TIME' }),
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run actions/__tests__/session-v2-actions.test.ts`
Expected: FAIL — `completeSessionV2Action` doesn't fetch `scheduledDate` or include `scheduleVariance` yet, and the current update `data` shape doesn't match.

- [ ] **Step 3: Wire `computeScheduleVariance` into `completeSessionV2Action`**

In `actions/session-v2-actions.ts`, add the import at the top:

```ts
import { computeScheduleVariance } from "@/lib/services/session.service";
```

Replace the body of `completeSessionV2Action` (`actions/session-v2-actions.ts:294-339`):

```ts
export async function completeSessionV2Action(
  sessionId: string,
  overallRPE?: number,
  overallNotes?: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false, error: "User not found" };

    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId, clientId: dbUser.id },
      select: { scheduledDate: true },
    });
    if (!session) return { success: false, error: "Session not found" };

    const completedAt = new Date();
    const scheduleVariance = computeScheduleVariance(session.scheduledDate, completedAt);

    await prisma.workoutSessionV2.update({
      where: { id: sessionId, clientId: dbUser.id },
      data: { status: "COMPLETED", completedAt, overallRPE, overallNotes, scheduleVariance },
    });

    // Fire trainer notifications — non-blocking, failures must not break completion
    try {
      await notifyTrainerOnCompletion(sessionId, {
        id: dbUser.id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
      });
    } catch (notifyErr) {
      console.error("Completion notification failed (non-fatal):", notifyErr);
    }

    try {
      await notifyTrainerOfClientNotes(sessionId, {
        id: dbUser.id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
      });
    } catch (notifyErr) {
      console.error("Exercise note notification failed (non-fatal):", notifyErr);
    }

    revalidatePath("/dashboard");
    revalidatePath("/sessions/" + sessionId);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to complete session" };
  }
}
```

(Only the `session`/`completedAt`/`scheduleVariance` lookup-and-compute block before the update, and `scheduleVariance` in the update's `data`, are new — everything else in the function is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run actions/__tests__/session-v2-actions.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — confirms nothing else in the codebase broke (e.g. any other test that calls `completeSessionV2Action` or asserts on its update shape).

- [ ] **Step 6: Commit**

```bash
git add actions/session-v2-actions.ts actions/__tests__/session-v2-actions.test.ts
git commit -m "feat: stamp scheduleVariance on session completion"
```

---

### Task 5: Backfill script for existing completed sessions

**Files:**
- Create: `lib/db/scripts/backfill-schedule-variance.ts`
- Modify: `package.json` (add script entry)

**Interfaces:**
- Consumes: `computeScheduleVariance` from `@/lib/services/session.service` (Task 2).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Write the backfill script**

Create `lib/db/scripts/backfill-schedule-variance.ts`, matching the existing convention in `lib/db/scripts/backfill-is-assessment.ts` (standalone script, own `PrismaClient`, run via `tsx`):

```ts
import { PrismaClient } from "@prisma/client";
import { computeScheduleVariance } from "@/lib/services/session.service";

const prisma = new PrismaClient();

/**
 * One-time backfill: computes scheduleVariance for every WorkoutSessionV2
 * that was already COMPLETED before this field existed. Idempotent — only
 * matches sessions where scheduleVariance is still null.
 */
async function backfillScheduleVariance() {
  const sessions = await prisma.workoutSessionV2.findMany({
    where: { status: "COMPLETED", completedAt: { not: null }, scheduleVariance: null },
    select: { id: true, scheduledDate: true, completedAt: true },
  });

  let updated = 0;
  for (const session of sessions) {
    if (!session.completedAt) continue;
    const scheduleVariance = computeScheduleVariance(session.scheduledDate, session.completedAt);
    await prisma.workoutSessionV2.update({
      where: { id: session.id },
      data: { scheduleVariance },
    });
    updated++;
  }

  console.log(`Backfilled scheduleVariance on ${updated} session(s).`);
}

backfillScheduleVariance()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add the npm script entry**

In `package.json`, add alongside the other `db:backfill-*` entries:

```json
"db:backfill-schedule-variance": "npx tsx lib/db/scripts/backfill-schedule-variance.ts",
```

- [ ] **Step 3: Type-check the script**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db/scripts/backfill-schedule-variance.ts package.json
git commit -m "feat: add backfill script for scheduleVariance on existing completed sessions"
```

- [ ] **Step 5: Note for the user (not an automated step)**

Running `npm run db:backfill-schedule-variance` actually touches whatever database `DATABASE_URL` points at. Run it yourself when ready, against the environment you intend (this plan does not run it automatically).
