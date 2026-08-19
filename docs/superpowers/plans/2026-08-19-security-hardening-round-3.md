# Security Hardening Round 3 (V1 Surface Closeout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the last known gaps in the legacy V1 plan surface, identified by a structural audit (round 2's final review concluded every remaining gap sits in the V1 data path — this plan audits that surface as one bounded unit rather than continuing an open-ended search). Fix `startSessionAction` (a client can start a session against any plan, not just their own), `markVoiceMemoRead` (any authenticated non-author can mark any memo read, not just a real participant), and `saveAiTemplateAction`'s redirect-swallowing anti-pattern. Document `getClientIdsForTrainer`'s actual scoping semantics so the next reader doesn't have to re-derive it.

**Architecture:** Two of the three fixes are the same ownership-check pattern used throughout this session's prior two rounds — fetch the resource, compare against the caller. The third (`saveAiTemplateAction`) is a structural fix: move `getCurrentUser()` outside the function's `try` block, matching the established convention already used elsewhere this session, since `getCurrentUser()`'s internal `redirect()` must never be swallowed by a surrounding catch.

**Tech Stack:** Next.js server actions, Prisma (MongoDB), Vitest.

**Spec:** None — bounded fix to existing code, scope determined by a structural audit presented in chat (V1 plan surface, confirmed complete via a full-file inventory of `workout-actions.ts` and `adherence-actions.ts` — every other exported function in both files already has a correct ownership check).

## Global Constraints

- Every check fails closed.
- `getCurrentUser()` must never be called inside a `try` block — its internal `redirect()` for unauthenticated callers throws a signal that must propagate to Next.js's framework, not be caught and converted into a generic error.
- This is explicitly the closing round for this session's authorization audit — the full V1 surface (`workout-actions.ts`, `adherence-actions.ts`) was inventoried function-by-function before writing this plan, confirming no other unfixed instance remains in those two files.

---

### Task 1: `startSessionAction` and `markVoiceMemoRead` — ownership/participant checks

**Files:**
- Modify: `actions/adherence-actions.ts` (`startSessionAction`)
- Modify: `actions/voice-memo-actions.ts` (`markVoiceMemoRead`)
- Test: Create `actions/__tests__/adherence-actions.test.ts`
- Test: Modify `actions/__tests__/voice-memo-actions.test.ts` (add one new test to the existing `describe('markVoiceMemoRead', ...)` block)

**Interfaces:**
- Consumes: nothing new — both fixes use `prisma` queries already available in each file.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/adherence-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workoutPlan: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/services/adherence.service', () => ({
  startSession: vi.fn(),
  completeSessionExercise: vi.fn(),
  completeSession: vi.fn(),
  abandonSession: vi.fn(),
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import * as adherenceService from '@/lib/services/adherence.service'
import { startSessionAction } from '../adherence-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockPlanFind = vi.mocked(prisma.workoutPlan.findUnique)
const mockStartSession = vi.mocked(adherenceService.startSession)

const dbClient = { id: 'client_1', clerkId: 'clerk_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('startSessionAction', () => {
  it('allows a client starting a session on their own plan', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockPlanFind.mockResolvedValue({ clientId: 'client_1' } as never)
    mockStartSession.mockResolvedValue({ id: 'session_1' } as never)

    const result = await startSessionAction('plan_1')

    expect(result.success).toBe(true)
  })

  it("rejects a client starting a session on another client's plan", async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockPlanFind.mockResolvedValue({ clientId: 'someone_else' } as never)

    const result = await startSessionAction('plan_1')

    expect(result.success).toBe(false)
    expect(mockStartSession).not.toHaveBeenCalled()
  })

  it('rejects when the plan does not exist', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockPlanFind.mockResolvedValue(null as never)

    const result = await startSessionAction('plan_1')

    expect(result.success).toBe(false)
    expect(mockStartSession).not.toHaveBeenCalled()
  })
})
```

Add one new test to the EXISTING `describe('markVoiceMemoRead', ...)` block in `actions/__tests__/voice-memo-actions.test.ts` (do not remove or modify the 3 existing tests in that block — they should still pass unchanged, since the existing "sets isRead to true" test already uses a mock where the caller genuinely is the program's trainer):

```ts
  it('rejects a non-participant (not this program\'s trainer or client) even if not the author', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    vi.mocked(prisma.voiceMemo.findFirst).mockResolvedValue({
      id: 'memo_1', workoutId: WORKOUT_ID, isRead: false,
      authorId: CLIENT_DB_ID,
      workout: { program: { trainerId: 'someone_elses_trainer_id', clientId: 'someone_elses_client_id' } },
    } as never)
    const result = await markVoiceMemoRead('memo_1')
    expect(result).toEqual({ success: false, error: 'Forbidden' })
  })
```

(Adapt `dbTrainer`'s id reference to whatever constant this test file already uses for `TRAINER_DB_ID` — read the file's existing top-of-file constants first to match exactly.)

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run actions/__tests__/adherence-actions.test.ts actions/__tests__/voice-memo-actions.test.ts`
Expected: the new `adherence-actions.test.ts` tests fail (no check exists yet); the existing 3 `markVoiceMemoRead` tests still pass; the new 4th one fails (no participant check exists yet, so a non-participant currently succeeds).

- [ ] **Step 3: Implement both fixes**

In `actions/adherence-actions.ts`, update `startSessionAction`:

```ts
export async function startSessionAction(planId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLIENT") return { success: false as const, error: "Forbidden" };

  const plan = await prisma.workoutPlan.findUnique({
    where: { id: planId },
    select: { clientId: true },
  });
  if (!plan || plan.clientId !== dbUser.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const session = await adherenceService.startSession(planId, dbUser.id);
    return { success: true as const, data: session };
  } catch (error) {
    console.error("Failed to start session:", error);
    return { success: false as const, error: "Failed to start session" };
  }
}
```

(Only the `plan`/`if` block is added, between the existing role check and the `try` block — the rest of the function is unchanged.)

In `actions/voice-memo-actions.ts`, update `markVoiceMemoRead`. Current:

```ts
    const memo = await prisma.voiceMemo.findFirst({
      where: { id: memoId },
      include: { workout: { include: { program: { select: { trainerId: true } } } } },
    })
    if (!memo) return { success: false, error: "Not found" }

    // Only the recipient can mark as read (not the author)
    if (memo.authorId === user.id) {
      return { success: false, error: "Forbidden" }
    }
```

Change to:

```ts
    const memo = await prisma.voiceMemo.findFirst({
      where: { id: memoId },
      include: { workout: { include: { program: { select: { trainerId: true, clientId: true } } } } },
    })
    if (!memo) return { success: false, error: "Not found" }

    // Only a genuine participant in this program (its trainer or its client) may
    // mark a memo as read, and never the memo's own author.
    const isParticipant =
      user.id === memo.workout.program.trainerId || user.id === memo.workout.program.clientId;
    if (!isParticipant || memo.authorId === user.id) {
      return { success: false, error: "Forbidden" }
    }
```

(The rest of the function — the `prisma.voiceMemo.update` call and the trainer-notification logic below it — is unchanged. Only the `select` gains `clientId: true`, and the single `if` check is replaced with the two-part `isParticipant` check.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/adherence-actions.test.ts actions/__tests__/voice-memo-actions.test.ts`
Expected: PASS, all cases (3 new + all markVoiceMemoRead tests including the new 4th).

- [ ] **Step 5: Run the full project test suite**

Run: `npm test`
Expected: PASS — this project currently has 584 tests across 73 files before this task; expect 584 + 4 = 588 across 74 files (1 new test file for adherence-actions, 1 new test added to the existing voice-memo-actions file).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.

---

### Task 2: `saveAiTemplateAction` restructure + `getClientIdsForTrainer` docstring

**Files:**
- Modify: `actions/workout-actions.ts` (`saveAiTemplateAction`)
- Modify: `lib/services/client.service.ts` (add a docstring above `getClientIdsForTrainer`)
- Test: Create `actions/__tests__/workout-actions-save-template.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/workout-actions-save-template.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { workoutPlan: { create: vi.fn() } },
}))
vi.mock('@/lib/services/ai.service', () => ({ generateWorkoutPlan: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import { saveAiTemplateAction } from '../workout-actions'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockPlanCreate = vi.mocked(prisma.workoutPlan.create)

const trainer = { id: 'trainer_1', role: 'TRAINER' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('saveAiTemplateAction', () => {
  it('propagates when the caller is unauthenticated (getCurrentUser redirects/throws)', async () => {
    // getCurrentUser() calls Next.js redirect() internally for an unauthenticated
    // caller — this must never be swallowed by a try/catch. Simulated here by a
    // rejected mock; asserts the rejection propagates rather than being converted
    // into a graceful {success:false} return.
    mockGetCurrentUser.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(
      saveAiTemplateAction({ title: 'Test', blocks: [] })
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(mockPlanCreate).not.toHaveBeenCalled()
  })

  it('creates a template plan for an authenticated trainer', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockPlanCreate.mockResolvedValue({ id: 'plan_1' } as never)

    const result = await saveAiTemplateAction({ title: 'Test', blocks: [] })

    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run actions/__tests__/workout-actions-save-template.test.ts`
Expected: FAIL on the first test — `getCurrentUser()` is currently called inside the `try` block, so the rejection is caught and converted to `{success: false, error: "Unauthorized"}` instead of propagating.

- [ ] **Step 3: Implement the fix**

In `actions/workout-actions.ts`, update `saveAiTemplateAction`. Current:

```ts
export async function saveAiTemplateAction(planData: any) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const plan = await prisma.workoutPlan.create({
      data: {
```

Change to:

```ts
export async function saveAiTemplateAction(planData: any) {
  const user = await getCurrentUser();

  try {
    const plan = await prisma.workoutPlan.create({
      data: {
```

(Move `getCurrentUser()` before the `try` block, and remove the `if (!user) return {success:false, error:'Unauthorized'};` line — it's dead code, since `getCurrentUser()` never returns a falsy value; it redirects instead. The rest of the function, from `prisma.workoutPlan.create` onward including the existing `catch` block, is unchanged.)

- [ ] **Step 4: Add the docstring**

In `lib/services/client.service.ts`, add a docstring directly above `getClientIdsForTrainer`:

```ts
/**
 * Returns the ids of every CLIENT-role user sharing the given trainer's
 * Clerk organization. This is an ORGANIZATION-membership check, not a
 * per-trainer assignment check — there is no direct trainer↔client
 * assignment relation in this schema, so shared `clerkOrgId` is the only
 * tenancy boundary that exists. In a multi-trainer clinic, this means any
 * trainer in the org passes this check for any client in that same org.
 * This is the established authorization primitive used throughout this
 * codebase's server actions to verify a trainer-supplied `clientId`
 * belongs to a client the caller is legitimately allowed to act on.
 */
export async function getClientIdsForTrainer(trainerId: string): Promise<string[]> {
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run actions/__tests__/workout-actions-save-template.test.ts`
Expected: PASS, both cases.

- [ ] **Step 6: Run the full project test suite**

Run: `npm test`
Expected: PASS — expect 588 + 2 = 590 across 75 files.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

Per this repo's convention: do not run `git commit`. Leave the change in the working tree.
