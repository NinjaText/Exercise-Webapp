# Assessment Exercise Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let trainers/admins mark an exercise as an "assessment exercise" (used to evaluate a client, not to train them), with the AI metadata generator suggesting the flag, and have it excluded from every AI program-generation pool and the manual "add exercise to program" pickers, while remaining browsable via a filter/tab in the exercise library.

**Architecture:** A single new `isAssessment: Boolean @default(false)` field on the `Exercise` Prisma model. Every program-building query gets a hardcoded `isAssessment: false` clause. The exercise-library browsing queries (`getExercises`, `getAllExercises`) get an optional `isAssessment` filter param that UI tabs toggle between `false` (default) and `true`. The AI metadata-generation endpoint proposes a value; humans confirm it via a checkbox on the create/edit form and each bulk-import row before saving.

**Tech Stack:** Next.js App Router, Prisma (MongoDB), Zod validators, Vitest, Server Actions, `ai` SDK (`generateObject`) with OpenAI.

## Global Constraints

- Never write bare "assessment" in new UI copy or code comments where it could be confused with the existing patient-outcomes "Assessment" feature (`app/(platform)/assessments/*`) — always say "assessment exercise".
- The field defaults to `false` — no backfill migration needed; every existing exercise stays program-eligible.
- Do not add exercise-kind enum/taxonomy — boolean only, per approved design (`docs/superpowers/specs/2026-08-10-assessment-exercise-flag-design.md`).
- Do not change `actions/search-actions.ts` or the equipment-availability query in `actions/program-actions.ts` — out of scope per the design.
- Do not add an "Assessment exercise" toggle to the inline quick-add-exercise mini-form inside `components/programs/exercise-picker-dialog.tsx` — that flow is for adding exercises while building a program, so it should keep defaulting to `isAssessment: false` implicitly (the Prisma default) rather than exposing the toggle there.

---

### Task 1: Add `isAssessment` field to the Exercise schema

**Files:**
- Modify: `prisma/schema.prisma:208-244` (the `Exercise` model)

**Interfaces:**
- Produces: `Exercise.isAssessment: boolean`, available on every Prisma `Exercise` query result and in `Prisma.ExerciseWhereInput` as `isAssessment?: boolean`. All later tasks rely on this field existing on the generated Prisma client.

- [ ] **Step 1: Add the field to the model**

In `prisma/schema.prisma`, inside `model Exercise`, add `isAssessment` right after `rehabStage`:

```prisma
  rehabStage         String?
  isAssessment       Boolean         @default(false)
  isActive           Boolean         @default(true)
```

- [ ] **Step 2: Push the schema to the database and regenerate the Prisma client**

Run: `npm run db:push`
Expected: Prisma reports the schema is in sync (MongoDB requires no migration file) and regenerates `@prisma/client`.

- [ ] **Step 3: Verify the field is on the generated client**

Run: `grep -n "isAssessment" node_modules/.prisma/client/index.d.ts`
Expected: at least one match showing `isAssessment: boolean` on the `Exercise` type.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add isAssessment field to Exercise model"
```

---

### Task 2: Exclude assessment exercises from the AI program-generation pool builders

**Files:**
- Modify: `lib/ai/utils/exercise-pool.ts:36-81` (`buildPhasePoolPrimaryWhereClause`, `buildPhasePoolFallbackWhereClause`)
- Test: `lib/ai/utils/__tests__/exercise-pool.test.ts`

**Interfaces:**
- Consumes: `Exercise.isAssessment` from Task 1.
- Produces: both where-clause builders now always include `isAssessment: false` in their returned `Record<string, unknown>`. `lib/services/ai.service.ts`'s `buildExercisePoolForPhase` (Task 3) calls these builders and inherits the exclusion automatically — no separate edit needed there.

- [ ] **Step 1: Write the failing tests**

Add to `lib/ai/utils/__tests__/exercise-pool.test.ts`, inside the existing `describe('buildPhasePoolPrimaryWhereClause', ...)` block:

```ts
  it('always excludes assessment exercises from the pool', () => {
    const phaseInput = {
      rehabStage: 'MID_REHAB' as const,
      focusAreas: ['CORE'],
      derivedIndicationTags: [],
    }
    const clause = buildPhasePoolPrimaryWhereClause(phaseInput, new Set())
    expect(clause.isAssessment).toBe(false)
  })
```

And inside the existing `describe('buildPhasePoolFallbackWhereClause', ...)` block:

```ts
  it('always excludes assessment exercises from the pool', () => {
    const clause = buildPhasePoolFallbackWhereClause(['CORE'], new Set())
    expect(clause.isAssessment).toBe(false)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/ai/utils/__tests__/exercise-pool.test.ts`
Expected: both new tests FAIL with `expected undefined to be false`.

- [ ] **Step 3: Implement the exclusion**

In `lib/ai/utils/exercise-pool.ts`, update `buildPhasePoolPrimaryWhereClause` (around line 40):

```ts
  const clause: Record<string, unknown> = {
    isActive: true,
    isAssessment: false,
    rehabStage: input.rehabStage,
    bodyRegion: { hasSome: input.focusAreas },
  }
```

And `buildPhasePoolFallbackWhereClause` (around line 67):

```ts
  const clause: Record<string, unknown> = {
    isActive: true,
    isAssessment: false,
    bodyRegion: { hasSome: focusAreas },
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/ai/utils/__tests__/exercise-pool.test.ts`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/utils/exercise-pool.ts lib/ai/utils/__tests__/exercise-pool.test.ts
git commit -m "feat: exclude assessment exercises from AI pool where-clause builders"
```

---

### Task 3: Exclude assessment exercises from ai.service.ts's direct pool queries

**Files:**
- Modify: `lib/services/ai.service.ts:655-659` (legacy single-phase `generateWorkoutPlan` path), `lib/services/ai.service.ts:1193` (`buildProgramPreviewFromBlueprint`'s `allBriefExercises` lookup)
- Test: `lib/services/__tests__/ai.service.test.ts`

**Interfaces:**
- Consumes: `Exercise.isAssessment` from Task 1.

- [ ] **Step 1: Write the failing test for `buildProgramPreviewFromBlueprint`**

Add to `lib/services/__tests__/ai.service.test.ts`, inside the existing `describe('buildProgramPreviewFromBlueprint', ...)` block:

```ts
  it('excludes assessment exercises from the exercise lookup query', async () => {
    const squat = exercise({ id: 'sq1', name: 'Back Squat' })
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([squat])

    await buildProgramPreviewFromBlueprint({
      circuits: [{ name: 'Strength Block A', focusType: 'LOWER_BODY', exerciseCount: 1 }],
      preferredWeekdays: ['Monday'],
      sessionBlueprint: [
        {
          dayIndex: 0,
          weekIndex: 0,
          title: 'Lower Body A',
          blocks: [{ name: 'Strength Block A', exercises: [{ name: 'Back Squat' }] }],
        },
      ],
    })

    expect(prisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, isAssessment: false }),
      })
    )
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/services/__tests__/ai.service.test.ts`
Expected: FAIL — the actual call's `where` is `{ isActive: true }`, missing `isAssessment: false`.

- [ ] **Step 3: Implement the exclusion at both sites**

In `lib/services/ai.service.ts` line 1193, change:

```ts
  const allBriefExercises = await prisma.exercise.findMany({ where: { isActive: true } });
```

to:

```ts
  const allBriefExercises = await prisma.exercise.findMany({ where: { isActive: true, isAssessment: false } });
```

And in the legacy single-phase path (around line 656), change:

```ts
    where: {
      isActive: true,
      bodyRegion: { hasSome: targetRegions },
    },
```

to:

```ts
    where: {
      isActive: true,
      isAssessment: false,
      bodyRegion: { hasSome: targetRegions },
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/services/__tests__/ai.service.test.ts`
Expected: PASS, all tests including the new one.

Note: the legacy single-phase branch inside `generateWorkoutPlan` has no existing unit test in this file (only `resolveExerciseMatch` and `buildProgramPreviewFromBlueprint` are covered) — this matches existing test coverage in the codebase; this task does not add new test infrastructure for that function, consistent with its current state.

- [ ] **Step 5: Commit**

```bash
git add lib/services/ai.service.ts lib/services/__tests__/ai.service.test.ts
git commit -m "feat: exclude assessment exercises from ai.service pool queries"
```

---

### Task 4: Exclude assessment exercises from the generate-program route's exercise matcher

**Files:**
- Modify: `app/api/ai/generate-program/route.ts:36-41`

**Interfaces:**
- Consumes: `Exercise.isAssessment` from Task 1.

- [ ] **Step 1: Update the query**

In `app/api/ai/generate-program/route.ts`, change:

```ts
    const exercisesResult = await prisma.exercise.findMany({
      select: { id: true, name: true },
      where: {
        isActive: true,
      }
    });
```

to:

```ts
    const exercisesResult = await prisma.exercise.findMany({
      select: { id: true, name: true },
      where: {
        isActive: true,
        isAssessment: false,
      }
    });
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no new type errors.

There is no existing test file for this route (`app/api/ai/generate-program`), matching its current state — this task does not introduce new route-test infrastructure.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/generate-program/route.ts
git commit -m "feat: exclude assessment exercises from generate-program exercise matcher"
```

---

### Task 5: Exclude assessment exercises from the picker, add a library filter, and persist the flag on create/update

**Files:**
- Modify: `lib/services/exercise.service.ts:10-158` (`ExerciseFilters`, `getExercises`, `getExercisesForPicker`, `createExercise`, `updateExercise`)
- Test: `lib/services/__tests__/exercise.service.test.ts`

**Interfaces:**
- Consumes: `Exercise.isAssessment` from Task 1.
- Produces: `ExerciseFilters.isAssessment?: boolean` (defaults to `false` when omitted); `createExercise(data)` and `updateExercise(id, data)` both accept an optional `isAssessment: boolean` in their `data` parameter. Task 7's `createExerciseAction`/`updateExerciseAction` and Task 12/13's library pages rely on these signatures.

- [ ] **Step 1: Write the failing tests**

Add to `lib/services/__tests__/exercise.service.test.ts`, a new `describe` block after `getExercises muscle group filtering`:

```ts
describe('getExercises isAssessment filtering', () => {
  it('defaults to training exercises (isAssessment: false) when not specified', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({})
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).toHaveProperty('isAssessment', false)
  })

  it('filters to assessment exercises when isAssessment: true is requested', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ isAssessment: true })
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).toHaveProperty('isAssessment', true)
  })
})

describe('getExercisesForPicker excludes assessment exercises', () => {
  it('always filters isAssessment: false', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercisesForPicker('org_mine')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isAssessment: false }),
      })
    )
  })
})

describe('createExercise', () => {
  it('persists isAssessment when provided', async () => {
    mockCreate.mockResolvedValue({ id: 'ex_new' } as any)
    await createExercise({
      name: 'Single-Leg Squat Test',
      bodyRegion: ['LOWER_BODY'] as any,
      equipmentRequired: [],
      difficultyLevel: 'INTERMEDIATE' as any,
      contraindications: [],
      createdById: 'user_1',
      isAssessment: true,
    })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isAssessment: true }) })
    )
  })

  it('defaults isAssessment to false when not provided', async () => {
    mockCreate.mockResolvedValue({ id: 'ex_new' } as any)
    await createExercise({
      name: 'Squat',
      bodyRegion: ['LOWER_BODY'] as any,
      equipmentRequired: [],
      difficultyLevel: 'BEGINNER' as any,
      contraindications: [],
      createdById: 'user_1',
    })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isAssessment: false }) })
    )
  })
})

describe('updateExercise', () => {
  it('persists an isAssessment change', async () => {
    mockUpdate.mockResolvedValue({ id: 'ex_1', isAssessment: true } as any)
    await updateExercise('ex_1', { isAssessment: true })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'ex_1' },
      data: { isAssessment: true },
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/exercise.service.test.ts`
Expected: FAIL — `getExercises`/`getExercisesForPicker` don't filter on `isAssessment`, and `createExercise` doesn't accept/persist it (`Object.prototype.hasOwnProperty` checks fail / `isAssessment` undefined in the create-call assertions).

- [ ] **Step 3: Implement**

In `lib/services/exercise.service.ts`, add `isAssessment` to the filters interface (around line 10):

```ts
export interface ExerciseFilters {
  search?: string;
  bodyRegions?: BodyRegion[];
  difficultyLevel?: DifficultyLevel;
  exercisePhases?: ExercisePhase[];
  muscleGroups?: string[];
  equipment?: string;
  source?: ExerciseSource;
  organizationId?: string;
  isAssessment?: boolean;
}
```

In `getExercises`'s `where` object (around line 24), add an always-present clause right after `isActive: true`:

```ts
    where: {
      isActive: true,
      isAssessment: filters.isAssessment ?? false,
```

In `getExercisesForPicker`'s `where` object (around line 72-75), add `isAssessment: false`:

```ts
    where: {
      isActive: true,
      isAssessment: false,
      OR: orClauses,
    },
```

In `createExercise`'s parameter type (around line 112-128), add `isAssessment?: boolean;`:

```ts
export async function createExercise(data: {
  name: string;
  description?: string;
  bodyRegion: BodyRegion[];
  equipmentRequired: string[];
  difficultyLevel: DifficultyLevel;
  contraindications: string[];
  instructions?: string;
  videoUrl?: string;
  videoProvider?: string;
  imageUrl?: string;
  createdById: string;
  source?: ExerciseSource;
  organizationId?: string;
  isPublic?: boolean;
  exercisePhases?: ExercisePhase[];
  isAssessment?: boolean;
}) {
```

And in the `prisma.exercise.create` call's `data` (around line 139-156), add:

```ts
      exercisePhases: data.exercisePhases ?? [],
      isAssessment: data.isAssessment ?? false,
    },
  });
}
```

In `updateExercise`'s `Partial<{...}>` type (around line 232-245), add `isAssessment: boolean;`:

```ts
export async function updateExercise(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    bodyRegion: BodyRegion[];
    equipmentRequired: string[];
    difficultyLevel: DifficultyLevel;
    contraindications: string[];
    instructions: string;
    videoUrl: string;
    videoProvider: string;
    imageUrl: string;
    isActive: boolean;
    isPublic: boolean;
    isAssessment: boolean;
  }>
) {
```

No change is needed to the function body — it already spreads `data` verbatim into `nextData`/the update call.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/exercise.service.test.ts`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/services/exercise.service.ts lib/services/__tests__/exercise.service.test.ts
git commit -m "feat: add isAssessment filtering to exercise service, exclude from picker"
```

---

### Task 6: Exclude assessment exercises from the workout-editor's add-exercise list

**Files:**
- Modify: `actions/workout-editor-actions.ts:234-251` (`getExercisesForPickerAction`)

**Interfaces:**
- Consumes: `Exercise.isAssessment` from Task 1.

- [ ] **Step 1: Update the query**

In `actions/workout-editor-actions.ts`, change:

```ts
  const exercises = await prisma.exercise.findMany({
    where: { isActive: true },
    select: {
```

to:

```ts
  const exercises = await prisma.exercise.findMany({
    where: { isActive: true, isAssessment: false },
    select: {
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no new type errors. There is no existing test file for `workout-editor-actions.ts`, matching its current state.

- [ ] **Step 3: Commit**

```bash
git add actions/workout-editor-actions.ts
git commit -m "feat: exclude assessment exercises from workout editor add-exercise list"
```

---

### Task 7: Accept `isAssessment` in the exercise create/update validators and server actions

**Files:**
- Modify: `lib/validators/exercise.ts:3-19` (`createExerciseSchema`, `updateExerciseSchema`)
- Modify: `actions/exercise-actions.ts:12-24` (`createExerciseAction` input type)
- Test: `lib/validators/__tests__/exercise.test.ts`

**Interfaces:**
- Consumes: `createExercise`/`updateExercise` accepting `isAssessment` from Task 5.
- Produces: `createExerciseSchema`/`updateExerciseSchema` (and therefore `CreateExerciseInput`/`UpdateExerciseInput`) include `isAssessment?: boolean`. `createExerciseAction`'s input type accepts `isAssessment?: boolean`. Task 9/10/11's UI forms send this field through these actions.

- [ ] **Step 1: Write the failing test**

Add to `lib/validators/__tests__/exercise.test.ts`, a new `describe` block:

```ts
describe("createExerciseSchema isAssessment", () => {
  const base = {
    name: "Squat",
    difficultyLevel: "BEGINNER",
    bodyRegion: ["LOWER_BODY"],
    equipmentRequired: [],
    contraindications: [],
  };

  it("accepts isAssessment: true", () => {
    const result = createExerciseSchema.safeParse({ ...base, isAssessment: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isAssessment).toBe(true);
  });

  it("defaults isAssessment to false when omitted", () => {
    const result = createExerciseSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isAssessment).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/validators/__tests__/exercise.test.ts`
Expected: FAIL — `result.data.isAssessment` is `undefined`, not `false`/`true`.

- [ ] **Step 3: Implement**

In `lib/validators/exercise.ts`, add to `createExerciseSchema` (right before the closing `});` around line 14):

```ts
  isPublic: z.boolean().optional().default(true),
  isAssessment: z.boolean().optional().default(false),
});
```

`updateExerciseSchema` already inherits this via `createExerciseSchema.partial().extend({...})` — no further change needed there.

In `actions/exercise-actions.ts`, add `isAssessment?: boolean;` to `createExerciseAction`'s input type (around line 23, after `isPublic?: boolean;`). No other change is needed in that function body: it spreads `...parsed.data` into `exerciseService.createExercise`, so the parsed `isAssessment` passes through automatically. `updateExerciseAction` takes `input: Record<string, unknown>` already and passes `parsed.data` straight through — no signature change needed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/validators/__tests__/exercise.test.ts`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/validators/exercise.ts actions/exercise-actions.ts lib/validators/__tests__/exercise.test.ts
git commit -m "feat: accept isAssessment in exercise create/update validators and actions"
```

---

### Task 8: AI metadata generator suggests isAssessment

**Files:**
- Modify: `app/api/ai/generate-exercise-metadata/route.ts:13-69`

**Interfaces:**
- Produces: the JSON response from `POST /api/ai/generate-exercise-metadata` includes an `isAssessment: boolean` field alongside the existing metadata fields. Task 11's bulk-import row-building code reads `d.isAssessment` from this response.

- [ ] **Step 1: Add the field to the generated schema**

In `app/api/ai/generate-exercise-metadata/route.ts`, in `buildMetadataFields` (around line 41, right after `defaultReps`), add:

```ts
    defaultReps: z.number().int().min(1).max(60).describe("Recommended reps per set"),
    isAssessment: z.boolean().describe(
      "True if this is a clinical/functional assessment or outcome-measure test used to evaluate a client (e.g. a movement screen, a timed or rep-max test, a balance/ROM test) rather than an exercise used to train them. False for ordinary strengthening, mobility, warmup, or cooldown exercises."
    ),
  };
}
```

- [ ] **Step 2: Add a short instruction to both system prompts**

In `CLINICAL_SYSTEM_PROMPT` (around line 59-61), append a sentence:

```ts
const CLINICAL_SYSTEM_PROMPT = `You are an expert physical therapist specializing in senior rehabilitation and geriatric fitness.
Clients are typically older adults (60+) recovering from injury or surgery, or managing chronic conditions.
All metadata must be conservative, evidence-based, and safe for this population.
Distinguish assessment/screening exercises (e.g. movement tests, timed tests, ROM checks used to evaluate a client) from ordinary training exercises when setting isAssessment.`;
```

In `PERFORMANCE_SYSTEM_PROMPT` (around line 63-65), append the same sentence:

```ts
const PERFORMANCE_SYSTEM_PROMPT = `You are an expert strength & conditioning coach specializing in athletic performance and general fitness.
Clients are typically healthy athletes or general-fitness trainees training toward a performance or fitness goal — not rehabilitation.
Do not use clinical/rehab framing or geriatric language. All metadata must be practical, evidence-based coaching guidance appropriate for this population.
Distinguish assessment/screening exercises (e.g. movement tests, timed tests, performance benchmarks used to evaluate a client) from ordinary training exercises when setting isAssessment.`;
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no new type errors. There is no existing test file for this route, matching its current state — this task does not introduce new route-test infrastructure (the change is additive to an already-untested `generateObject` call).

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/generate-exercise-metadata/route.ts
git commit -m "feat: have AI metadata generator suggest isAssessment"
```

---

### Task 9: Add the "Assessment exercise" toggle to the manual create form

**Files:**
- Modify: `components/exercises/exercise-form.tsx`

**Interfaces:**
- Consumes: `createExerciseAction` accepting `isAssessment?: boolean` from Task 7.

- [ ] **Step 1: Add state and import the Checkbox component**

In `components/exercises/exercise-form.tsx`, add to the imports (near line 7):

```tsx
import { Checkbox } from "@/components/ui/checkbox";
```

Add state near the other `useState` calls (around line 30):

```tsx
  const [isAssessment, setIsAssessment] = useState(false);
```

- [ ] **Step 2: Include it in the submit payload**

In `handleSubmit`'s call to `createExerciseAction` (around line 74-87), add:

```tsx
      instructions: (formData.get("instructions") as string) || undefined,
      videoUrl: videoUrl || undefined,
      isAssessment,
    });
```

- [ ] **Step 3: Add the toggle UI**

Add a new section right before the "YouTube URL only" block (before line 272-273):

```tsx
          {/* Assessment exercise toggle */}
          <div className="flex items-start gap-3 rounded-lg border border-border p-4">
            <Checkbox
              id="isAssessment"
              checked={isAssessment}
              onCheckedChange={(checked) => setIsAssessment(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="isAssessment" className="font-medium">
                Assessment exercise
              </Label>
              <p className="text-xs text-muted-foreground">
                Used to evaluate a client (e.g. a movement screen or timed test) rather than to train
                them. Assessment exercises are excluded from AI-generated programs and the
                add-exercise picker.
              </p>
            </div>
          </div>
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, navigate to `/exercises/new`, fill required fields, check the "Assessment exercise" toggle, submit. Confirm the created exercise's `isAssessment` is `true` (check via `/admin/exercises` or a DB lookup with `npx prisma studio`). Then repeat leaving it unchecked and confirm `isAssessment` is `false`.

- [ ] **Step 5: Commit**

```bash
git add components/exercises/exercise-form.tsx
git commit -m "feat: add assessment-exercise toggle to manual create form"
```

---

### Task 10: Add the "Assessment exercise" toggle to the manual edit form

**Files:**
- Modify: `components/exercises/exercise-edit-form.tsx`

**Interfaces:**
- Consumes: `updateExerciseAction` passing through `isAssessment` from Task 7; `Exercise.isAssessment` from Task 1.

- [ ] **Step 1: Add the field to the local `Exercise` interface and import Checkbox**

In `components/exercises/exercise-edit-form.tsx`, add to imports (near line 6):

```tsx
import { Checkbox } from "@/components/ui/checkbox";
```

Add to the `Exercise` interface (around line 25-38):

```tsx
interface Exercise {
  id: string;
  name: string;
  description: string | null;
  bodyRegion: string[];
  difficultyLevel: string;
  equipmentRequired: string[];
  contraindications: string[];
  instructions: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  isActive: boolean;
  isAssessment: boolean;
  media: MediaItem[];
}
```

- [ ] **Step 2: Add state initialized from the exercise prop**

Near the other `useState` calls (around line 53):

```tsx
  const [isAssessment, setIsAssessment] = useState(exercise.isAssessment);
```

- [ ] **Step 3: Include it in the submit payload**

In `handleSubmit`'s call to `updateExerciseAction` (around line 77-91), add:

```tsx
      videoUrl: videoUrl.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      isActive: isActive === "true",
      isAssessment,
    });
```

- [ ] **Step 4: Add the toggle UI**

Add a new section right after the "Difficulty + Status" grid (after line 223, before the "Equipment" section):

```tsx
          {/* Assessment exercise toggle */}
          <div className="flex items-start gap-3 rounded-lg border border-border p-4">
            <Checkbox
              id="isAssessment"
              checked={isAssessment}
              onCheckedChange={(checked) => setIsAssessment(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="isAssessment" className="font-medium">
                Assessment exercise
              </Label>
              <p className="text-xs text-muted-foreground">
                Used to evaluate a client (e.g. a movement screen or timed test) rather than to train
                them. Assessment exercises are excluded from AI-generated programs and the
                add-exercise picker.
              </p>
            </div>
          </div>
```

- [ ] **Step 5: Update the callers passing the `exercise` prop**

`app/(platform)/exercises/[id]/edit/page.tsx` and `app/admin/exercises/[id]/edit/page.tsx` both call `getExerciseById(id)` (from Task 1's schema change, this now returns `isAssessment` automatically since that function does not use a narrowing `select`) and pass the full result as the `exercise` prop — no changes needed in either page file, since the new field is already present on the object.

- [ ] **Step 6: Verify manually**

Run: `npm run dev`, navigate to `/exercises/[id]/edit` for an existing exercise, confirm the toggle reflects the exercise's current `isAssessment` value, flip it, save, and confirm the change persisted (reload the edit page).

- [ ] **Step 7: Commit**

```bash
git add components/exercises/exercise-edit-form.tsx
git commit -m "feat: add assessment-exercise toggle to manual edit form"
```

---

### Task 11: Bulk import — AI-suggested row toggle and persistence

**Files:**
- Modify: `components/exercises/bulk-import-form.tsx:144-186` (`ExerciseRow`, `makeRow`), `:224-269` (`processUrlBatch`), `:906+` (`RowProps`/row rendering)
- Modify: `actions/bulk-exercise-actions.ts:11-87` (`BulkExerciseInput`, `bulkCreateExercisesAction`)
- Test: `actions/__tests__/bulk-exercise-actions.test.ts`

**Interfaces:**
- Consumes: the AI metadata response's `isAssessment` field from Task 8.
- Produces: `BulkExerciseInput.isAssessment?: boolean`; `bulkCreateExercisesAction` persists it.

- [ ] **Step 1: Write the failing test**

Add to `actions/__tests__/bulk-exercise-actions.test.ts`, a new `describe` block:

```ts
describe('bulkCreateExercisesAction — isAssessment', () => {
  it('persists isAssessment: true when a row is flagged', async () => {
    mockUserFindUnique.mockResolvedValue(TRAINER_NO_ORG as any)
    vi.mocked(prisma.exercise.create).mockImplementation((args: any) => args as any)

    await bulkCreateExercisesAction([{ ...EXERCISE, isAssessment: true }])

    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isAssessment: true }),
      })
    )
  })

  it('defaults isAssessment to false when a row omits it', async () => {
    mockUserFindUnique.mockResolvedValue(TRAINER_NO_ORG as any)
    vi.mocked(prisma.exercise.create).mockImplementation((args: any) => args as any)

    await bulkCreateExercisesAction([EXERCISE])

    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isAssessment: false }),
      })
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run actions/__tests__/bulk-exercise-actions.test.ts`
Expected: FAIL — `data.isAssessment` is `undefined` in the actual call.

- [ ] **Step 3: Implement the action + type change**

In `actions/bulk-exercise-actions.ts`, add to `BulkExerciseInput` (around line 11-26):

```ts
export interface BulkExerciseInput {
  name: string;
  description?: string;
  instructions?: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhases?: string[];
  musclesTargeted: string[];
  equipmentRequired: string[];
  contraindications: string[];
  commonMistakes?: string;
  defaultSets?: number;
  defaultReps?: number;
  videoUrl?: string;
  imageUrl?: string;
  isAssessment?: boolean;
}
```

In `bulkCreateExercisesAction`'s `prisma.exercise.create` data (around line 47-66), add:

```ts
            videoProvider: ex.videoUrl ? "youtube" : null,
            createdById: dbUser.id,
            isActive: true,
            isAssessment: ex.isAssessment ?? false,
            ...orgData,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run actions/__tests__/bulk-exercise-actions.test.ts`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Update the bulk-import form's row state and AI-prefill**

In `components/exercises/bulk-import-form.tsx`, add to `ExerciseRow` (around line 144-163):

```tsx
interface ExerciseRow {
  rowId: string;
  videoUrl: string;
  videoFileName: string;
  imageUrl: string;
  name: string;
  description: string;
  instructions: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhases: string[];
  musclesTargeted: string;
  equipmentRequired: string[];
  contraindications: string;
  commonMistakes: string;
  defaultSets: string;
  defaultReps: string;
  isAssessment: boolean;
  aiStatus: AiStatus;
  expanded: boolean;
}
```

Add to `makeRow`'s returned object (around line 166-185):

```tsx
    defaultSets: "3",
    defaultReps: "10",
    isAssessment: false,
    aiStatus: "idle",
    expanded: true,
  };
}
```

In `processUrlBatch`, after populating the row from the AI response (around line 244-257), add:

```tsx
        newRow.defaultReps = String(d.defaultReps ?? 10);
        newRow.isAssessment = d.isAssessment ?? false;
        newRow.aiStatus = "done";
```

In the submit-payload builder (around line 486-489, inside the function that maps `ready` rows before calling `bulkCreateExercisesAction`), add:

```tsx
      difficultyLevel: r.difficultyLevel,
      exercisePhases: r.exercisePhases,
      isAssessment: r.isAssessment,
```

- [ ] **Step 6: Add the row-level toggle to the row UI**

In the row-rendering component (`RowProps`, around line 906+), find the difficulty `<select>` (around line 986) and add a checkbox immediately after it:

```tsx
              <select value={row.difficultyLevel} onChange={(e) => onUpdate({ difficultyLevel: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {/* existing options unchanged */}
              </select>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={row.isAssessment}
                  onChange={(e) => onUpdate({ isAssessment: e.target.checked })}
                />
                Assessment exercise
              </label>
```

(Use a plain `<input type="checkbox">` here rather than the `Checkbox` UI component, matching this file's existing plain-`<select>` row-editing style rather than introducing a new component dependency into this already-large file.)

- [ ] **Step 7: Verify manually**

Run: `npm run dev`, navigate to `/exercises/bulk-import`, import 1-2 YouTube URLs of movement tests (e.g. search "single leg squat test"), confirm the AI-suggested "Assessment exercise" checkbox state is populated, toggle it manually if needed, publish, and confirm via `/admin/exercises` (or Prisma Studio) that the created exercises have the expected `isAssessment` value.

- [ ] **Step 8: Commit**

```bash
git add components/exercises/bulk-import-form.tsx actions/bulk-exercise-actions.ts actions/__tests__/bulk-exercise-actions.test.ts
git commit -m "feat: add AI-suggested assessment-exercise toggle to bulk import"
```

---

### Task 12: Trainer-facing exercise library — Training/Assessment filter tab

**Files:**
- Modify: `app/(platform)/exercises/page.tsx`

**Interfaces:**
- Consumes: `getExercises`'s `isAssessment` filter from Task 5.

- [ ] **Step 1: Read the `kind` search param and pass it to `getExercises`**

In `app/(platform)/exercises/page.tsx`, update the `Props` interface (around line 15-25) to add `kind?: string;`, and after computing `activeSource` (around line 33), add:

```tsx
  const activeKind = params.kind === "assessment" ? "assessment" : "training";
```

Update the `getExercises` call (around line 51-60) to add:

```tsx
  const exercises = await getExercises({
    search: params.search,
    bodyRegions,
    difficultyLevel: params.difficultyLevel as DifficultyLevel | undefined,
    exercisePhases,
    muscleGroups,
    equipment: params.equipment,
    source: activeSource as ExerciseSource,
    organizationId: activeSource === "ORGANIZATION" ? organizationOrgId : undefined,
    isAssessment: activeKind === "assessment",
  });
```

- [ ] **Step 2: Preserve `kind` in the source-tab links and add kind-tab links**

Update `tabUrl` (around line 62-72) to preserve `kind`:

```tsx
  const tabUrl = (source: string) => {
    const sp = new URLSearchParams();
    if (params.search)          sp.set("search",          params.search);
    if (params.bodyRegion)      sp.set("bodyRegion",      params.bodyRegion);
    if (params.difficultyLevel) sp.set("difficultyLevel", params.difficultyLevel);
    if (params.exercisePhase)   sp.set("exercisePhase",   params.exercisePhase);
    if (params.muscleGroup)     sp.set("muscleGroup",     params.muscleGroup);
    if (params.equipment)       sp.set("equipment",       params.equipment);
    if (activeKind === "assessment") sp.set("kind", "assessment");
    sp.set("source", source);
    return `/exercises?${sp.toString()}`;
  };

  const kindUrl = (kind: "training" | "assessment") => {
    const sp = new URLSearchParams();
    if (params.search)          sp.set("search",          params.search);
    if (params.bodyRegion)      sp.set("bodyRegion",      params.bodyRegion);
    if (params.difficultyLevel) sp.set("difficultyLevel", params.difficultyLevel);
    if (params.exercisePhase)   sp.set("exercisePhase",   params.exercisePhase);
    if (params.muscleGroup)     sp.set("muscleGroup",     params.muscleGroup);
    if (params.equipment)       sp.set("equipment",       params.equipment);
    if (kind === "assessment") sp.set("kind", "assessment");
    sp.set("source", activeSource);
    return `/exercises?${sp.toString()}`;
  };
```

- [ ] **Step 3: Render the kind tabs above the source tabs**

Insert right before the existing `<div className="flex gap-1 border-b">` source-tab block (around line 97):

```tsx
      <div className="flex gap-1 border-b">
        {(["training", "assessment"] as const).map((k) => (
          <Link
            key={k}
            href={kindUrl(k)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeKind === k
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {k === "training" ? "Training" : "Assessment"}
          </Link>
        ))}
      </div>

      <div className="flex gap-1 border-b">
        {(["UNIVERSAL", "ORGANIZATION"] as const).map((src) => (
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, navigate to `/exercises`, confirm the default "Training" tab shows only `isAssessment: false` exercises and the "Assessment" tab (once at least one assessment exercise exists from Task 9/11's manual testing) shows only `isAssessment: true` ones, and that switching source (Universal/My Organization) preserves the selected kind tab.

- [ ] **Step 5: Commit**

```bash
git add "app/(platform)/exercises/page.tsx"
git commit -m "feat: add training/assessment filter tab to exercise library page"
```

---

### Task 13: Admin exercise library — Training/Assessment filter tab

**Files:**
- Modify: `lib/services/admin.service.ts:238-273` (`getAllExercises`)
- Modify: `app/admin/exercises/page.tsx`
- Test: none exist for `admin.service.ts`'s `getAllExercises`; this task does not introduce new test infrastructure for it, matching its current state.

**Interfaces:**
- Consumes: `Exercise.isAssessment` from Task 1.

- [ ] **Step 1: Add the filter to `getAllExercises`**

In `lib/services/admin.service.ts`, update the `getAllExercises` params and `where` (around line 238-255):

```ts
export async function getAllExercises(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  bodyRegions?: string[];
  isAssessment?: boolean;
}) {
  const { page = 1, pageSize = 25, search, bodyRegions, isAssessment = false } = params;

  const where = {
    isActive: { not: false },
    isAssessment,
    ...(bodyRegions?.length && { bodyRegion: { hasSome: bodyRegions as BodyRegion[] } }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };
```

- [ ] **Step 2: Read the `kind` param and pass it through in the admin page**

In `app/admin/exercises/page.tsx`, update `PageProps` (around line 8-10) to add `kind?: string;`, and after computing `page` (around line 16), add:

```tsx
  const activeKind = params.kind === "assessment" ? "assessment" : "training";
```

Update the `getAllExercises` call (around line 18):

```tsx
  const { items: exercises, total, totalPages } = await getAllExercises({
    page,
    pageSize: 25,
    search,
    bodyRegions,
    isAssessment: activeKind === "assessment",
  });
```

- [ ] **Step 3: Render kind tab links**

Add imports for `Link` and `cn` if not already present (`Link` is already imported at line 6; add `import { cn } from "@/lib/utils";`), and insert a tab bar right after the header block, before `<AdminExerciseFilters .../>` (around line 48-49):

```tsx
      <div className="flex gap-1 border-b">
        {(["training", "assessment"] as const).map((k) => {
          const sp = new URLSearchParams();
          if (search) sp.set("search", search);
          if (bodyRegions.length) sp.set("bodyRegion", bodyRegions.join(","));
          if (k === "assessment") sp.set("kind", "assessment");
          const href = sp.toString() ? `/admin/exercises?${sp.toString()}` : "/admin/exercises";
          return (
            <Link
              key={k}
              href={href}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeKind === k
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {k === "training" ? "Training" : "Assessment"}
            </Link>
          );
        })}
      </div>

      <AdminExerciseFilters search={search} selected={bodyRegions} />
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, navigate to `/admin/exercises`, confirm the default "Training" tab shows only non-assessment exercises and switching to "Assessment" shows only ones flagged as such, while search/body-region filters keep working.

- [ ] **Step 5: Commit**

```bash
git add lib/services/admin.service.ts app/admin/exercises/page.tsx
git commit -m "feat: add training/assessment filter tab to admin exercise library page"
```

---

## Final verification

- [ ] Run the full test suite: `npm test` — expect all tests pass, including every new one added in Tasks 2, 3, 5, 7, and 11.
- [ ] Run `npx tsc --noEmit` — expect no type errors.
- [ ] Manually create one assessment exercise (Task 9 or 11) and confirm it never appears in an AI-generated program (run a program generation) and never appears in the manual add-exercise picker (`exercise-picker-dialog.tsx`) or the in-program workout editor's add-exercise list, but does appear under the "Assessment" tab on both `/exercises` and `/admin/exercises`.
