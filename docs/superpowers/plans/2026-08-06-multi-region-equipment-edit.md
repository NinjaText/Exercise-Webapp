# Multi-Region Body Tagging & Equipment Edit Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a trainer tag an exercise with more than one body region, and let the edit form add custom (non-preset) equipment — matching a UI the create form already has but doesn't fully wire up.

**Architecture:** `Exercise.bodyRegion` flips from a single Prisma enum to an array (`BodyRegion[]`), mirroring the existing `exercisePhases ExercisePhase[]` pattern in the same schema. A one-time `$runCommandRaw` script wraps every existing document's scalar value into a one-element array. Every query, type signature, display component, and filter UI that touches `bodyRegion` is updated to the array shape; `equipmentRequired` is already `String[]` so its edit-form fix is UI-only.

**Tech Stack:** Next.js App Router, Prisma (MongoDB), Zod, Vitest, React (client components, no component-test harness in this repo — UI tasks are manually verified in the dev server).

## Global Constraints

- Full source: `/Users/yahyashah/Dev/Excercise-Webapp`. Spec: `docs/superpowers/specs/2026-08-06-multi-region-equipment-edit-design.md`.
- Vitest (`npm test`) does NOT type-check (esbuild transform strips types) — each task's own tests can pass mid-migration even while other files still reference the old scalar type. Only `npm run build` (full `next build`/tsc) requires the ENTIRE migration to be complete. Do not run `npm run build` until the final task.
- MongoDB via Prisma — no migration files, no `@@index` on `bodyRegion`. Schema changes apply via `npx prisma generate` (regenerates the client's TS types); there is no `prisma migrate` step for this datasource.
- No CSV format change: CSV import and the manual bulk-create form (`bulkCreateExercisesAction`) keep **one region per row**, wrapped into a one-element array only at the point of `prisma.exercise.create`.
- No component test harness exists (no `@testing-library/react`, no jsdom/happy-dom) — UI-only tasks are verified by running `npm run dev` and checking the feature manually, not by an automated test step.
- Never commit automatically — the user reviews and commits changes themselves. Steps below show `git add`/`git commit` for reference only; skip actually running them unless the user asks.

---

### Task 1: Prisma schema migration + one-time data backfill script

**Files:**
- Modify: `prisma/schema.prisma:212`
- Create: `lib/db/seed/migrate-body-region-to-array.ts`
- Modify: `package.json` (add a `db:migrate-body-region` script, alongside the existing `db:seed`/`db:coach-plan` scripts)

**Interfaces:**
- Produces: `Exercise.bodyRegion` is now `BodyRegion[]` in the generated Prisma client — every later task assumes this.

- [ ] **Step 1: Change the schema field**

In `prisma/schema.prisma`, line 212:

```prisma
  bodyRegion         BodyRegion
```

becomes:

```prisma
  bodyRegion         BodyRegion[]
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: completes without error; `node_modules/.prisma/client/index.d.ts` now types `Exercise.bodyRegion` as `BodyRegion[]`.

- [ ] **Step 3: Write the one-time data migration script**

Create `lib/db/seed/migrate-body-region-to-array.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * One-time backfill: wraps every existing Exercise document's scalar
 * bodyRegion value into a one-element array, matching the new
 * BodyRegion[] schema field. Idempotent — the query filter only matches
 * documents where bodyRegion is still a plain string, so re-running this
 * script after it has already succeeded is a no-op.
 */
async function migrateBodyRegionToArray() {
  const result = await prisma.$runCommandRaw({
    update: "Exercise",
    updates: [
      {
        q: { bodyRegion: { $type: "string" } },
        u: [{ $set: { bodyRegion: ["$bodyRegion"] } }],
        multi: true,
      },
    ],
  });
  return result;
}

migrateBodyRegionToArray()
  .then((result) => {
    console.log("bodyRegion migration result:", JSON.stringify(result, null, 2));
  })
  .catch((e) => {
    console.error("bodyRegion migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 4: Add the npm script**

In `package.json`, alongside the existing `"db:seed"` and `"db:coach-plan"` entries, add:

```json
    "db:migrate-body-region": "npx tsx lib/db/seed/migrate-body-region-to-array.ts",
```

- [ ] **Step 5: Run the migration against the dev database**

Run: `npm run db:migrate-body-region`
Expected: logs a result object with `nModified` equal to the current total exercise count (every existing document had a scalar `bodyRegion` before this run). Running it a second time should show `nModified: 0` (idempotent).

- [ ] **Step 6: Spot-check the data**

Run: `npx prisma studio`, open the `Exercise` collection, confirm `bodyRegion` now renders as a one-item array (e.g. `["CORE"]`) on several existing rows, not a bare string.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma lib/db/seed/migrate-body-region-to-array.ts package.json
git commit -m "feat(exercises): migrate bodyRegion to array field"
```

---

### Task 2: Validators & AI metadata generation schema

**Files:**
- Modify: `lib/validators/exercise.ts`
- Modify: `app/api/ai/generate-exercise-metadata/route.ts`
- Create: `lib/validators/__tests__/exercise.test.ts`

**Interfaces:**
- Consumes: Task 1's `BodyRegion[]` schema field (no direct import here, but the shape must match).
- Produces: `CreateExerciseInput.bodyRegion: string[]`, `UpdateExerciseInput.bodyRegion?: string[]` — Task 4 (actions layer) consumes these inferred types.

- [ ] **Step 1: Write the failing validator test**

Create `lib/validators/__tests__/exercise.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createExerciseSchema } from "../exercise";

describe("createExerciseSchema bodyRegion", () => {
  const base = {
    name: "Squat",
    difficultyLevel: "BEGINNER",
    equipmentRequired: [],
    contraindications: [],
  };

  it("accepts multiple body regions", () => {
    const result = createExerciseSchema.safeParse({ ...base, bodyRegion: ["CORE", "UPPER_BODY"] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bodyRegion).toEqual(["CORE", "UPPER_BODY"]);
  });

  it("rejects an empty body region array", () => {
    const result = createExerciseSchema.safeParse({ ...base, bodyRegion: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a bare string (the old single-value shape)", () => {
    const result = createExerciseSchema.safeParse({ ...base, bodyRegion: "CORE" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/validators/__tests__/exercise.test.ts`
Expected: FAIL — `bodyRegion` is still `z.enum([...])`, so a bare string parses successfully and an array does not.

- [ ] **Step 3: Update the validators**

In `lib/validators/exercise.ts`, replace:

```ts
  bodyRegion: z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"]),
```

(inside `createExerciseSchema`) with:

```ts
  bodyRegion: z.array(z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"])).min(1, "Select at least one body region"),
```

and replace the `exerciseFilterSchema` line:

```ts
  bodyRegion: z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"]).optional(),
```

with:

```ts
  bodyRegion: z.array(z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"])).optional(),
```

(`updateExerciseSchema` needs no direct edit — it's `createExerciseSchema.partial()` and inherits the new array shape automatically.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/validators/__tests__/exercise.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Update the AI metadata generation schema**

In `app/api/ai/generate-exercise-metadata/route.ts`, replace:

```ts
  bodyRegion: z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"]).describe("Primary body region targeted"),
```

with (matching the existing `exercisePhases` array pattern one field below it):

```ts
  bodyRegion: z.array(z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"]))
    .min(1)
    .describe("Body region(s) targeted — an exercise can target more than one, e.g. a lunge is both LOWER_BODY and BALANCE. Return every region that genuinely applies."),
```

- [ ] **Step 6: Run the full validator test file once more and the route's existing tests if any**

Run: `npx vitest run lib/validators/__tests__/exercise.test.ts`
Expected: PASS. (No existing test file covers the API route directly — this is verified manually in Task 6 once the edit form calls it end-to-end.)

- [ ] **Step 7: Commit**

```bash
git add lib/validators/exercise.ts app/api/ai/generate-exercise-metadata/route.ts lib/validators/__tests__/exercise.test.ts
git commit -m "feat(exercises): accept multiple body regions in validators and AI metadata generation"
```

---

### Task 3: Service layer — query operators, type signatures, prompt strings

**Files:**
- Modify: `lib/services/exercise.service.ts`
- Modify: `lib/services/admin.service.ts`
- Modify: `lib/services/ai.service.ts`
- Modify: `lib/ai/utils/exercise-pool.ts`
- Modify: `lib/ai/prompts/workout-generation.ts`
- Modify: `lib/services/__tests__/exercise.service.test.ts`
- Modify: `lib/ai/utils/__tests__/exercise-pool.test.ts`
- Modify: `lib/services/__tests__/admin.service.test.ts`
- Modify: `lib/services/__tests__/ai.service.test.ts`

**Interfaces:**
- Consumes: Task 1's `BodyRegion[]` field, Task 2's validator types.
- Produces: `getAllExercises(params: { bodyRegions?: string[] })` (renamed from `bodyRegion?: string`) — Task 9 (admin filter UI) consumes this new param name.

- [ ] **Step 1: Update the pinned `exercise.service.test.ts` expectations**

In `lib/services/__tests__/exercise.service.test.ts`, replace the `'getExercises body region filtering'` describe block's first test:

```ts
  it('matches exercises with any of the requested body regions (in)', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ bodyRegions: ['UPPER_BODY', 'CORE'] as any })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bodyRegion: { in: ['UPPER_BODY', 'CORE'] },
        }),
      })
    )
  })
```

with:

```ts
  it('matches exercises with any of the requested body regions (hasSome)', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ bodyRegions: ['UPPER_BODY', 'CORE'] as any })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bodyRegion: { hasSome: ['UPPER_BODY', 'CORE'] },
        }),
      })
    )
  })
```

Also update the `cloneExerciseToOrganization` describe block's `universalSource` fixture and its two assertions: change `bodyRegion: 'LOWER_BODY'` (line 207) to `bodyRegion: ['LOWER_BODY']`, and in the first `it` block change the expected `bodyRegion: 'LOWER_BODY'` (line 236) to `bodyRegion: ['LOWER_BODY']`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/services/__tests__/exercise.service.test.ts`
Expected: FAIL — the service still queries with `{ in: [...] }` and still passes through a bare string for `cloneExerciseToOrganization`.

- [ ] **Step 3: Update `exercise.service.ts`**

Replace line 25:

```ts
      ...(filters.bodyRegions?.length && { bodyRegion: { in: filters.bodyRegions } }),
```

with:

```ts
      ...(filters.bodyRegions?.length && { bodyRegion: { hasSome: filters.bodyRegions } }),
```

Update the four type signatures that reference a scalar `BodyRegion`:
- `createExercise(data: { ... bodyRegion: BodyRegion; ... })` → `bodyRegion: BodyRegion[];`
- `cloneExerciseToOrganization(source: { ... bodyRegion: BodyRegion; ... }, ...)` → `bodyRegion: BodyRegion[];`
- `updateExercise(id, data: Partial<{ ... bodyRegion: BodyRegion; ... }>)` → `bodyRegion: BodyRegion[];`

No other lines in this file change — `createExercise`, `cloneExerciseToOrganization`, and `updateExercise` all pass `data.bodyRegion`/`source.bodyRegion` straight through to Prisma without touching it, so they're structurally array-tolerant already; only the type annotations need updating.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/services/__tests__/exercise.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the pinned `exercise-pool.test.ts` expectation**

In `lib/ai/utils/__tests__/exercise-pool.test.ts`, in the `'includes rehabStage and indicationTags when provided'` test, replace:

```ts
    expect(clause.bodyRegion).toEqual({ in: ['LOWER_BODY'] })
```

with:

```ts
    expect(clause.bodyRegion).toEqual({ hasSome: ['LOWER_BODY'] })
```

- [ ] **Step 6: Run to verify it fails, then fix `exercise-pool.ts`**

Run: `npx vitest run lib/ai/utils/__tests__/exercise-pool.test.ts` → expect FAIL.

In `lib/ai/utils/exercise-pool.ts`, replace:

```ts
    bodyRegion: { in: weekPlan.focusAreas },
```

with:

```ts
    bodyRegion: { hasSome: weekPlan.focusAreas },
```

Run: `npx vitest run lib/ai/utils/__tests__/exercise-pool.test.ts` → expect PASS.

- [ ] **Step 7: Write a new failing test for `admin.service.ts`'s multi-region filter**

`lib/services/__tests__/admin.service.test.ts` currently has no coverage for `getAllExercises`'s body-region filtering. Add:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    exercise: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  },
}))

import { prisma } from '@/lib/prisma'
import { getAllExercises } from '../admin.service'

const mockFindMany = vi.mocked(prisma.exercise.findMany)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getAllExercises body region filtering', () => {
  it('matches exercises with any of the requested body regions (hasSome)', async () => {
    await getAllExercises({ bodyRegions: ['UPPER_BODY', 'CORE'] })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bodyRegion: { hasSome: ['UPPER_BODY', 'CORE'] },
        }),
      })
    )
  })

  it('omits the body region clause when no regions are requested', async () => {
    await getAllExercises({})
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).not.toHaveProperty('bodyRegion')
  })
})
```

If this test file already imports/mocks `prisma` elsewhere in the file for other describe blocks, merge these imports/mocks with the existing ones instead of duplicating `vi.mock`.

- [ ] **Step 8: Run to verify it fails**

Run: `npx vitest run lib/services/__tests__/admin.service.test.ts`
Expected: FAIL — `getAllExercises` doesn't accept `bodyRegions` yet.

- [ ] **Step 9: Update `admin.service.ts`**

Replace:

```ts
export async function getAllExercises(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  bodyRegion?: string;
}) {
  const { page = 1, pageSize = 25, search, bodyRegion } = params;

  const where = {
    isActive: { not: false },
    ...(bodyRegion && bodyRegion !== "ALL" && { bodyRegion: bodyRegion as never }),
```

with:

```ts
export async function getAllExercises(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  bodyRegions?: string[];
}) {
  const { page = 1, pageSize = 25, search, bodyRegions } = params;

  const where = {
    isActive: { not: false },
    ...(bodyRegions?.length && { bodyRegion: { hasSome: bodyRegions } }),
```

- [ ] **Step 10: Run to verify it passes**

Run: `npx vitest run lib/services/__tests__/admin.service.test.ts`
Expected: PASS.

- [ ] **Step 11: Fix the `ai.service.test.ts` fixture (runtime break, not just typing)**

In `lib/services/__tests__/ai.service.test.ts`, the `exercise()` fixture factory has `bodyRegion: 'LOWER_BODY'` (a bare string). Once `ai.service.ts`'s prompt-building code calls `.join('/')` on `bodyRegion` (Step 13 below), a string fixture would throw `TypeError: e.bodyRegion.join is not a function` at test runtime, not just fail a type check. Change:

```ts
    bodyRegion: 'LOWER_BODY',
```

to:

```ts
    bodyRegion: ['LOWER_BODY'],
```

- [ ] **Step 12: Run the ai.service tests to confirm they still pass with the old prompt code (sanity baseline)**

Run: `npx vitest run lib/services/__tests__/ai.service.test.ts`
Expected: PASS (the fixture change alone doesn't break anything yet, since the current prompt code does `${e.bodyRegion}` which stringifies an array as `"LOWER_BODY"` too — this step is a baseline checkpoint before the code change, not a red/green TDD pair).

- [ ] **Step 13: Update `ai.service.ts`**

Update the `ExercisePoolItem` type (around line 14):

```ts
  bodyRegion: string
```

stays `string` is WRONG for a real Prisma-shaped array — change to:

```ts
  bodyRegion: string[]
```

Update the two Prisma query `in` clauses:

```ts
    bodyRegion: { in: regionsForQuery },
```

(inside `buildExercisePoolForWeek`'s `baseWhere`) →

```ts
    bodyRegion: { hasSome: regionsForQuery },
```

and:

```ts
      bodyRegion: { in: targetRegions },
```

(inside `generateWorkoutPlan`'s non-week-plan `allExercises` query) →

```ts
      bodyRegion: { hasSome: targetRegions },
```

Update the inline `Array<{...}>` cast type immediately below that second query (the `allExercises` cast) — change its `bodyRegion: string;` to `bodyRegion: string[];`.

Update both prompt-building template literals from:

```ts
Region: ${e.bodyRegion}
```

to:

```ts
Region: ${e.bodyRegion.join('/')}
```

(one occurrence inside `buildExercisePoolForWeek`'s caller in `generateWorkoutPlan`'s week-plan path, one inside the non-week-plan path's `exerciseListStr` builder — both are on lines that already join `e.exercisePhases` the same way, e.g. `Phase: ${e.exercisePhases.length ? e.exercisePhases.join('/') : 'STRENGTHENING'}`).

- [ ] **Step 14: Update `lib/ai/prompts/workout-generation.ts`**

Change:

```ts
        `- ID: ${e.id} | Name: ${e.name} | Region: ${e.bodyRegion} | Difficulty: ${e.difficultyLevel} | Equipment: ${(e.equipmentRequired ?? []).join(", ") || "bodyweight"} | Contraindications: ${(e.contraindications ?? []).join(", ") || "none"}`
```

to:

```ts
        `- ID: ${e.id} | Name: ${e.name} | Region: ${e.bodyRegion.join("/")} | Difficulty: ${e.difficultyLevel} | Equipment: ${(e.equipmentRequired ?? []).join(", ") || "bodyweight"} | Contraindications: ${(e.contraindications ?? []).join(", ") || "none"}`
```

(This function's `Exercise` param is the real Prisma type, so `e.bodyRegion` is now `BodyRegion[]` automatically.)

- [ ] **Step 15: Run the full set of this task's tests**

Run: `npx vitest run lib/services/__tests__/exercise.service.test.ts lib/services/__tests__/admin.service.test.ts lib/services/__tests__/ai.service.test.ts lib/ai/utils/__tests__/exercise-pool.test.ts`
Expected: all PASS.

- [ ] **Step 16: Commit**

```bash
git add lib/services/exercise.service.ts lib/services/admin.service.ts lib/services/ai.service.ts lib/ai/utils/exercise-pool.ts lib/ai/prompts/workout-generation.ts lib/services/__tests__/exercise.service.test.ts lib/services/__tests__/admin.service.test.ts lib/services/__tests__/ai.service.test.ts lib/ai/utils/__tests__/exercise-pool.test.ts
git commit -m "feat(exercises): switch body-region queries to array operators (hasSome/has)"
```

---

### Task 4: Actions layer — type signatures, array-safe audit diffing, bulk/CSV wrap-in-array

**Files:**
- Modify: `actions/exercise-actions.ts`
- Modify: `actions/bulk-exercise-actions.ts`
- Modify: `lib/services/audit-log.service.ts`
- Create: `lib/services/__tests__/audit-log.service.test.ts` (if no existing test file covers `diffFields`; otherwise extend it)

**Interfaces:**
- Consumes: Task 2's `CreateExerciseInput`/`UpdateExerciseInput` (array `bodyRegion`), Task 3's `exerciseService.createExercise`/`updateExercise`/`cloneExerciseToOrganization` signatures.
- Produces: `createExerciseAction(input: { bodyRegion: string[]; ... })`, `createOrganizationExerciseAction(input: { bodyRegion: string[]; ... })` — Task 6 (edit form), Task 7 (create form), and Task 8 (picker's mini create form) all call these with an array.

- [ ] **Step 1: Check for an existing `diffFields` test file**

Run: `find /Users/yahyashah/Dev/Excercise-Webapp/lib/services/__tests__ -iname '*audit-log*'`

If a file is found, add the new test from Step 2 into it instead of creating a new file.

- [ ] **Step 2: Write the failing test for array-safe diffing**

In `lib/services/__tests__/audit-log.service.test.ts` (new or existing), add:

```ts
import { describe, it, expect } from 'vitest'
import { diffFields } from '../audit-log.service'

describe('diffFields with array values', () => {
  it('does not report a change when an array is reordered but has the same members', () => {
    const before = { bodyRegion: ['CORE', 'UPPER_BODY'] }
    const after = { bodyRegion: ['UPPER_BODY', 'CORE'] }
    expect(diffFields(before, after, ['bodyRegion'])).toBeUndefined()
  })

  it('reports a change when array members actually differ', () => {
    const before = { bodyRegion: ['CORE'] }
    const after = { bodyRegion: ['CORE', 'UPPER_BODY'] }
    expect(diffFields(before, after, ['bodyRegion'])).toEqual({
      before: { bodyRegion: ['CORE'] },
      after: { bodyRegion: ['CORE', 'UPPER_BODY'] },
    })
  })

  it('still reports scalar changes as before', () => {
    const before = { name: 'Squat' }
    const after = { name: 'Squat Updated' }
    expect(diffFields(before, after, ['name'])).toEqual({
      before: { name: 'Squat' },
      after: { name: 'Squat Updated' },
    })
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/services/__tests__/audit-log.service.test.ts`
Expected: FAIL on the first test — `diffFields` currently uses `after[key] !== before[key]`, and two different array instances are never `===` even with identical contents, so a reorder is (wrongly) reported as changed.

- [ ] **Step 4: Fix `diffFields`**

In `lib/services/audit-log.service.ts`, replace:

```ts
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  keys: (keyof T)[]
): { before: Partial<T>; after: Partial<T> } | undefined {
  const changedBefore: Partial<T> = {};
  const changedAfter: Partial<T> = {};
  let hasChanges = false;

  for (const key of keys) {
    if (key in after && after[key] !== before[key]) {
      changedBefore[key] = before[key];
      changedAfter[key] = after[key];
      hasChanges = true;
    }
  }

  return hasChanges ? { before: changedBefore, after: changedAfter } : undefined;
}
```

with:

```ts
function fieldValuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  }
  return a === b;
}

export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  keys: (keyof T)[]
): { before: Partial<T>; after: Partial<T> } | undefined {
  const changedBefore: Partial<T> = {};
  const changedAfter: Partial<T> = {};
  let hasChanges = false;

  for (const key of keys) {
    if (key in after && !fieldValuesEqual(after[key], before[key])) {
      changedBefore[key] = before[key];
      changedAfter[key] = after[key];
      hasChanges = true;
    }
  }

  return hasChanges ? { before: changedBefore, after: changedAfter } : undefined;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run lib/services/__tests__/audit-log.service.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 6: Update `actions/exercise-actions.ts` type signatures**

Change `createExerciseAction`'s input type:

```ts
export async function createExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string;
```

to:

```ts
export async function createExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string[];
```

and its usage:

```ts
        bodyRegion: parsed.data.bodyRegion as BodyRegion,
```

to:

```ts
        bodyRegion: parsed.data.bodyRegion as BodyRegion[],
```

Change `createOrganizationExerciseAction`'s input type:

```ts
export async function createOrganizationExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string;
```

to:

```ts
export async function createOrganizationExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string[];
```

and its usage:

```ts
      bodyRegion: input.bodyRegion as BodyRegion,
```

to:

```ts
      bodyRegion: input.bodyRegion as BodyRegion[],
```

`updateExerciseAction` needs no signature change — it already takes `input: Record<string, unknown>` and parses it through `updateExerciseSchema` (Task 2 already made that array-aware).

- [ ] **Step 7: Update `actions/bulk-exercise-actions.ts`**

`BulkExerciseInput.bodyRegion: string` and `CsvExerciseRow.bodyRegion` (from `lib/validators/csv-exercise.ts`, unchanged per Task 2) both stay single-value — only the two `prisma.exercise.create` calls change to wrap the value:

In `bulkCreateExercisesAction`, change:

```ts
            bodyRegion: ex.bodyRegion as BodyRegion,
```

to:

```ts
            bodyRegion: [ex.bodyRegion] as BodyRegion[],
```

In `importExercisesFromCsvAction`, change:

```ts
            bodyRegion: row.bodyRegion as BodyRegion,
```

to:

```ts
            bodyRegion: [row.bodyRegion] as BodyRegion[],
```

- [ ] **Step 8: Run the existing action tests**

Run: `npx vitest run actions/__tests__/bulk-exercise-actions.test.ts actions/__tests__/exercise-actions-audit.test.ts actions/__tests__/search-actions.test.ts`
Expected: all PASS unchanged — `bulk-exercise-actions.test.ts`'s assertions only check `source`/`organizationId`/`isPublic`, not `bodyRegion`; `exercise-actions-audit.test.ts` mocks `diffFields` itself with its own inline `!==` implementation so it's unaffected by the real fix; `search-actions.test.ts`'s `bodyRegion: 'LOWER_BODY'` fixture is read-only display data never asserted directly. No fixture changes are required for these three files to keep passing, though you may optionally update their `bodyRegion` fixtures to `['LOWER_BODY']` / `['KNEE']` for documentation accuracy.

- [ ] **Step 9: Commit**

```bash
git add actions/exercise-actions.ts actions/bulk-exercise-actions.ts lib/services/audit-log.service.ts lib/services/__tests__/audit-log.service.test.ts
git commit -m "feat(exercises): update actions layer for array bodyRegion, make audit diffing array-safe"
```

---

### Task 5: Display & formatting fixes (read-only components)

**Files:**
- Modify: `lib/utils/formatting.ts` (no signature change — confirmed below — listed for reference only)
- Modify: `components/exercises/exercise-card.tsx`
- Modify: `components/exercises/exercise-detail.tsx`
- Modify: `components/workout/exercise-slot.tsx`
- Modify: `components/workout/workout-plan-view.tsx`
- Modify: `components/search/command-palette.tsx`
- Modify: `components/admin/exercises-table.tsx`

**Interfaces:**
- Consumes: Task 1's array field (these components receive `bodyRegion: string[]` from their Prisma-backed parents once Task 1 lands — no service change needed for these since they're all pure `select`/display projections, per Task 3's analysis that only 5 specific query sites needed fixing).
- Produces: `ExerciseCardProps.bodyRegion: string[]` — Task 8/9 callers already pass the raw field through unchanged (`exercise-grid.tsx`'s pass-through needs no edit).

`formatBodyRegion(region: string): string` in `lib/utils/formatting.ts` keeps its single-value signature — every call site below maps over the array and calls it per-element, rather than changing the helper itself.

- [ ] **Step 1: Fix `exercise-card.tsx`**

Change the props interface:

```ts
interface ExerciseCardProps {
  id: string;
  name: string;
  bodyRegion: string;
```

to:

```ts
interface ExerciseCardProps {
  id: string;
  name: string;
  bodyRegion: string[];
```

Change the destructured display line:

```tsx
        <p className="mt-1 text-xs font-medium text-muted-foreground/70">{formatBodyRegion(bodyRegion)}</p>
```

to:

```tsx
        <p className="mt-1 text-xs font-medium text-muted-foreground/70">{bodyRegion.map(formatBodyRegion).join(", ")}</p>
```

Change the `<ExerciseImage>` call (which takes a single-value `bodyRegion` prop that is NOT changing — see Task 6's note on `ExerciseImage`) from:

```tsx
        <ExerciseImage src={null} alt={name} bodyRegion={bodyRegion} videoUrl={videoUrl} label={name.split(" ").slice(0, 3).join(" ")} />
```

to:

```tsx
        <ExerciseImage src={null} alt={name} bodyRegion={bodyRegion[0]} videoUrl={videoUrl} label={name.split(" ").slice(0, 3).join(" ")} />
```

- [ ] **Step 2: Fix `exercise-detail.tsx`**

Change:

```tsx
          <Badge variant="outline">{formatBodyRegion(exercise.bodyRegion)}</Badge>
```

to:

```tsx
          {exercise.bodyRegion.map((region) => (
            <Badge key={region} variant="outline">{formatBodyRegion(region)}</Badge>
          ))}
```

- [ ] **Step 3: Fix `exercise-slot.tsx`**

Change:

```tsx
              <Badge variant="outline" className="text-xs">
                {formatBodyRegion(exercise.bodyRegion)}
              </Badge>
```

to:

```tsx
              {exercise.bodyRegion.map((region) => (
                <Badge key={region} variant="outline" className="text-xs">
                  {formatBodyRegion(region)}
                </Badge>
              ))}
```

- [ ] **Step 4: Fix `workout-plan-view.tsx`**

Change:

```tsx
                      <Badge variant="outline" className="text-xs">
                        {formatBodyRegion(pe.exercise.bodyRegion)}
                      </Badge>
```

to:

```tsx
                      {pe.exercise.bodyRegion.map((region) => (
                        <Badge key={region} variant="outline" className="text-xs">
                          {formatBodyRegion(region)}
                        </Badge>
                      ))}
```

- [ ] **Step 5: Fix `command-palette.tsx`**

Change:

```tsx
                        {e.bodyRegion && (
                          <span className="text-xs text-muted-foreground capitalize">
                            {e.bodyRegion.replace(/_/g, " ").toLowerCase()}
                          </span>
                        )}
```

to:

```tsx
                        {e.bodyRegion && e.bodyRegion.length > 0 && (
                          <span className="text-xs text-muted-foreground capitalize">
                            {e.bodyRegion.map((r: string) => r.replace(/_/g, " ").toLowerCase()).join(", ")}
                          </span>
                        )}
```

- [ ] **Step 6: Fix `exercises-table.tsx` (admin)**

Change:

```tsx
                  <td className="px-5 py-3">
                    <Badge variant="outline" className={`text-[10px] ${bodyRegionColors[ex.bodyRegion] ?? "border-border text-muted-foreground"}`}>
                      {bodyRegionLabel[ex.bodyRegion] ?? ex.bodyRegion}
                    </Badge>
                  </td>
```

to:

```tsx
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {ex.bodyRegion.map((region: string) => (
                        <Badge key={region} variant="outline" className={`text-[10px] ${bodyRegionColors[region] ?? "border-border text-muted-foreground"}`}>
                          {bodyRegionLabel[region] ?? region}
                        </Badge>
                      ))}
                    </div>
                  </td>
```

- [ ] **Step 7: Manually verify in the dev server**

Run: `npm run dev`, open `/exercises`, `/exercises/[id]`, and `/admin/exercises`. Confirm exercise cards, the detail page, and the admin table all render body-region badges without runtime errors (React error overlay would show `.map is not a function` or similar if any site was missed).

- [ ] **Step 8: Commit**

```bash
git add components/exercises/exercise-card.tsx components/exercises/exercise-detail.tsx components/workout/exercise-slot.tsx components/workout/workout-plan-view.tsx components/search/command-palette.tsx components/admin/exercises-table.tsx
git commit -m "feat(exercises): render multiple body-region badges across display components"
```

---

### Task 6: Edit form UI — multi-select body regions + equipment custom-add

**Files:**
- Modify: `components/exercises/exercise-edit-form.tsx`

**Interfaces:**
- Consumes: Task 4's `updateExerciseAction`, `lib/utils/constants.ts`'s existing `BODY_REGIONS`/`COMMON_EQUIPMENT`.
- Produces: none consumed elsewhere — this is a leaf UI component.

- [ ] **Step 1: Update the `Exercise` interface and imports**

Change:

```ts
interface Exercise {
  id: string;
  name: string;
  description: string | null;
  bodyRegion: string;
```

to:

```ts
interface Exercise {
  id: string;
  name: string;
  description: string | null;
  bodyRegion: string[];
```

Add `useRef` and the icon/utility imports the create form already uses for its equipment custom-add UI:

```ts
import { useState, useRef } from "react";
```

```ts
import { CheckCircle2, Loader2, Play, Trash2, X, Plus } from "lucide-react";
```

```ts
import { cn } from "@/lib/utils";
```

- [ ] **Step 2: Replace the single-region state with multi-select state**

Change:

```ts
  const [bodyRegion, setBodyRegion] = useState(exercise.bodyRegion);
```

to:

```ts
  const [selectedRegions, setSelectedRegions] = useState<string[]>(exercise.bodyRegion);
```

Add a toggle helper next to the existing `toggleEquipment` function:

```ts
  function toggleRegion(value: string) {
    setSelectedRegions((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]
    );
  }
```

- [ ] **Step 3: Add custom-equipment state (mirrors `exercise-form.tsx`)**

Add alongside the existing `selectedEquipment` state:

```ts
  const [customEquipmentInput, setCustomEquipmentInput] = useState("");
  const equipmentInputRef = useRef<HTMLInputElement>(null);
```

Add the two helper functions next to `toggleEquipment`:

```ts
  function addCustomEquipment() {
    const val = customEquipmentInput.trim();
    if (!val) return;
    if (!selectedEquipment.includes(val)) {
      setSelectedEquipment((prev) => [...prev, val]);
    }
    setCustomEquipmentInput("");
    equipmentInputRef.current?.focus();
  }

  function removeEquipment(item: string) {
    setSelectedEquipment((prev) => prev.filter((e) => e !== item));
  }
```

- [ ] **Step 4: Update form submission and validation**

In `handleSubmit`, before the `updateExerciseAction` call, add the same required-field guard the create form uses:

```ts
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (selectedRegions.length === 0) {
      toast.error("Please select at least one body region");
      return;
    }

    setLoading(true);

    const result = await updateExerciseAction(exercise.id, {
      name: name.trim(),
      description: description.trim() || undefined,
      bodyRegion: selectedRegions,
```

(replacing the old `bodyRegion,` line, which referenced the now-removed `bodyRegion` state variable).

- [ ] **Step 5: Replace the body-region `<select>` with multi-select chips**

Change:

```tsx
            <div className="space-y-2">
              <Label htmlFor="bodyRegion">Body Region *</Label>
              <select
                id="bodyRegion"
                required
                value={bodyRegion}
                onChange={(e) => setBodyRegion(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="">Select region</option>
                {BODY_REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
```

to:

```tsx
            <div className="space-y-2">
              <Label>
                Body Region *
                {selectedRegions.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {selectedRegions.length} selected
                  </span>
                )}
              </Label>
              <div className="flex flex-wrap gap-2">
                {BODY_REGIONS.map((r) => {
                  const selected = selectedRegions.includes(r.value);
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => toggleRegion(r.value)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                      )}
                    >
                      {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
```

Note this is now full-width (not a `sm:grid-cols-2` cell alongside the name field) since chip rows need more horizontal room than a `<select>` — remove the `<div className="grid gap-4 sm:grid-cols-2">` wrapper that previously paired the name input with this control, keeping the name input as its own `space-y-2` block above this one.

- [ ] **Step 6: Replace the equipment section with preset chips + custom-add (mirrors `exercise-form.tsx`)**

Change:

```tsx
          {/* Equipment */}
          <div className="space-y-2">
            <Label>Equipment Required</Label>
            <div className="flex flex-wrap gap-2">
              {COMMON_EQUIPMENT.map((eq) => (
                <Button
                  key={eq}
                  type="button"
                  variant={selectedEquipment.includes(eq) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleEquipment(eq)}
                >
                  {eq}
                </Button>
              ))}
            </div>
          </div>
```

to:

```tsx
          {/* Equipment */}
          <div className="space-y-3">
            <Label>Equipment Required</Label>

            <div className="flex flex-wrap gap-2">
              {COMMON_EQUIPMENT.map((eq) => (
                <Button
                  key={eq}
                  type="button"
                  variant={selectedEquipment.includes(eq) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleEquipment(eq)}
                >
                  {eq}
                </Button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                ref={equipmentInputRef}
                value={customEquipmentInput}
                onChange={(e) => setCustomEquipmentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addCustomEquipment(); }
                }}
                placeholder="Add custom equipment..."
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomEquipment}
                className="h-8 gap-1 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            {selectedEquipment.filter(eq => !COMMON_EQUIPMENT.includes(eq as typeof COMMON_EQUIPMENT[number])).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedEquipment
                  .filter(eq => !COMMON_EQUIPMENT.includes(eq as typeof COMMON_EQUIPMENT[number]))
                  .map((eq) => (
                    <span
                      key={eq}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-sm font-medium"
                    >
                      {eq}
                      <button type="button" onClick={() => removeEquipment(eq)} className="hover:text-primary/70">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
              </div>
            )}
          </div>
```

- [ ] **Step 7: Manually verify in the dev server**

Run: `npm run dev`, open an existing exercise's `/exercises/[id]/edit` page. Confirm: (a) its current single region shows pre-selected as a chip; (b) clicking additional region chips selects them; (c) typing a custom equipment name and clicking "Add" (or pressing Enter) adds it as a removable pill; (d) saving persists multiple regions and the custom equipment — reload the page and confirm both survived.

- [ ] **Step 8: Commit**

```bash
git add components/exercises/exercise-edit-form.tsx
git commit -m "feat(exercises): multi-select body regions and custom equipment in the edit form"
```

---

### Task 7: Create form — send the full selected-regions array

**Files:**
- Modify: `components/exercises/exercise-form.tsx`

**Interfaces:**
- Consumes: Task 4's `createExerciseAction(input: { bodyRegion: string[]; ... })`.

- [ ] **Step 1: Send the full array instead of just the first selection**

Change:

```ts
      bodyRegion: selectedRegions[0],
```

to:

```ts
      bodyRegion: selectedRegions,
```

- [ ] **Step 2: Remove the now-inaccurate "primary region" hint**

Change:

```tsx
            {selectedRegions.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Primary region: <span className="font-medium">{BODY_REGIONS.find(r => r.value === selectedRegions[0])?.label}</span> (first selected)
              </p>
            )}
```

to nothing (delete this block) — with true multi-region support, there's no longer a meaningful distinction between a "primary" and other selected regions.

- [ ] **Step 3: Manually verify in the dev server**

Run: `npm run dev`, create a new exercise selecting 2+ body regions, submit, and confirm on the resulting detail page that all selected regions appear (per Task 5's `exercise-detail.tsx` fix).

- [ ] **Step 4: Commit**

```bash
git add components/exercises/exercise-form.tsx
git commit -m "feat(exercises): send all selected body regions on exercise creation"
```

---

### Task 8: Program exercise-picker dialog — multi-select filter + mini create-form

**Files:**
- Modify: `components/programs/exercise-picker-dialog.tsx`

**Interfaces:**
- Consumes: Task 4's `createOrganizationExerciseAction(input: { bodyRegion: string[]; ... })`.

- [ ] **Step 1: Update the `Exercise` interface**

Change:

```ts
interface Exercise {
  id: string;
  name: string;
  bodyRegion: string;
```

to:

```ts
interface Exercise {
  id: string;
  name: string;
  bodyRegion: string[];
```

- [ ] **Step 2: Convert `FilterBar`'s region control to multi-select**

Change the `REGIONS` constant (drop the `"all"` sentinel — an empty selection now means "all"):

```ts
const REGIONS = [
  { value: "all",         label: "All"         },
  { value: "UPPER_BODY",  label: "Upper"       },
  { value: "LOWER_BODY",  label: "Lower"       },
  { value: "CORE",        label: "Core"        },
  { value: "FULL_BODY",   label: "Full Body"   },
  { value: "BALANCE",     label: "Balance"     },
  { value: "FLEXIBILITY", label: "Flexibility" },
] as const;
```

to:

```ts
const REGIONS = [
  { value: "UPPER_BODY",  label: "Upper"       },
  { value: "LOWER_BODY",  label: "Lower"       },
  { value: "CORE",        label: "Core"        },
  { value: "FULL_BODY",   label: "Full Body"   },
  { value: "BALANCE",     label: "Balance"     },
  { value: "FLEXIBILITY", label: "Flexibility" },
] as const;
```

Change `FilterBarProps` and the `FilterBar` function signature:

```ts
interface FilterBarProps {
  search: string;
  setSearch: (v: string) => void;
  phase: string;
  setPhase: (v: string) => void;
  bodyRegion: string;
  setRegion: (v: string) => void;
}

function FilterBar({ search, setSearch, phase, setPhase, bodyRegion, setRegion }: FilterBarProps) {
```

to:

```ts
interface FilterBarProps {
  search: string;
  setSearch: (v: string) => void;
  phase: string;
  setPhase: (v: string) => void;
  bodyRegions: string[];
  setRegions: (v: string[]) => void;
}

function FilterBar({ search, setSearch, phase, setPhase, bodyRegions, setRegions }: FilterBarProps) {
  function toggleRegion(value: string) {
    setRegions(bodyRegions.includes(value) ? bodyRegions.filter((r) => r !== value) : [...bodyRegions, value]);
  }
```

Change the region chip row inside `FilterBar`:

```tsx
        <div className="flex flex-wrap gap-1">
          {REGIONS.map((r) => (
            <button key={r.value} type="button" onClick={() => setRegion(r.value)}
              className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                bodyRegion === r.value ? "bg-secondary text-secondary-foreground border-secondary" : "bg-background text-muted-foreground border-border hover:border-muted-foreground/50 hover:text-foreground"
              )}>
              {r.label}
            </button>
          ))}
        </div>
```

to:

```tsx
        <div className="flex flex-wrap gap-1">
          {REGIONS.map((r) => (
            <button key={r.value} type="button" onClick={() => toggleRegion(r.value)}
              className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                bodyRegions.includes(r.value) ? "bg-secondary text-secondary-foreground border-secondary" : "bg-background text-muted-foreground border-border hover:border-muted-foreground/50 hover:text-foreground"
              )}>
              {r.label}
            </button>
          ))}
        </div>
```

- [ ] **Step 3: Update `ExerciseListProps` and its "clear filters" button**

Change:

```ts
interface ExerciseListProps {
  list: Exercise[];
  showOrganizationControls?: boolean;
  phase: string;
  setPhase: (v: string) => void;
  setRegion: (v: string) => void;
```

to:

```ts
interface ExerciseListProps {
  list: Exercise[];
  showOrganizationControls?: boolean;
  phase: string;
  setPhase: (v: string) => void;
  setRegions: (v: string[]) => void;
```

Change the `ExerciseList` function's destructure (`setRegion` → `setRegions`) and its "Clear filters" button body:

```tsx
              <Button variant="ghost" size="sm" className="mt-2 text-xs"
                onClick={() => { setPhase("all"); setRegion("all"); }}>
                Clear filters
              </Button>
```

to:

```tsx
              <Button variant="ghost" size="sm" className="mt-2 text-xs"
                onClick={() => { setPhase("all"); setRegions([]); }}>
                Clear filters
              </Button>
```

Update every `<ExerciseList ... setRegion={setRegion} .../>` call site (there are three, one per tab-visibility branch at the bottom of the component) to `setRegions={setRegions}`.

- [ ] **Step 4: Update the per-exercise region badge**

Change:

```tsx
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {ex.bodyRegion.replace(/_/g, " ")}
                  </Badge>
```

to:

```tsx
                <div className="flex flex-wrap gap-1 mt-1">
                  {ex.bodyRegion.map((region) => (
                    <Badge key={region} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {region.replace(/_/g, " ")}
                    </Badge>
                  ))}
```

- [ ] **Step 5: Update `emptyFormShape` and `CreateExerciseFields`' region control**

Change:

```ts
function emptyFormShape() {
  return {
    name: "",
    description: "",
    bodyRegion: "",
    difficultyLevel: "",
    exercisePhases: [] as string[],
    videoUrl: "",
    isPublic: true,
  };
}
```

to:

```ts
function emptyFormShape() {
  return {
    name: "",
    description: "",
    bodyRegion: [] as string[],
    difficultyLevel: "",
    exercisePhases: [] as string[],
    videoUrl: "",
    isPublic: true,
  };
}
```

Change the `Body Region *` field inside `CreateExerciseFields` from the shadcn `<Select>`:

```tsx
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Body Region *</Label>
          <Select value={form.bodyRegion} onValueChange={(v) => setForm((f) => ({ ...f, bodyRegion: v ?? f.bodyRegion }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="LOWER_BODY">Lower Body</SelectItem>
              <SelectItem value="UPPER_BODY">Upper Body</SelectItem>
              <SelectItem value="CORE">Core</SelectItem>
              <SelectItem value="FULL_BODY">Full Body</SelectItem>
              <SelectItem value="BALANCE">Balance</SelectItem>
              <SelectItem value="FLEXIBILITY">Flexibility</SelectItem>
            </SelectContent>
          </Select>
        </div>
```

to a chip multi-select reusing the same `PhaseMultiSelect`-style pattern already in this file:

```tsx
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs font-semibold">Body Region *</Label>
          <div className="flex flex-wrap gap-1.5">
            {REGIONS.map((r) => {
              const active = form.bodyRegion.includes(r.value);
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm((f) => ({
                    ...f,
                    bodyRegion: active ? f.bodyRegion.filter((v) => v !== r.value) : [...f.bodyRegion, r.value],
                  }))}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
```

Since this field moved out of the `grid grid-cols-2` row it shared with Difficulty, wrap the existing Difficulty field in its own `<div className="grid grid-cols-2 gap-3">` — i.e. change:

```tsx
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Body Region *</Label>
          ...
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Difficulty *</Label>
```

to place the new full-width region block before a grid that now only contains Difficulty:

```tsx
      {/* body region block (above) is now full-width, col-span-2 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Difficulty *</Label>
```

(Concretely: move the body-region block above the `grid grid-cols-2` wrapper entirely, then delete the region `<div>` that used to be the grid's first child, leaving Difficulty as the grid's sole child — or leave Difficulty alone in a single-column layout, matching whichever the surrounding dialog's width looks better in Step 9's manual check.)

- [ ] **Step 6: Update the client-side filter logic**

In the `ExercisePickerDialog` component, change:

```ts
  const [bodyRegion, setRegion] = useState<string>("all");
```

to:

```ts
  const [bodyRegions, setRegions] = useState<string[]>([]);
```

Change `applyFilters`:

```ts
      if (bodyRegion !== "all" && ex.bodyRegion !== bodyRegion) return false;
```

to:

```ts
      if (bodyRegions.length > 0 && !ex.bodyRegion.some((r) => bodyRegions.includes(r))) return false;
```

Update the two `useMemo` dependency arrays that reference `bodyRegion` (`filteredUniversal`, `filteredMyOrganization`) to `bodyRegions`, and update both `<FilterBar ... bodyRegion={bodyRegion} setRegion={setRegion} .../>` call sites to `bodyRegions={bodyRegions} setRegions={setRegions}`.

- [ ] **Step 7: Update `handleCreate`'s payload**

Change:

```ts
      const result = await createOrganizationExerciseAction({
        name: form.name,
        description: form.description || undefined,
        bodyRegion: form.bodyRegion,
```

— this line is unchanged in shape (still `bodyRegion: form.bodyRegion`), since `form.bodyRegion` is now already `string[]` matching Task 4's updated `createOrganizationExerciseAction` signature. Just update the validation guard above it:

```ts
    if (!form.name || !form.bodyRegion || !form.difficultyLevel) {
```

to:

```ts
    if (!form.name || form.bodyRegion.length === 0 || !form.difficultyLevel) {
```

- [ ] **Step 8: Fix the AI-generate flow's form population**

In `handleGenerateWithAi`, change:

```ts
      setAiForm({
        name: d.exerciseName ?? "",
        description: d.description ?? "",
        bodyRegion: d.bodyRegion ?? "",
```

to:

```ts
      setAiForm({
        name: d.exerciseName ?? "",
        description: d.description ?? "",
        bodyRegion: d.bodyRegion ?? [],
```

(matching Task 2's AI metadata route, which now returns `bodyRegion` as an array.)

- [ ] **Step 9: Manually verify in the dev server**

Run: `npm run dev`, open a program builder, click "Add Exercise" to open the picker. Confirm: (a) the region filter chips toggle independently (multi-select, not replace); (b) exercises tagged with multiple regions show multiple badges; (c) "Create New" → both AI-generate and manual tabs let you multi-select regions and the created exercise is added and selectable.

- [ ] **Step 10: Commit**

```bash
git add components/programs/exercise-picker-dialog.tsx
git commit -m "feat(exercises): multi-select body region filter and create-form in the program exercise picker"
```

---

### Task 9: Admin exercise list — multi-select region filter

**Files:**
- Modify: `app/admin/exercises/page.tsx`
- Modify: `components/admin/exercises-table.tsx`

**Interfaces:**
- Consumes: Task 3's `getAllExercises(params: { bodyRegions?: string[] })`.

- [ ] **Step 1: Update the page's query-param handling**

In `app/admin/exercises/page.tsx`, change:

```ts
interface PageProps {
  searchParams: Promise<{ search?: string; bodyRegion?: string; page?: string }>;
}

export default async function AdminExercisesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const bodyRegion = params.bodyRegion ?? "ALL";
  const page = parseInt(params.page ?? "1", 10);

  const { items: exercises, total, totalPages } = await getAllExercises({ page, pageSize: 25, search, bodyRegion });
```

to:

```ts
interface PageProps {
  searchParams: Promise<{ search?: string; bodyRegion?: string; page?: string }>;
}

export default async function AdminExercisesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const bodyRegions = (params.bodyRegion ?? "").split(",").filter(Boolean);
  const page = parseInt(params.page ?? "1", 10);

  const { items: exercises, total, totalPages } = await getAllExercises({ page, pageSize: 25, search, bodyRegions });
```

(The `bodyRegion` query-param NAME stays a single comma-joined string, matching the existing convention used by the public `/exercises` filters — only its parsing changes from a single value to a split array.)

- [ ] **Step 2: Replace the single `<Select>` with a checkbox group**

Change:

```tsx
        <Select name="bodyRegion" defaultValue={bodyRegion}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Body region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All regions</SelectItem>
            <SelectItem value="LOWER_BODY">Lower Body</SelectItem>
            <SelectItem value="UPPER_BODY">Upper Body</SelectItem>
            <SelectItem value="CORE">Core</SelectItem>
            <SelectItem value="FULL_BODY">Full Body</SelectItem>
            <SelectItem value="BALANCE">Balance</SelectItem>
            <SelectItem value="FLEXIBILITY">Flexibility</SelectItem>
          </SelectContent>
        </Select>
```

to a small inline client component (native checkboxes can't natively express "comma-joined single query param" the way this app's convention expects, so this becomes a tiny client-side control that pushes an updated URL, matching `components/exercises/exercise-filters.tsx`'s `updateParam` pattern). First add the import at the top of `page.tsx`:

```ts
import { AdminBodyRegionFilter } from "@/components/admin/admin-body-region-filter";
```

and replace the `<Select>` block above with:

```tsx
        <AdminBodyRegionFilter selected={bodyRegions} />
```

- [ ] **Step 3: Create the checkbox filter client component**

Create `components/admin/admin-body-region-filter.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BODY_REGIONS } from "@/lib/utils/constants";

interface Props {
  selected: string[];
}

export function AdminBodyRegionFilter({ selected }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function toggle(value: string, checked: boolean) {
    const next = checked ? [...selected, value] : selected.filter((v) => v !== value);
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) {
      params.set("bodyRegion", next.join(","));
    } else {
      params.delete("bodyRegion");
    }
    params.delete("page");
    router.push(`/admin/exercises?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-input bg-background px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground shrink-0">Body region</span>
      {BODY_REGIONS.map((r) => {
        const id = `admin-region-${r.value}`;
        return (
          <div key={r.value} className="flex items-center gap-1.5">
            <Checkbox
              id={id}
              checked={selected.includes(r.value)}
              onCheckedChange={(next) => toggle(r.value, next === true)}
            />
            <Label htmlFor={id} className="text-xs font-normal">{r.label}</Label>
          </div>
        );
      })}
    </div>
  );
}
```

This reads/writes the URL directly on each checkbox click, independent of the surrounding `<form method="GET">`'s search input — matching how the public library's `ExerciseFilters` sidebar already separates its debounced search box from its immediately-applied checkbox filters.

- [ ] **Step 4: Update `AdminExercisesTable`'s prop and pagination links**

Change the props interface and destructure:

```ts
interface AdminExercisesTableProps {
  exercises: ExerciseRow[];
  total: number;
  totalPages: number;
  page: number;
  search: string;
  bodyRegion: string;
}

export function AdminExercisesTable({ exercises, total, totalPages, page, search, bodyRegion }: AdminExercisesTableProps) {
```

to:

```ts
interface AdminExercisesTableProps {
  exercises: ExerciseRow[];
  total: number;
  totalPages: number;
  page: number;
  search: string;
  bodyRegions: string[];
}

export function AdminExercisesTable({ exercises, total, totalPages, page, search, bodyRegions }: AdminExercisesTableProps) {
```

Change the pagination links:

```tsx
              {page > 1 && (
                <a href={`?search=${search}&bodyRegion=${bodyRegion}&page=${page - 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">← Prev</a>
              )}
              {page < totalPages && (
                <a href={`?search=${search}&bodyRegion=${bodyRegion}&page=${page + 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">Next →</a>
              )}
```

to:

```tsx
              {page > 1 && (
                <a href={`?search=${search}&bodyRegion=${bodyRegions.join(",")}&page=${page - 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">← Prev</a>
              )}
              {page < totalPages && (
                <a href={`?search=${search}&bodyRegion=${bodyRegions.join(",")}&page=${page + 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">Next →</a>
              )}
```

- [ ] **Step 5: Update the call site in `page.tsx`**

Change:

```tsx
      <AdminExercisesTable
        exercises={exercises}
        total={total}
        totalPages={totalPages}
        page={page}
        search={search}
        bodyRegion={bodyRegion}
      />
```

to:

```tsx
      <AdminExercisesTable
        exercises={exercises}
        total={total}
        totalPages={totalPages}
        page={page}
        search={search}
        bodyRegions={bodyRegions}
      />
```

- [ ] **Step 6: Manually verify in the dev server**

Run: `npm run dev`, open `/admin/exercises`. Confirm: (a) checking two region boxes filters the list to exercises matching either region and updates the URL to `?bodyRegion=CORE,UPPER_BODY`; (b) pagination links preserve the multi-region filter; (c) unchecking all boxes returns to the unfiltered list.

- [ ] **Step 7: Commit**

```bash
git add app/admin/exercises/page.tsx components/admin/exercises-table.tsx components/admin/admin-body-region-filter.tsx
git commit -m "feat(exercises): multi-select body region filter in the admin exercise list"
```

---

### Task 10: Seed data literals + full-repo type check

**Files:**
- Modify: `lib/db/seed/exercises-v2.ts`
- Modify: `lib/db/seed/exercises-v3.ts`
- Modify: `lib/db/seed/import-athletic-program.ts`

**Interfaces:**
- Consumes: Task 1's `BodyRegion[]` field — this is the last task, so after it the whole repo should type-check.

- [ ] **Step 1: Update `exercises-v2.ts`'s type declaration**

Change:

```ts
export interface SeedExercise {
  name: string;
  description: string;
  bodyRegion: BodyRegion;
```

to:

```ts
export interface SeedExercise {
  name: string;
  description: string;
  bodyRegion: BodyRegion[];
```

- [ ] **Step 2: Wrap every literal in `exercises-v2.ts`**

Every seed object literal in this file currently has the exact shape `bodyRegion: "LOWER_BODY",` (or `"UPPER_BODY"`/`"CORE"`/etc.), no cast. Run this in-place substitution:

```bash
sed -i '' -E 's/bodyRegion: "([A-Z_]+)",/bodyRegion: ["\1"],/g' lib/db/seed/exercises-v2.ts
```

Verify every occurrence converted:

```bash
grep -c 'bodyRegion: "' lib/db/seed/exercises-v2.ts
```

Expected: `0` (no more bare-string literals remain).

```bash
grep -c 'bodyRegion: \[' lib/db/seed/exercises-v2.ts
```

Expected: matches the original count of exercise objects in the file (every literal converted, none duplicated or missed).

- [ ] **Step 3: Wrap every literal in `exercises-v3.ts`**

This file's literals have a trailing `as BodyRegion` cast (e.g. `bodyRegion: "UPPER_BODY" as BodyRegion,`). Run:

```bash
sed -i '' -E 's/bodyRegion: "([A-Z_]+)" as BodyRegion,/bodyRegion: ["\1"] as BodyRegion[],/g' lib/db/seed/exercises-v3.ts
```

Verify:

```bash
grep -c 'as BodyRegion,' lib/db/seed/exercises-v3.ts
```

Expected: `0`.

```bash
grep -c 'as BodyRegion\[\]' lib/db/seed/exercises-v3.ts
```

Expected: matches the file's total exercise count.

- [ ] **Step 4: Update `import-athletic-program.ts`'s type declaration**

Change:

```ts
type ExerciseSeed = {
  name: string;
  description: string;
  bodyRegion: "LOWER_BODY" | "UPPER_BODY" | "CORE" | "FULL_BODY" | "BALANCE" | "FLEXIBILITY";
```

to:

```ts
type ExerciseSeed = {
  name: string;
  description: string;
  bodyRegion: ("LOWER_BODY" | "UPPER_BODY" | "CORE" | "FULL_BODY" | "BALANCE" | "FLEXIBILITY")[];
```

- [ ] **Step 5: Wrap every literal in `import-athletic-program.ts`**

Same plain-literal shape as `exercises-v2.ts`. Run:

```bash
sed -i '' -E 's/bodyRegion: "([A-Z_]+)",/bodyRegion: ["\1"],/g' lib/db/seed/import-athletic-program.ts
```

Verify:

```bash
grep -c 'bodyRegion: "' lib/db/seed/import-athletic-program.ts
```

Expected: `0`.

- [ ] **Step 6: Re-seed the dev database**

Run: `npm run db:seed`
Expected: completes without error, upserting all v2+v3 exercises with array `bodyRegion` values (verify a few in `npx prisma studio` show a full array, e.g. exercises that previously would've been single-tagged still show their one region correctly, just as a one-element array).

Run: `npm run db:coach-plan`
Expected: completes without error (this script's `upsertExercise`/`prisma.exercise.create` call in `import-athletic-program.ts` needs no separate fix — it already does `data: exercise` pass-through, same as `seed.ts`).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests PASS (every test file touched across Tasks 2–4 plus everything untouched).

- [ ] **Step 8: Run the full type check / build**

Run: `npm run build`
Expected: completes without TypeScript errors. This is the first point in the whole migration where the ENTIRE codebase must agree on the array shape — if this fails, grep the reported file/line, and check it against the "must change" list in the design spec (`docs/superpowers/specs/2026-08-06-multi-region-equipment-edit-design.md`) for a site this plan may have missed (in particular, double-check any `bodyRegion` usage in `components/exercises/bulk-import-form.tsx`, `components/workout/workout-checklist-tracker.tsx`, `components/workout/workout-session-tracker.tsx`, `components/programs/program-builder.tsx`, `components/programs/program-editor.tsx`, `components/programs/program-schedule-view.tsx`, and the two admin program-editor-wrapper files, which the original research pass flagged as read-only type declarations/pass-throughs that should tolerate the array change automatically, but a real compiler run is the authoritative check).

- [ ] **Step 9: Commit**

```bash
git add lib/db/seed/exercises-v2.ts lib/db/seed/exercises-v3.ts lib/db/seed/import-athletic-program.ts
git commit -m "feat(exercises): wrap seed data bodyRegion literals into arrays"
```

---

## Self-Review Notes

- **Spec coverage:** Data model/migration → Task 1. Validators/AI route → Task 2. Query operator fixes → Task 3. Actions/audit diffing/CSV wrap → Task 4. Display fixes → Task 5. Edit form (the original ask) → Task 6. Create form fix → Task 7. Program picker multi-select → Task 8. Admin filter multi-select → Task 9. Seed data + final verification → Task 10. Every section of the design spec has a corresponding task.
- **Type consistency checked:** `getAllExercises`'s param renamed `bodyRegion?: string` → `bodyRegions?: string[]` consistently across Task 3 (service), Task 9 (page.tsx caller, exercises-table.tsx prop). `createOrganizationExerciseAction`/`createExerciseAction`'s `bodyRegion: string[]` is consistent across Task 4 (producer) and Tasks 6/7/8 (callers). `ExerciseCardProps.bodyRegion: string[]` (Task 5) matches its only caller `exercise-grid.tsx`'s unchanged pass-through of `exercise.bodyRegion`.
- **No CSV format change** confirmed in Task 4 (Step 7) — `BulkExerciseInput`/`CsvExerciseRow` stay single-value; only the `prisma.exercise.create` call wraps it.
