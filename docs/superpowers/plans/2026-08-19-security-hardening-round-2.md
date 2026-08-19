# Security Hardening Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 8 more authorization gaps found while auditing for neighbors of the gaps a prior plan fixed — most severely, `getClientExerciseHistory` has no authentication at all, and two `habit-actions.ts` functions have docstrings claiming ownership protection that doesn't actually exist in the code.

**Architecture:** Every fix reuses one of the same two patterns established across three prior plans this session: `getClientIdsForTrainer(trainerId)` for client-roster membership checks, or a direct ownership-field comparison for program/resource-scoped checks. `duplicateProgram` additionally needs an `isPublic || isGlobal` exception, since this codebase has a legitimate cross-trainer template-sharing feature that a flat ownership deny would break.

**Tech Stack:** Next.js server actions, Prisma (MongoDB), Vitest.

**Spec:** None — bounded fix to existing code using patterns already validated three times this session. Design presented and approved in chat.

## Global Constraints

- Every check fails closed.
- `duplicateProgram`'s check must allow `source.trainerId === trainerId` (owns it) OR `source.isPublic` OR `source.isGlobal` (legitimate shared templates) — a flat deny would break the existing public/global template duplication feature.
- Where a function takes an optional client-identifying parameter (unassigning a client, creating a template with no client), only check ownership when that parameter is actually present — do not reject the "no client" case.
- Client-scoped resources use `getClientIdsForTrainer`; where the resource itself carries the client id indirectly (a habit, a feedback row) rather than as a direct function parameter, fetch the resource first to get its `clientId`, then check.

---

### Task 1: `actions/habit-actions.ts` — 3 fixes

**Files:**
- Modify: `actions/habit-actions.ts` (`createHabitAction`, `logHabitAction`, `deleteHabitAction`)
- Test: Create `actions/__tests__/habit-actions.test.ts`

**Interfaces:**
- Consumes: `getClientIdsForTrainer` from `@/lib/services/client.service`; `prisma` from `@/lib/prisma` (for the new habit-ownership lookups in `logHabitAction`/`deleteHabitAction`).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/habit-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { habitDefinition: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/habit.service', () => ({
  createHabit: vi.fn(),
  logHabit: vi.fn(),
  deleteHabit: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as habitService from '@/lib/services/habit.service'
import { createHabitAction, logHabitAction, deleteHabitAction } from '../habit-actions'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockHabitFindUnique = vi.mocked(prisma.habitDefinition.findUnique)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockCreateHabit = vi.mocked(habitService.createHabit)
const mockLogHabit = vi.mocked(habitService.logHabit)
const mockDeleteHabit = vi.mocked(habitService.deleteHabit)

const trainer = { id: 'trainer_1', role: 'TRAINER' }
const client = { id: 'client_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createHabitAction', () => {
  it('allows a trainer creating a habit for a roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockCreateHabit.mockResolvedValue({ id: 'habit_1' } as never)

    const result = await createHabitAction({ clientId: 'client_1', name: 'Sleep 8h' })

    expect(result.success).toBe(true)
  })

  it('rejects a trainer creating a habit for a non-roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await createHabitAction({ clientId: 'client_1', name: 'Sleep 8h' })

    expect(result.success).toBe(false)
    expect(mockCreateHabit).not.toHaveBeenCalled()
  })

  it('allows a client creating their own habit', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockCreateHabit.mockResolvedValue({ id: 'habit_1' } as never)

    const result = await createHabitAction({ name: 'Sleep 8h' })

    expect(result.success).toBe(true)
  })
})

describe('logHabitAction', () => {
  it('allows the owning client to log their own habit', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1' } as never)
    mockLogHabit.mockResolvedValue({ id: 'log_1' } as never)

    const result = await logHabitAction('habit_1', true)

    expect(result.success).toBe(true)
  })

  it("rejects a client logging another client's habit", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'someone_else' } as never)

    const result = await logHabitAction('habit_1', true)

    expect(result.success).toBe(false)
    expect(mockLogHabit).not.toHaveBeenCalled()
  })

  it('allows a trainer logging a roster client\'s habit', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1' } as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockLogHabit.mockResolvedValue({ id: 'log_1' } as never)

    const result = await logHabitAction('habit_1', true)

    expect(result.success).toBe(true)
  })

  it("rejects a trainer logging a non-roster client's habit", async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1' } as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await logHabitAction('habit_1', true)

    expect(result.success).toBe(false)
    expect(mockLogHabit).not.toHaveBeenCalled()
  })
})

describe('deleteHabitAction', () => {
  it('allows the owning client to delete their own habit', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1' } as never)
    mockDeleteHabit.mockResolvedValue({} as never)

    const result = await deleteHabitAction('habit_1')

    expect(result.success).toBe(true)
  })

  it("rejects a trainer deleting a non-roster client's habit", async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1' } as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await deleteHabitAction('habit_1')

    expect(result.success).toBe(false)
    expect(mockDeleteHabit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run actions/__tests__/habit-actions.test.ts`
Expected: FAIL — none of the three functions check ownership yet.

- [ ] **Step 3: Implement the three fixes**

In `actions/habit-actions.ts`, add imports:

```ts
import { prisma } from "@/lib/prisma";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
```

Update `createHabitAction`'s TRAINER branch:

```ts
if (user.role === "TRAINER") {
  if (!data.clientId) {
    return { success: false, error: "Client is required when creating a habit as a trainer" };
  }
  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(data.clientId)) {
    return { success: false, error: "Unauthorized" };
  }
  targetClientId = data.clientId;
} else {
  // CLIENT — always their own id
  targetClientId = user.id;
}
```

Update `logHabitAction`:

```ts
export async function logHabitAction(
  habitId: string,
  completed: boolean,
  value?: number,
  notes?: string
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();

  if (!habitId) {
    return { success: false, error: "Habit ID is required" };
  }

  const habit = await prisma.habitDefinition.findUnique({
    where: { id: habitId },
    select: { clientId: true },
  });
  if (!habit) {
    return { success: false, error: "Habit not found" };
  }
  if (user.role === "CLIENT" && habit.clientId !== user.id) {
    return { success: false, error: "Unauthorized" };
  }
  if (user.role === "TRAINER") {
    const clientIds = await getClientIdsForTrainer(user.id);
    if (!clientIds.includes(habit.clientId)) {
      return { success: false, error: "Unauthorized" };
    }
  }

  try {
    const log = await habitService.logHabit(
      habitId,
      new Date(),
      completed,
      value,
      notes
    );

    revalidatePath("/habits");
    revalidatePath("/dashboard");

    return { success: true, data: { id: log.id } };
  } catch (error) {
    console.error("logHabitAction failed:", error);
    return { success: false, error: "Failed to log habit" };
  }
}
```

Update `deleteHabitAction` identically (same ownership-check block, before the `try`):

```ts
export async function deleteHabitAction(
  habitId: string
): Promise<ActionResult> {
  const user = await getCurrentUser();

  if (!habitId) {
    return { success: false, error: "Habit ID is required" };
  }

  const habit = await prisma.habitDefinition.findUnique({
    where: { id: habitId },
    select: { clientId: true },
  });
  if (!habit) {
    return { success: false, error: "Habit not found" };
  }
  if (user.role === "CLIENT" && habit.clientId !== user.id) {
    return { success: false, error: "Unauthorized" };
  }
  if (user.role === "TRAINER") {
    const clientIds = await getClientIdsForTrainer(user.id);
    if (!clientIds.includes(habit.clientId)) {
      return { success: false, error: "Unauthorized" };
    }
  }

  try {
    await habitService.deleteHabit(habitId);

    revalidatePath("/habits");
    revalidatePath("/dashboard");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteHabitAction failed:", error);
    return { success: false, error: "Failed to delete habit" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/habit-actions.test.ts`
Expected: PASS, all 9 cases.

- [ ] **Step 5: Run the full project test suite**

Run: `npm test`
Expected: PASS — this project currently has 552 tests across 66 files before this task; expect 552 + 9 = 561 across 67 files.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 2: `duplicateProgram` — ownership-or-public/global check

**Files:**
- Modify: `lib/services/program.service.ts` (`duplicateProgram`)
- Modify: `lib/services/__tests__/program.service.test.ts` (add a new describe block)

**Interfaces:**
- Consumes: nothing new (no import needed — `source.trainerId`/`isPublic`/`isGlobal` all come from the existing `getProgramById(id)` call already in this function).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the failing tests**

Add to `lib/services/__tests__/program.service.test.ts`:

```ts
import { duplicateProgram } from '../program.service'
```

(add `duplicateProgram` to the existing named import from `'../program.service'`)

```ts
describe('duplicateProgram', () => {
  it('allows a trainer to duplicate their own program', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'prog_1', trainerId: 'trainer_1', isPublic: false, isGlobal: false,
      name: 'Program', workouts: [],
    } as never)
    mockCreate.mockResolvedValue({ id: 'copy_1' } as never)

    const result = await duplicateProgram('prog_1', 'trainer_1')

    expect(result).toBeDefined()
    expect(mockCreate).toHaveBeenCalled()
  })

  it('allows a trainer to duplicate a public program they do not own', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'prog_1', trainerId: 'someone_else', isPublic: true, isGlobal: false,
      name: 'Program', workouts: [],
    } as never)
    mockCreate.mockResolvedValue({ id: 'copy_1' } as never)

    const result = await duplicateProgram('prog_1', 'trainer_1')

    expect(result).toBeDefined()
    expect(mockCreate).toHaveBeenCalled()
  })

  it('allows a trainer to duplicate a global program they do not own', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'prog_1', trainerId: null, isPublic: false, isGlobal: true,
      name: 'Program', workouts: [],
    } as never)
    mockCreate.mockResolvedValue({ id: 'copy_1' } as never)

    const result = await duplicateProgram('prog_1', 'trainer_1')

    expect(result).toBeDefined()
    expect(mockCreate).toHaveBeenCalled()
  })

  it('rejects duplicating another trainer\'s private, non-global program', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'prog_1', trainerId: 'someone_else', isPublic: false, isGlobal: false,
      name: 'Program', workouts: [],
    } as never)

    await expect(duplicateProgram('prog_1', 'trainer_1')).rejects.toThrow()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/program.service.test.ts -t duplicateProgram`
Expected: the 4th test FAILS (no ownership check exists yet, so it doesn't reject); the first 3 should already pass since nothing blocks them today.

- [ ] **Step 3: Implement the check**

In `lib/services/program.service.ts`, update `duplicateProgram`:

```ts
export async function duplicateProgram(
  id: string,
  trainerId: string,
  asTemplate = false
) {
  const source = await getProgramById(id);
  if (!source) throw new Error("Program not found");

  if (source.trainerId !== trainerId && !source.isPublic && !source.isGlobal) {
    throw new Error("Unauthorized");
  }

  const workouts = source.workouts.map((w, wi) => ({
```

(Only the new `if` block is added — everything else in the function is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/program.service.test.ts -t duplicateProgram`
Expected: PASS, all 4 cases.

- [ ] **Step 5: Run the full project test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 3: `assignCheckInAction` and `assignClientToPlanAction` — client-roster checks

**Files:**
- Modify: `actions/checkin-actions.ts` (`assignCheckInAction`)
- Modify: `actions/workout-actions.ts` (`assignClientToPlanAction`)
- Test: Create `actions/__tests__/checkin-actions.test.ts`, `actions/__tests__/workout-actions-assign.test.ts`

**Interfaces:**
- Consumes: `getClientIdsForTrainer` from `@/lib/services/client.service`.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/checkin-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/checkin.service', () => ({ assignTemplateToClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireRole } from '@/lib/current-user'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as checkinService from '@/lib/services/checkin.service'
import { assignCheckInAction } from '../checkin-actions'

const mockRequireRole = vi.mocked(requireRole)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockAssignTemplate = vi.mocked(checkinService.assignTemplateToClient)

const trainer = { id: 'trainer_1' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('assignCheckInAction', () => {
  it('allows assigning a template to a roster client', async () => {
    mockRequireRole.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockAssignTemplate.mockResolvedValue({ id: 'assignment_1' } as never)

    const result = await assignCheckInAction('template_1', 'client_1')

    expect(result.success).toBe(true)
  })

  it('rejects assigning a template to a non-roster client', async () => {
    mockRequireRole.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await assignCheckInAction('template_1', 'client_1')

    expect(result.success).toBe(false)
    expect(mockAssignTemplate).not.toHaveBeenCalled()
  })
})
```

Create `actions/__tests__/workout-actions-assign.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workoutPlan: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import { assignClientToPlanAction } from '../workout-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockPlanFind = vi.mocked(prisma.workoutPlan.findUnique)
const mockPlanUpdate = vi.mocked(prisma.workoutPlan.update)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)

const dbTrainer = { id: 'trainer_1', role: 'TRAINER' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('assignClientToPlanAction', () => {
  it('allows assigning a plan to a roster client', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockPlanFind.mockResolvedValue({ createdById: 'trainer_1' } as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockPlanUpdate.mockResolvedValue({} as never)

    const result = await assignClientToPlanAction('plan_1', 'client_1')

    expect(result.success).toBe(true)
  })

  it('rejects assigning a plan to a non-roster client', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockPlanFind.mockResolvedValue({ createdById: 'trainer_1' } as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await assignClientToPlanAction('plan_1', 'client_1')

    expect(result.success).toBe(false)
    expect(mockPlanUpdate).not.toHaveBeenCalled()
  })

  it('allows unassigning a client (null clientId) without a roster check', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockPlanFind.mockResolvedValue({ createdById: 'trainer_1' } as never)
    mockPlanUpdate.mockResolvedValue({} as never)

    const result = await assignClientToPlanAction('plan_1', null)

    expect(result.success).toBe(true)
    expect(mockGetClientIds).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run actions/__tests__/checkin-actions.test.ts actions/__tests__/workout-actions-assign.test.ts`
Expected: FAIL — neither function checks the roster yet.

- [ ] **Step 3: Implement the two fixes**

In `actions/checkin-actions.ts`, add the import `import { getClientIdsForTrainer } from "@/lib/services/client.service";` and update `assignCheckInAction`:

```ts
export async function assignCheckInAction(
  templateId: string,
  clientId: string
) {
  const user = await requireRole("TRAINER");

  if (!templateId || !clientId) {
    return { success: false as const, error: "Template and client are required" };
  }

  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(clientId)) {
    return { success: false as const, error: "Unauthorized" };
  }

  try {
    const assignment = await checkinService.assignTemplateToClient(
```

(Only the new `clientIds`/`if` block is added between the existing validation and the `try` block — everything else is unchanged.)

In `actions/workout-actions.ts`, add the import (or widen it if `client.service` is already imported in this file — check first) and update `assignClientToPlanAction`:

```ts
export async function assignClientToPlanAction(planId: string, clientId: string | null) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const plan = await prisma.workoutPlan.findUnique({
    where: { id: planId },
    select: { createdById: true },
  });
  if (!plan || plan.createdById !== dbUser.id) {
    return { success: false as const, error: "Forbidden" };
  }

  if (clientId) {
    const clientIds = await getClientIdsForTrainer(dbUser.id);
    if (!clientIds.includes(clientId)) {
      return { success: false as const, error: "Forbidden" };
    }
  }

  try {
    await prisma.workoutPlan.update({
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/checkin-actions.test.ts actions/__tests__/workout-actions-assign.test.ts`
Expected: PASS, all 5 cases.

- [ ] **Step 5: Run the full project test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 4: `getClientExerciseHistory` — add authentication and ownership (most severe fix in this round)

**Files:**
- Modify: `actions/exercise-history-actions.ts`
- Test: Create `actions/__tests__/exercise-history-actions.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser` from `@/lib/current-user`; `getClientIdsForTrainer` from `@/lib/services/client.service`.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/exercise-history-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { workoutSessionV2: { findMany: vi.fn() } },
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import { getClientExerciseHistory } from '../exercise-history-actions'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockSessionFindMany = vi.mocked(prisma.workoutSessionV2.findMany)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)

const trainer = { id: 'trainer_1', role: 'TRAINER' }
const client = { id: 'client_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getClientExerciseHistory', () => {
  it('propagates when the caller is unauthenticated (getCurrentUser redirects/throws)', async () => {
    // getCurrentUser() calls Next.js redirect() internally for an unauthenticated
    // caller, which throws a special signal Next.js's framework catches to actually
    // redirect the browser. It must NEVER be swallowed by a try/catch — this test
    // simulates that by having the mock reject, and asserts the rejection propagates
    // out of getClientExerciseHistory rather than being converted into a graceful
    // {success:false} return.
    mockGetCurrentUser.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(getClientExerciseHistory('client_1', 'exercise_1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })

  it('allows a client fetching their own exercise history', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockSessionFindMany.mockResolvedValue([] as never)

    const result = await getClientExerciseHistory('client_1', 'exercise_1')

    expect(result.success).toBe(true)
  })

  it("rejects a client fetching another client's exercise history", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)

    const result = await getClientExerciseHistory('someone_else', 'exercise_1')

    expect(result.success).toBe(false)
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })

  it('allows a trainer fetching a roster client\'s exercise history', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockSessionFindMany.mockResolvedValue([] as never)

    const result = await getClientExerciseHistory('client_1', 'exercise_1')

    expect(result.success).toBe(true)
  })

  it('rejects a trainer fetching a non-roster client\'s exercise history', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await getClientExerciseHistory('client_1', 'exercise_1')

    expect(result.success).toBe(false)
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run actions/__tests__/exercise-history-actions.test.ts`
Expected: FAIL — the function has no auth at all today, so every case behaves the same (calls `findMany` unconditionally, no rejection).

- [ ] **Step 3: Implement authentication and ownership**

In `actions/exercise-history-actions.ts`, add the imports:

```ts
import { getCurrentUser } from "@/lib/current-user";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
```

Update the function — **critically, `getCurrentUser()` and the ownership checks must go BEFORE the existing `try` block, not inside it.** `getCurrentUser()` calls Next.js's `redirect()` internally when there's no authenticated caller, which works by throwing a special signal that Next.js's framework catches to actually perform the redirect — if that throw were caught by a surrounding `try/catch`, the redirect would be silently swallowed and replaced with a generic error instead. This exact codebase already establishes the convention of calling `getCurrentUser()` outside any `try` block (see `addBodyMetricAction` in `actions/progress-actions.ts`, fixed in an earlier plan) — follow it here too:

```ts
export async function getClientExerciseHistory(clientId: string, exerciseId: string, limit: number = 3) {
  const user = await getCurrentUser();

  if (user.role === "CLIENT" && user.id !== clientId) {
    return { success: false, error: "Unauthorized" };
  }
  if (user.role === "TRAINER") {
    const clientIds = await getClientIdsForTrainer(user.id);
    if (!clientIds.includes(clientId)) {
      return { success: false, error: "Unauthorized" };
    }
  }

  try {
    const sessions = await prisma.workoutSessionV2.findMany({
```

(The rest of the function — the query itself, the `history` mapping, the return, and the existing `catch` block — is completely unchanged. Only the new `user`/ownership-check block is added, and it goes BEFORE the `try {`, not inside it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/exercise-history-actions.test.ts`
Expected: PASS, all 5 cases.

- [ ] **Step 5: Run the full project test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 5: `respondToFeedbackAction` — client-roster check

**Files:**
- Modify: `actions/feedback-actions.ts` (`respondToFeedbackAction`)
- Test: Create `actions/__tests__/feedback-actions.test.ts`

**Interfaces:**
- Consumes: `getClientIdsForTrainer` from `@/lib/services/client.service`; `prisma` (to fetch the feedback row's `clientId` before checking).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/feedback-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    exerciseFeedback: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/feedback.service', () => ({ respondToFeedback: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as feedbackService from '@/lib/services/feedback.service'
import { respondToFeedbackAction } from '../feedback-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockFeedbackFind = vi.mocked(prisma.exerciseFeedback.findUnique)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockRespondToFeedback = vi.mocked(feedbackService.respondToFeedback)

const dbTrainer = { id: 'trainer_1', role: 'TRAINER' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('respondToFeedbackAction', () => {
  it('allows a trainer responding to a roster client\'s feedback', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockFeedbackFind.mockResolvedValue({ clientId: 'client_1' } as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockRespondToFeedback.mockResolvedValue({} as never)

    const result = await respondToFeedbackAction({
      feedbackId: 'feedback_1',
      trainerResponse: 'Great work!',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a trainer responding to a non-roster client\'s feedback', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockFeedbackFind.mockResolvedValue({ clientId: 'client_1' } as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await respondToFeedbackAction({
      feedbackId: 'feedback_1',
      trainerResponse: 'Great work!',
    })

    expect(result.success).toBe(false)
    expect(mockRespondToFeedback).not.toHaveBeenCalled()
  })

  it('returns an error when the feedback does not exist', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockFeedbackFind.mockResolvedValue(null as never)

    const result = await respondToFeedbackAction({
      feedbackId: 'feedback_1',
      trainerResponse: 'Great work!',
    })

    expect(result.success).toBe(false)
    expect(mockRespondToFeedback).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run actions/__tests__/feedback-actions.test.ts`
Expected: FAIL — no roster check exists yet.

- [ ] **Step 3: Implement the fix**

In `actions/feedback-actions.ts`, add the import `import { getClientIdsForTrainer } from "@/lib/services/client.service";` and update `respondToFeedbackAction`:

```ts
export async function respondToFeedbackAction(input: {
  feedbackId: string;
  trainerResponse: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const parsed = respondToFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const feedback = await prisma.exerciseFeedback.findUnique({
    where: { id: parsed.data.feedbackId },
    select: { clientId: true },
  });
  if (!feedback) {
    return { success: false as const, error: "Feedback not found" };
  }
  const clientIds = await getClientIdsForTrainer(dbUser.id);
  if (!clientIds.includes(feedback.clientId)) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await feedbackService.respondToFeedback(parsed.data.feedbackId, parsed.data.trainerResponse);
    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
```

(Only the new `feedback`/`clientIds`/`if` block is added, between the existing `parsed` validation and the `try` block — everything else is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/feedback-actions.test.ts`
Expected: PASS, all 3 cases.

- [ ] **Step 5: Run the full project test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.
