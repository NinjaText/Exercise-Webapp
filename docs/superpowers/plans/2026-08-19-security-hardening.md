# Security Hardening — Ownership Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 9 authorization gaps found during a security-focused final review of an earlier plan — several are live and reachable (most seriously, `scheduleProgramForClientAction` lets any trainer clone any other trainer's program and assign it to any client, cross-tenant), the rest are currently-dead code fixed for defense in depth per the user's explicit request to fix everything found.

**Architecture:** Every fix reuses one of two already-established patterns from this session's prior two plans: `getClientIdsForTrainer(trainerId)` (org-scoped client-roster membership) for client-scoped resources, or a direct ownership-field comparison (`program.trainerId === user.id`, `plan.createdById === user.id`) for program/session-scoped resources. No new abstractions, no schema changes.

**Tech Stack:** Next.js server actions and Server Components, Prisma (MongoDB), Vitest.

**Spec:** None — this is a bounded fix to existing code using patterns already validated twice in this session (the scheduling data model plan's `rescheduleSessionAction` fix, and the coach-controls plan's four page fixes). No separate design doc; the fix list and reasoning were presented and approved in chat.

## Global Constraints

- Every check fails closed (rejects) rather than fails open — for any ambiguous or missing data, deny access.
- An unauthorized access and a genuinely-missing resource should use the same failure shape where the existing code already does this for other checks in the same function (matching each function's own established error-response convention — don't invent a new one).
- Client-scoped resources (assessments, body metrics, clinical notes, arbitrary client-id lookups) use `getClientIdsForTrainer(trainerId)` from `@/lib/services/client.service`. Program/session-scoped resources (a specific program or session a trainer is mutating) use a direct field comparison against the resource's own `trainerId`/`createdById`, matching the pattern each file already uses elsewhere for its other actions.
- This repo has no test coverage for the dead-code paths being hardened (items in Task 1 touching `calendar-actions.ts`'s `getClientWorkoutSessions`/`updateSessionDate`) beyond what's added here — add focused tests for the new checks, not exhaustive coverage of pre-existing untested code.

---

### Task 1: `actions/calendar-actions.ts` — 3 fixes

**Files:**
- Modify: `actions/calendar-actions.ts` (`getClientWorkoutSessions`, `updateSessionDate`, `scheduleProgramForClientAction`)
- Test: Create `actions/__tests__/calendar-actions.test.ts`

**Interfaces:**
- Consumes: `getClientIdsForTrainer` from `@/lib/services/client.service` (existing function).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/calendar-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workoutSession: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    program: { findUnique: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import {
  getClientWorkoutSessions,
  updateSessionDate,
  scheduleProgramForClientAction,
} from '../calendar-actions'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockSessionFindMany = vi.mocked(prisma.workoutSession.findMany)
const mockSessionFindUnique = vi.mocked(prisma.workoutSession.findUnique)
const mockProgramFindUnique = vi.mocked(prisma.program.findUnique)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)

const trainer = { id: 'trainer_1', role: 'TRAINER' }
const otherTrainer = { id: 'trainer_2', role: 'TRAINER' }
const client = { id: 'client_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getClientWorkoutSessions', () => {
  it('allows a client fetching their own sessions', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockSessionFindMany.mockResolvedValue([] as never)

    const result = await getClientWorkoutSessions('client_1')

    expect(result.success).toBe(true)
  })

  it('rejects a client fetching another client\'s sessions', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)

    const result = await getClientWorkoutSessions('someone_else')

    expect(result.success).toBe(false)
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })

  it('allows a trainer fetching a roster client\'s sessions', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockSessionFindMany.mockResolvedValue([] as never)

    const result = await getClientWorkoutSessions('client_1')

    expect(result.success).toBe(true)
  })

  it('rejects a trainer fetching a non-roster client\'s sessions', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await getClientWorkoutSessions('client_1')

    expect(result.success).toBe(false)
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })
})

describe('updateSessionDate', () => {
  it('allows the owning trainer to update the date', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockSessionFindUnique.mockResolvedValue({
      clientId: 'client_1',
      plan: { createdById: 'trainer_1' },
    } as never)
    vi.mocked(prisma.workoutSession.update).mockResolvedValue({} as never)

    const result = await updateSessionDate('session_1', new Date('2026-08-22T00:00:00.000Z'))

    expect(result.success).toBe(true)
  })

  it('rejects a trainer who does not own the plan', async () => {
    mockGetCurrentUser.mockResolvedValue(otherTrainer as never)
    mockSessionFindUnique.mockResolvedValue({
      clientId: 'client_1',
      plan: { createdById: 'trainer_1' },
    } as never)

    const result = await updateSessionDate('session_1', new Date('2026-08-22T00:00:00.000Z'))

    expect(result.success).toBe(false)
    expect(prisma.workoutSession.update).not.toHaveBeenCalled()
  })

  it('still rejects a client updating another client\'s session', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockSessionFindUnique.mockResolvedValue({
      clientId: 'someone_else',
      plan: { createdById: 'trainer_1' },
    } as never)

    const result = await updateSessionDate('session_1', new Date('2026-08-22T00:00:00.000Z'))

    expect(result.success).toBe(false)
    expect(prisma.workoutSession.update).not.toHaveBeenCalled()
  })
})

describe('scheduleProgramForClientAction', () => {
  const baseInput = {
    programId: 'template_1',
    clientId: 'client_1',
    startDate: '2026-08-01',
  }

  it('rejects a trainer who does not own the source program', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockProgramFindUnique.mockResolvedValue({ id: 'template_1', trainerId: 'someone_else', workouts: [] } as never)

    const result = await scheduleProgramForClientAction(baseInput)

    expect(result.success).toBe(false)
    expect(prisma.program.create).not.toHaveBeenCalled()
  })

  it('rejects a trainer assigning to a non-roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await scheduleProgramForClientAction(baseInput)

    expect(result.success).toBe(false)
    expect(mockProgramFindUnique).not.toHaveBeenCalled()
    expect(prisma.program.create).not.toHaveBeenCalled()
  })

  it('allows a trainer scheduling their own program for a roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockProgramFindUnique.mockResolvedValue({
      id: 'template_1',
      trainerId: 'trainer_1',
      name: 'Template',
      description: null,
      durationWeeks: 4,
      daysPerWeek: 3,
      tags: [],
      workouts: [],
    } as never)
    vi.mocked(prisma.program.create).mockResolvedValue({ id: 'new_program_1' } as never)

    const result = await scheduleProgramForClientAction(baseInput)

    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run actions/__tests__/calendar-actions.test.ts`
Expected: FAIL — none of the three functions check ownership yet, so the "rejects" tests wrongly succeed (or error on missing mocks) and the "allows" tests may fail on call-count mismatches.

- [ ] **Step 3: Implement the three fixes**

In `actions/calendar-actions.ts`, add the import:

```ts
import { getClientIdsForTrainer } from "@/lib/services/client.service";
```

Update `getClientWorkoutSessions` — replace the `// Optional: add a check...` comment with a real check:

```ts
export async function getClientWorkoutSessions(clientId: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Unauthorized");
    }

    if (user.role === "CLIENT" && user.id !== clientId) {
      throw new Error("Unauthorized");
    }
    if (user.role === "TRAINER") {
      const clientIds = await getClientIdsForTrainer(user.id);
      if (!clientIds.includes(clientId)) {
        throw new Error("Unauthorized");
      }
    }

    const sessions = await db.workoutSession.findMany({
      where: {
        clientId,
      },
      include: {
        plan: {
          select: {
            title: true,
          }
        }
      },
      orderBy: {
        scheduledDate: "asc",
      },
    });

    return { success: true, sessions };
  } catch (error) {
    console.error("Error fetching client workout sessions:", error);
    return { success: false, error: "Failed to fetch workout sessions" };
  }
}
```

Update `updateSessionDate` — replace the `// Trainer authorization would go here as well` comment with a real check, using the `plan.createdById` field already selected:

```ts
if (user.role === "CLIENT" && session.clientId !== user.id) {
   return { success: false, error: "Unauthorized" };
}

if (user.role === "TRAINER" && session.plan?.createdById !== user.id) {
  return { success: false, error: "Unauthorized" };
}
```

(Replace just the two-line comment-plus-nothing with this second `if` block; the existing CLIENT check above it is unchanged.)

Update `scheduleProgramForClientAction` — add the client-roster check right after the role check, and the program-ownership check right after fetching `sourceProgram`:

```ts
export async function scheduleProgramForClientAction({
  programId,
  clientId,
  startDate,
  preferredWeekdays,
  customWorkoutDates,
}: {
  programId: string;
  clientId: string;
  startDate: string;
  preferredWeekdays?: string[];
  customWorkoutDates?: Record<string, string>;
}) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "TRAINER") {
      return { success: false, error: "Unauthorized or Forbidden" };
    }

    const clientIds = await getClientIdsForTrainer(user.id);
    if (!clientIds.includes(clientId)) {
      return { success: false, error: "Unauthorized or Forbidden" };
    }

    const sourceProgram = await db.program.findUnique({
      where: { id: programId },
      include: {
        workouts: {
          include: {
            blocks: {
              include: {
                exercises: {
                  include: {
                    sets: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!sourceProgram) {
      return { success: false, error: "Program not found" };
    }

    if (sourceProgram.trainerId !== user.id) {
      return { success: false, error: "Unauthorized or Forbidden" };
    }

    // ...rest of the function is unchanged...
```

(Only the two new checks are added — everything else in the function, from the date-parsing logic onward, stays exactly as it is today.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/calendar-actions.test.ts`
Expected: PASS, all 10 cases.

- [ ] **Step 5: Run the full project test suite**

Run: `npm test`
Expected: PASS — this project currently has 531 tests across 62 files before this task; expect 531 + 10 = 541 across 63 files.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 2: `assignProgramAction` — client-roster check

**Files:**
- Modify: `actions/program-actions.ts` (`assignProgramAction`)
- Modify: `actions/__tests__/program-actions-audit.test.ts` (update the existing `describe('assignProgramAction', ...)` block's mocks)

**Interfaces:**
- Consumes: `getClientIdsForTrainer` from `@/lib/services/client.service`.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Update the existing test file's mocks and add one new test**

`actions/__tests__/program-actions-audit.test.ts` currently mocks `@/lib/services/client.service`? — it does not yet; add the mock alongside the other `vi.mock` calls near the top of the file:

```ts
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
```

Add the import and mock handle alongside the existing ones:

```ts
import { getClientIdsForTrainer } from '@/lib/services/client.service'
// ...
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
```

Update the existing `'clones the source program and assigns the clone, never the original'` test — it needs `mockGetClientIds.mockResolvedValue(['client_1'])` added (since `clientId: 'client_1'` is what the test's input uses) right alongside its existing `mockProgramFindUnique.mockResolvedValue(...)` line, otherwise the new roster check will reject it once implemented.

The existing `'rejects when the requesting trainer does not own the program'` test does NOT need a `getClientIdsForTrainer` mock added — the program-ownership check still runs and rejects first regardless of roster (verify this stays true once you see Step 3's exact check ordering: program-ownership check comes first in this function, so a missing roster mock there just means `getClientIdsForTrainer` is never called, which is fine and requires no mock).

Add one new test to the same `describe('assignProgramAction', ...)` block:

```ts
it('rejects when the client is not in the trainer\'s roster', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1' } as never)
  mockGetClientIds.mockResolvedValue(['someone_else'])

  const result = await assignProgramAction({
    programId: 'template_1',
    clientId: 'client_1',
    startDate: '2026-08-01T00:00:00.000Z',
  })

  expect(result).toEqual({ success: false, error: 'Forbidden' })
  expect(mockDuplicateProgram).not.toHaveBeenCalled()
  expect(mockAssignProgram).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npx vitest run actions/__tests__/program-actions-audit.test.ts`
Expected: FAIL on the new test (the roster check doesn't exist yet, so nothing rejects); the two pre-existing `assignProgramAction` tests should still pass since their mocks were already updated to match the code that's about to exist.

- [ ] **Step 3: Implement the check**

In `actions/program-actions.ts`, add the import:

```ts
import { getClientIdsForTrainer } from "@/lib/services/client.service";
```

Update `assignProgramAction` — the existing program-ownership check is:

```ts
const program = await prisma.program.findUnique({
  where: { id: parsed.data.programId },
  select: { trainerId: true },
});
if (!program || program.trainerId !== user.id) {
  return { success: false as const, error: "Forbidden" };
}
```

Add the roster check immediately after it:

```ts
const program = await prisma.program.findUnique({
  where: { id: parsed.data.programId },
  select: { trainerId: true },
});
if (!program || program.trainerId !== user.id) {
  return { success: false as const, error: "Forbidden" };
}

const clientIds = await getClientIdsForTrainer(user.id);
if (!clientIds.includes(parsed.data.clientId)) {
  return { success: false as const, error: "Forbidden" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/program-actions-audit.test.ts`
Expected: PASS, all cases in the file (the pre-existing ones plus the new one).

- [ ] **Step 5: Run the full project test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 3: `getCalendarSessions`, `createAssessmentAction`, `addBodyMetricAction`, `createClinicalNoteAction` — client-roster checks

These four fixes are the identical shape (add a `getClientIdsForTrainer` roster check for a trainer-supplied `clientId`) across four different files — batched into one dispatch since they're mechanically the same edit repeated.

**Files:**
- Modify: `actions/calendar-workout-actions.ts` (`getCalendarSessions`)
- Modify: `actions/assessment-actions.ts` (`createAssessmentAction`)
- Modify: `actions/progress-actions.ts` (`addBodyMetricAction`)
- Modify: `actions/clinical-note-actions.ts` (`createClinicalNoteAction`)
- Test: Create `actions/__tests__/assessment-actions.test.ts`, `actions/__tests__/progress-actions.test.ts`, `actions/__tests__/clinical-note-actions.test.ts`. `getCalendarSessions` gets no new test (see below).

**Interfaces:**
- Consumes: `getClientIdsForTrainer` from `@/lib/services/client.service`.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: `getCalendarSessions` (`actions/calendar-workout-actions.ts`)**

This function currently has zero live callers (confirmed dead code). No test infrastructure exists for this file's other ~18 similar functions beyond what this task adds, and since this specific function is unreachable, add the fix without a dedicated test (matching the "don't add tests for dead code beyond the fix itself" judgment call — the fix is a one-line addition of an already-tested pattern).

Add the import if not already present: `import { getClientIdsForTrainer } from "@/lib/services/client.service";` (check the top of the file first — if `program.trainerId`-style checks already import something from `client.service`, just widen that import; otherwise add a new line).

Current:
```ts
export async function getCalendarSessions(clientId: string) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const sessions = await prisma.workoutSessionV2.findMany({
```

Change to:
```ts
export async function getCalendarSessions(clientId: string) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(clientId)) {
    return { success: false as const, error: "Unauthorized" };
  }

  try {
    const sessions = await prisma.workoutSessionV2.findMany({
```

- [ ] **Step 2: Write the failing tests for the other three**

Create `actions/__tests__/assessment-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/outcome.service', () => ({ recordAssessment: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as outcomeService from '@/lib/services/outcome.service'
import { createAssessmentAction } from '../assessment-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockRecordAssessment = vi.mocked(outcomeService.recordAssessment)

const dbTrainer = { id: 'trainer_1', clerkId: 'clerk_1', role: 'TRAINER' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createAssessmentAction', () => {
  it('allows a trainer recording an assessment for a roster client', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockRecordAssessment.mockResolvedValue({ id: 'assessment_1' } as never)

    const result = await createAssessmentAction({
      clientId: 'client_1',
      assessmentType: 'weight',
      value: 150,
      unit: 'lbs',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a trainer recording an assessment for a non-roster client', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await createAssessmentAction({
      clientId: 'client_1',
      assessmentType: 'weight',
      value: 150,
      unit: 'lbs',
    })

    expect(result.success).toBe(false)
    expect(mockRecordAssessment).not.toHaveBeenCalled()
  })
})
```

Create `actions/__tests__/progress-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/progress.service', () => ({ addBodyMetric: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as progressService from '@/lib/services/progress.service'
import { addBodyMetricAction } from '../progress-actions'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockAddBodyMetric = vi.mocked(progressService.addBodyMetric)

const trainer = { id: 'trainer_1', role: 'TRAINER' }
const client = { id: 'client_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('addBodyMetricAction', () => {
  it('allows a client adding their own metric', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockAddBodyMetric.mockResolvedValue({ id: 'metric_1' } as never)

    const result = await addBodyMetricAction('client_1', 'weight', 150, 'lbs')

    expect(result.success).toBe(true)
  })

  it("rejects a client adding another client's metric", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)

    const result = await addBodyMetricAction('someone_else', 'weight', 150, 'lbs')

    expect(result.success).toBe(false)
    expect(mockAddBodyMetric).not.toHaveBeenCalled()
  })

  it('allows a trainer adding a metric for a roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockAddBodyMetric.mockResolvedValue({ id: 'metric_1' } as never)

    const result = await addBodyMetricAction('client_1', 'weight', 150, 'lbs')

    expect(result.success).toBe(true)
  })

  it('rejects a trainer adding a metric for a non-roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await addBodyMetricAction('client_1', 'weight', 150, 'lbs')

    expect(result.success).toBe(false)
    expect(mockAddBodyMetric).not.toHaveBeenCalled()
  })
})
```

Create `actions/__tests__/clinical-note-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/clinical-note.service', () => ({ createNote: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireRole } from '@/lib/current-user'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as noteService from '@/lib/services/clinical-note.service'
import { createClinicalNoteAction } from '../clinical-note-actions'

const mockRequireRole = vi.mocked(requireRole)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockCreateNote = vi.mocked(noteService.createNote)

const trainer = { id: 'trainer_1', firstName: 'Jane', lastName: 'Doe', clerkOrgId: 'org_1' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createClinicalNoteAction', () => {
  it('allows a trainer creating a note for a roster client', async () => {
    mockRequireRole.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockCreateNote.mockResolvedValue({ id: 'note_1' } as never)

    const result = await createClinicalNoteAction('client_1', { appointmentDate: '2026-08-20' })

    expect(result.success).toBe(true)
  })

  it('rejects a trainer creating a note for a non-roster client', async () => {
    mockRequireRole.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await createClinicalNoteAction('client_1', { appointmentDate: '2026-08-20' })

    expect(result.success).toBe(false)
    expect(mockCreateNote).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run actions/__tests__/assessment-actions.test.ts actions/__tests__/progress-actions.test.ts actions/__tests__/clinical-note-actions.test.ts`
Expected: FAIL — none of the three functions check the roster yet.

- [ ] **Step 4: Implement the three fixes**

In `actions/assessment-actions.ts`, add the import `import { getClientIdsForTrainer } from "@/lib/services/client.service";` and update `createAssessmentAction`:

```ts
// Clients always record for themselves; trainers must supply a clientId
if (dbUser.role === "TRAINER" && !input.clientId) {
  return { success: false as const, error: "Please select a client" };
}
if (dbUser.role === "TRAINER" && input.clientId) {
  const clientIds = await getClientIdsForTrainer(dbUser.id);
  if (!clientIds.includes(input.clientId)) {
    return { success: false as const, error: "Unauthorized" };
  }
}
const resolvedClientId =
  dbUser.role === "CLIENT" ? dbUser.id : (input.clientId ?? "");
```

In `actions/progress-actions.ts`, add the import and update `addBodyMetricAction`:

```ts
export async function addBodyMetricAction(
  clientId: string,
  metricType: string,
  value: number,
  unit: string,
  notes?: string
) {
  const user = await getCurrentUser();

  // Clients can only add metrics for themselves; trainers for their own roster
  if (user.role === "CLIENT" && user.id !== clientId) {
    return { success: false as const, error: "Forbidden" };
  }
  if (user.role === "TRAINER") {
    const clientIds = await getClientIdsForTrainer(user.id);
    if (!clientIds.includes(clientId)) {
      return { success: false as const, error: "Forbidden" };
    }
  }

  try {
```

In `actions/clinical-note-actions.ts`, add the import and update `createClinicalNoteAction`:

```ts
export async function createClinicalNoteAction(
  clientId: string,
  data: ClinicalNoteFormData
) {
  const trainer = await requireRole("TRAINER");

  const clientIds = await getClientIdsForTrainer(trainer.id);
  if (!clientIds.includes(clientId)) {
    return { success: false as const, error: "Unauthorized" };
  }

  if (!data.appointmentDate) {
    return { success: false as const, error: "Appointment date is required" };
  }

  try {
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/assessment-actions.test.ts actions/__tests__/progress-actions.test.ts actions/__tests__/clinical-note-actions.test.ts`
Expected: PASS, all cases.

- [ ] **Step 6: Run the full project test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 4: `/messages/[threadId]` page — same-org check

**Files:**
- Modify: `app/(platform)/messages/[threadId]/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Add the check**

This is the lowest-severity item (name-only enumeration; message content is already properly scoped by `getThread`). No test infrastructure exists for pages in this repo (per the two prior sub-projects' plans in this session) — this is a one-line page fix verified by type-check only.

Current:
```ts
const otherUser = await prisma.user.findUnique({ where: { id: threadId } });
if (!otherUser) notFound();
```

Change to:
```ts
const otherUser = await prisma.user.findUnique({ where: { id: threadId } });
if (!otherUser || otherUser.clerkOrgId !== user.clerkOrgId) notFound();
```

This matches the org-scoped membership convention already established (`getClientIdsForTrainer`, `getTrainerForClient`) — a message thread is only ever between two people in the same org.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean — confirm `user` (from `getCurrentUser()` at the top of this file) has a `clerkOrgId` field on its type.

- [ ] **Step 3: Run the full project test suite**

Run: `npm test`
Expected: PASS — no regression.

- [ ] **Step 4: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.
