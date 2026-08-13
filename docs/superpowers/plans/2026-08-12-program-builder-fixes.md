# Program Builder Fixes & Run Activity Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the exercise-creation flow inside the Program Builder (it currently kicks the coach out of the program on submit), make Duration prescribable in minutes, stop fake "Video" badges on exercises with no real video, add YouTube search-by-name to exercise creation, move Performance/Rehab categorization from the exercise to the program level, and add a "Run" / "Interval Run" activity type with running-specific fields.

**Architecture:** This is a MongoDB + Prisma + Next.js Server Actions app (no REST CRUD routes — everything goes through `actions/*.ts`). The Program Builder (`components/programs/program-builder.tsx`) is a client-side tree (`workouts[].blocks[].exercises[].sets[]`) edited in memory and bulk-saved via `lib/services/program.service.ts`. The "Create New Exercise" modal is not a separate page — it's a view inside `ExercisePickerDialog` (`components/programs/exercise-picker-dialog.tsx`), a Radix `Dialog` rendered as a React Portal but still inside the outer `<form>` in `components/programs/program-editor.tsx`. That nesting is the root cause of task 1's bug (see Task 1).

**Tech Stack:** Next.js App Router, React (client components), react-hook-form + zod, Prisma (MongoDB connector, no formal migrations — schema changes are applied with `npx prisma db push`), Vitest (`environment: 'node'`, no jsdom/RTL — component-level UI changes are verified manually in the browser, not with automated component tests; server-side logic (actions/services/validators) gets Vitest unit tests following the existing `actions/__tests__/*.test.ts` mocking convention).

## Global Constraints

- Never require a coach to re-open the program or re-click "Add Exercise" after any action inside the Create Exercise modal — every task in Phase 1/2 must leave the program builder mounted and the coach back at the block they were editing.
- Prisma is MongoDB — schema field additions must be optional (`Field?`) or carry a `@default(...)`; there is no migration file to backfill existing documents, so any new required-looking field must degrade gracefully when absent on old rows.
- This repo's Vitest config (`vitest.config.ts`) runs in `environment: 'node'` with no DOM library — do not write component-render tests (`@testing-library/react` is not installed). UI-only tasks are verified by running `npm run dev` and exercising the flow in a browser; server-side tasks (actions, services, validators) get real Vitest tests mirroring `actions/__tests__/exercise-actions-audit.test.ts`'s mocking style.
- After any Prisma schema change, run `npx prisma generate` (regenerates the client types) and `npx prisma db push` (applies to the dev database) before touching dependent code, and run `npx tsc --noEmit` after each task to catch any consumer that assumed a field was non-nullable.
- Do not touch anything under `.claude/worktrees/` — those are other in-progress, uncommitted work sessions, not part of this plan.
- Never `git add`/`git commit` — the user reviews and commits changes themselves. Steps below say "stage for review" instead of "commit."

---

## Phase 1 — Priority 1: Fix "Add Exercise Manually" closing the whole program

### Task 1: Stop the nested Create-Exercise form submit from bubbling into the program-save form

**Root cause:** `components/programs/program-editor.tsx:250` wraps the entire page in `<form onSubmit={form.handleSubmit(onSubmit)}>`, which renders `<ProgramBuilder>` (`program-editor.tsx:437`), which renders `<ExercisePickerDialog>` (`program-builder.tsx:835-842`). `ExercisePickerDialog`'s "Create New Exercise" view has its own `<form onSubmit={handleCreate}>` (`exercise-picker-dialog.tsx:586` for the AI tab, `:652` for the Manual tab). Radix `Dialog` renders via a React Portal, so the form's DOM node lives outside the outer `<form>` — but React's synthetic event system bubbles through the **component tree**, not the DOM tree, so submitting the inner form still fires the outer `ProgramEditor`'s `onSubmit`, which calls `router.push(...)` (`program-editor.tsx:219/230/238`) and navigates the coach away — exactly the "closes the entire program" symptom. This fires regardless of whether the inner form's own validation passes, because `handleCreate`'s `e.preventDefault()` (`exercise-picker-dialog.tsx:508`) blocks the browser's default submit but not React event propagation.

**Files:**
- Modify: `components/programs/exercise-picker-dialog.tsx:507-513`

**Interfaces:**
- No signature changes — this is a one-line fix inside an existing function.

- [ ] **Step 1: Add `stopPropagation` to the inner form's submit handler**

```tsx
// components/programs/exercise-picker-dialog.tsx:507-513
async function handleCreate(e: React.FormEvent) {
  e.preventDefault();
  e.stopPropagation();
  const form = createTab === "ai" ? aiForm : manualForm;
  if (!form.name || form.bodyRegion.length === 0 || !form.difficultyLevel) {
    toast.error("Name, body region, and difficulty are required");
    return;
  }
```

(The `bodyRegion`/`difficultyLevel` check on this line is removed in Task 3 — leave it as-is for this task so the diff stays isolated to the bubbling fix.)

- [ ] **Step 2: Manually verify in the browser**

Run `npm run dev`, open an existing program's Edit page, click **Add Exercise → Create New → Manual**, fill in Name/Body Region/Difficulty, paste any URL (or leave blank), click **Create & Add to Program**. Confirm:
- The toast "Exercise created and added" appears.
- The dialog closes back to the block you were editing (not to `/programs`).
- The new exercise is now in that block's exercise list.
- The browser URL is still `/programs/[id]/edit` — no navigation happened.

Repeat with the **AI Generate** tab (after clicking "Generate with AI" and letting `aiStatus` reach `"done"` so the fields render).

- [ ] **Step 3: Stage for review**

```bash
git add components/programs/exercise-picker-dialog.tsx
git status
```
(Do not commit — leave staged for the user to review and commit.)

---

## Phase 2 — Priority 2: Make Body Region / Difficulty Level optional

### Task 2: Make `difficultyLevel` nullable end-to-end (schema, service, action)

**Files:**
- Modify: `prisma/schema.prisma:214` (`Exercise.difficultyLevel`)
- Modify: `lib/services/exercise.service.ts:115-163` (`createExercise`)
- Modify: `actions/exercise-actions.ts:309-349` (`createOrganizationExerciseAction`)

**Interfaces:**
- Produces: `Exercise.difficultyLevel` is now `DifficultyLevel | null` everywhere it's read from Prisma. `createOrganizationExerciseAction`'s input field `difficultyLevel` becomes `string | undefined`.

- [ ] **Step 1: Relax the Prisma field**

```prisma
// prisma/schema.prisma:214
  difficultyLevel    DifficultyLevel?
```

- [ ] **Step 2: Apply the schema change**

```bash
npx prisma generate
npx prisma db push
```
Expected: Prisma confirms the field is now optional; no data loss warning (widening nullability never drops data on Mongo).

- [ ] **Step 3: Make `bodyRegion` and `difficultyLevel` optional in `createExercise`'s input type and stop requiring them at the Prisma-write call**

```ts
// lib/services/exercise.service.ts:115-132
export async function createExercise(data: {
  name: string;
  description?: string;
  bodyRegion?: BodyRegion[];
  equipmentRequired: string[];
  difficultyLevel?: DifficultyLevel;
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

```ts
// lib/services/exercise.service.ts:143-162 — inside prisma.exercise.create({ data: { ... } })
      bodyRegion: data.bodyRegion ?? [],
      equipmentRequired: data.equipmentRequired,
      difficultyLevel: data.difficultyLevel ?? null,
```
(Leave the rest of the `data:` object as-is — only these two lines change from the current `data.bodyRegion,` / `data.difficultyLevel,`.)

- [ ] **Step 4: Widen `createOrganizationExerciseAction`'s input type**

```ts
// actions/exercise-actions.ts:309-317
export async function createOrganizationExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion?: string[];
  difficultyLevel?: string;
  videoUrl?: string;
  isPublic: boolean;
  exercisePhases?: string[];
}) {
```

```ts
// actions/exercise-actions.ts:328-341 — inside exerciseService.createExercise({ ... })
      bodyRegion: (input.bodyRegion ?? []) as BodyRegion[],
      difficultyLevel: input.difficultyLevel
        ? (input.difficultyLevel as DifficultyLevel)
        : undefined,
```
(Replace the current `bodyRegion: input.bodyRegion as BodyRegion[],` and `difficultyLevel: input.difficultyLevel as DifficultyLevel,` lines with these two.)

- [ ] **Step 5: Write a Vitest test for the optional-fields path**

Create `lib/services/__tests__/exercise-service-optional-fields.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { exercise: { create: vi.fn() } },
}))
vi.mock('@/lib/utils/video', () => ({
  buildYouTubeSearchUrl: vi.fn(() => 'https://www.youtube.com/results?search_query=x'),
  extractYouTubeId: vi.fn(() => null),
  getYouTubeThumbnail: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { createExercise } from '../exercise.service'

const mockCreate = vi.mocked(prisma.exercise.create)

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({ id: 'ex_1' } as never)
})

it('creates an exercise with no bodyRegion or difficultyLevel', async () => {
  await createExercise({
    name: 'Brisk Walk',
    equipmentRequired: [],
    contraindications: [],
    createdById: 'trainer_1',
  })

  const call = mockCreate.mock.calls[0][0]
  expect(call.data.bodyRegion).toEqual([])
  expect(call.data.difficultyLevel).toBeNull()
})
```

- [ ] **Step 6: Run the test**

```bash
npx vitest run lib/services/__tests__/exercise-service-optional-fields.test.ts
```
Expected: PASS.

- [ ] **Step 7: Stage for review**

```bash
git add prisma/schema.prisma lib/services/exercise.service.ts actions/exercise-actions.ts lib/services/__tests__/exercise-service-optional-fields.test.ts
git status
```

### Task 3: Stop blocking submit when Body Region / Difficulty are blank, in the Create Exercise modal

**Files:**
- Modify: `components/programs/exercise-picker-dialog.tsx:279-336` (`CreateExerciseFields`), `:507-548` (`handleCreate`)

**Interfaces:**
- Consumes: `emptyFormShape()` (unchanged shape, `difficultyLevel: ""` already means "unset" — no type change needed, an empty string is simply allowed through now).

- [ ] **Step 1: Remove the required-field labels**

```tsx
// exercise-picker-dialog.tsx:300 and :327
        <Label className="text-xs font-semibold">Body Region</Label>
```
```tsx
        <Label className="text-xs font-semibold">Difficulty</Label>
```
(Drop the trailing ` *` from both labels — `Name *` at line 289 stays required since Name is the only field that must be filled.)

- [ ] **Step 2: Add a "Not set" option to the Difficulty select so it can be explicitly cleared**

```tsx
// exercise-picker-dialog.tsx:328-335
        <Select
          value={form.difficultyLevel || "UNSET"}
          onValueChange={(v) => setForm((f) => ({ ...f, difficultyLevel: v === "UNSET" ? "" : v }))}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="UNSET">Not set</SelectItem>
            <SelectItem value="BEGINNER">Beginner</SelectItem>
            <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
            <SelectItem value="ADVANCED">Advanced</SelectItem>
          </SelectContent>
        </Select>
```
(Radix `Select` doesn't allow an empty-string `SelectItem` value, hence the `"UNSET"` sentinel translated back to `""` in `onValueChange`.)

- [ ] **Step 3: Relax `handleCreate`'s validation to only require Name**

```ts
// exercise-picker-dialog.tsx:507-513
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const form = createTab === "ai" ? aiForm : manualForm;
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
```

- [ ] **Step 4: Pass blank fields through as `undefined` in the create payload**

```ts
// exercise-picker-dialog.tsx:516-524
      const result = await createOrganizationExerciseAction({
        name: form.name,
        description: form.description || undefined,
        bodyRegion: form.bodyRegion.length ? form.bodyRegion : undefined,
        difficultyLevel: form.difficultyLevel || undefined,
        exercisePhases: form.exercisePhases,
        videoUrl: form.videoUrl || undefined,
        isPublic: form.isPublic,
      });
```

- [ ] **Step 5: Manually verify in the browser**

Run `npm run dev`, open **Add Exercise → Create New → Manual**, fill in only the Name field (leave Body Region unselected and Difficulty as "Not set"), click **Create & Add to Program**. Confirm the exercise saves, is added to the current block, and the dialog returns to the program builder (per Task 1's fix) — no toast error, no navigation away.

- [ ] **Step 6: Stage for review**

```bash
git add components/programs/exercise-picker-dialog.tsx
git status
```

### Task 4: Null-guard difficulty/body-region display and re-typecheck the whole app

**Files:**
- Modify: `lib/utils/formatting.ts:23-30` (`formatDifficulty`)
- Modify: `components/exercises/exercise-card.tsx` (difficulty badge)
- Modify: `components/exercises/exercise-detail.tsx:40-41` (difficulty badge)
- Modify: `components/programs/exercise-picker-dialog.tsx:203-208` (list-row difficulty badge)
- Modify: `components/admin/exercises-table.tsx:190` (admin table difficulty column)

**Interfaces:**
- Produces: `formatDifficulty(level: string | null | undefined): string` — returns `"Not set"` for `null`/`undefined`/`""`.

- [ ] **Step 1: Widen `formatDifficulty` to accept nullish input**

```ts
// lib/utils/formatting.ts:23-30
export function formatDifficulty(level: string | null | undefined): string {
  if (!level) return "Not set";
  const map: Record<string, string> = {
    BEGINNER: "Beginner",
    INTERMEDIATE: "Intermediate",
    ADVANCED: "Advanced",
  };
  return map[level] || level;
}
```

- [ ] **Step 2: Hide (not just relabel) the difficulty badge when null, at each of the three render sites**

In `exercise-card.tsx`, find the block using `difficultyConfig[difficultyLevel]` (around line 72-73) and wrap the badge's render in a truthiness check on `difficultyLevel`, e.g.:
```tsx
{difficultyLevel && (
  <Badge className={difficulty.color}>{difficulty.label}</Badge>
)}
```
Apply the same pattern in `exercise-detail.tsx:40-41` (wrap the existing `<Badge className={difficultyColors[exercise.difficultyLevel] ?? ""}>` block in `{exercise.difficultyLevel && (...)}`) and `exercise-picker-dialog.tsx:203-208` (wrap the `<Badge variant="outline" className={cn(...)}>{ex.difficultyLevel}</Badge>` in `{ex.difficultyLevel && (...)}`).

In `admin/exercises-table.tsx:190`, replace:
```tsx
<span className="text-xs text-muted-foreground">{diffLabel[ex.difficultyLevel] ?? ex.difficultyLevel}</span>
```
with:
```tsx
<span className="text-xs text-muted-foreground">{ex.difficultyLevel ? (diffLabel[ex.difficultyLevel] ?? ex.difficultyLevel) : "—"}</span>
```

- [ ] **Step 3: Full typecheck sweep**

```bash
npx tsc --noEmit
```
Expected: any remaining spot that destructures `Exercise.difficultyLevel` as a bare `string` (not `string | null`) will now surface as a type error pointing at the exact file/line. Fix each by widening the local interface's `difficultyLevel: string` to `difficultyLevel: string | null` and applying the same "render nothing when falsy" pattern from Step 2. Do not guess at file names ahead of time — let the compiler enumerate them.

- [ ] **Step 4: Manually verify in the browser**

Create an exercise with no difficulty via the modal (per Task 3), then check: it appears correctly (no badge, no "null" text) on `/exercises` (library grid), on the exercise's detail page, and in the exercise picker's list view.

- [ ] **Step 5: Stage for review**

```bash
git add -A
git status
```
(Review the full diff before handing off — Step 3's typecheck-driven fixes touch files not listed above by name.)

---

## Phase 3 — Priority 3: Duration in seconds or minutes

### Task 5: Add `targetDurationUnit` to the `ExerciseSet` schema and validator

**Files:**
- Modify: `prisma/schema.prisma:495-509` (`ExerciseSet`)
- Modify: `lib/validators/program.ts:4-14` (`exerciseSetSchema`)

**Interfaces:**
- Produces: `ExerciseSetInput.targetDurationUnit?: "SEC" | "MIN" | null` — absent/null means `"SEC"` (backward compatible with every existing set).

- [ ] **Step 1: Add the field to the Prisma model**

```prisma
// prisma/schema.prisma:495-509
model ExerciseSet {
  id                  String          @id @default(auto()) @map("_id") @db.ObjectId
  blockExerciseId     String          @db.ObjectId
  blockExercise       BlockExerciseV2 @relation(fields: [blockExerciseId], references: [id], onDelete: Cascade)
  orderIndex          Int
  setType             String          @default("NORMAL")
  targetReps          Int?
  targetWeight        Float?
  targetDuration      Int?
  targetDurationUnit  String?
  targetDistance      Float?
  targetRPE           Int?
  targetPercentage1RM Float?
  tempo               String?
  restAfter           Int?
}
```

- [ ] **Step 2: Apply the schema change**

```bash
npx prisma generate
npx prisma db push
```

- [ ] **Step 3: Add the field to the zod schema**

```ts
// lib/validators/program.ts:4-14
export const exerciseSetSchema = z.object({
  id: z.string().optional(),
  orderIndex: z.number().int().min(0),
  setType: z.enum(["NORMAL", "WARMUP", "DROP_SET", "FAILURE"]).default("NORMAL"),
  targetReps: z.number().int().positive().optional().nullable(),
  targetWeight: z.number().positive().optional().nullable(),
  targetDuration: z.number().int().positive().optional().nullable(),
  targetDurationUnit: z.enum(["SEC", "MIN"]).optional().nullable(),
  targetDistance: z.number().positive().optional().nullable(),
  targetRPE: z.number().int().min(1).max(10).optional().nullable(),
  restAfter: z.number().int().min(0).optional().nullable(),
});
```

- [ ] **Step 4: Thread the field through the bulk-create/update mapping in `program.service.ts`**

```ts
// lib/services/program.service.ts:125-137 — inside the setRows.push({ ... }) loop
        for (const s of e.sets) {
          setRows.push({
            id: newObjectId(),
            blockExerciseId,
            orderIndex: s.orderIndex,
            setType: s.setType,
            targetReps: s.targetReps,
            targetWeight: s.targetWeight,
            targetDuration: s.targetDuration,
            targetDurationUnit: s.targetDurationUnit,
            targetDistance: s.targetDistance,
            targetRPE: s.targetRPE,
            restAfter: s.restAfter,
          });
        }
```

Find the equivalent nested-`create` mapping inside `updateProgram` (`lib/services/program.service.ts:192-`, the `workouts: { create: workouts.map(...) }` tree) and add `targetDurationUnit: s.targetDurationUnit` next to the existing `targetDuration: s.targetDuration` line at the sets level.

- [ ] **Step 5: Write a Vitest test for the mapping**

Create `lib/services/__tests__/program-service-duration-unit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    program: { create: vi.fn(), findUnique: vi.fn() },
    workout: { createMany: vi.fn() },
    workoutBlockV2: { createMany: vi.fn() },
    blockExerciseV2: { createMany: vi.fn() },
    exerciseSet: { createMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { createProgram } from '../program.service'

const mockCreate = vi.mocked(prisma.program.create)
const mockSetCreateMany = vi.mocked(prisma.exerciseSet.createMany)
const mockFindUnique = vi.mocked(prisma.program.findUnique)

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({ id: 'prog_1' } as never)
  mockFindUnique.mockResolvedValue({ id: 'prog_1' } as never)
})

it('persists targetDurationUnit on each set', async () => {
  await createProgram('trainer_1', {
    name: 'Walk Program',
    isTemplate: false,
    tags: [],
    equipmentRequired: [],
    organizationIds: [],
    workouts: [{
      name: 'Day 1', dayIndex: 0, weekIndex: 0, orderIndex: 0,
      blocks: [{
        type: 'NORMAL', orderIndex: 0, rounds: 1,
        exercises: [{
          exerciseId: 'ex_1', orderIndex: 0,
          sets: [{ orderIndex: 0, setType: 'NORMAL', targetDuration: 5, targetDurationUnit: 'MIN' }],
        }],
      }],
    }],
  } as never)

  const rows = mockSetCreateMany.mock.calls[0][0].data as { targetDurationUnit?: string }[]
  expect(rows[0].targetDurationUnit).toBe('MIN')
})
```

- [ ] **Step 6: Run the test**

```bash
npx vitest run lib/services/__tests__/program-service-duration-unit.test.ts
```
Expected: PASS.

- [ ] **Step 7: Stage for review**

```bash
git add prisma/schema.prisma lib/validators/program.ts lib/services/program.service.ts lib/services/__tests__/program-service-duration-unit.test.ts
git status
```

### Task 6: Add a value + unit Duration control to the Program Builder's `SetEditor`

**Files:**
- Modify: `components/programs/set-editor.tsx`

**Interfaces:**
- Consumes: `ExerciseSetInput.targetDurationUnit` from Task 5.

- [ ] **Step 1: Default new sets to `SEC` and replace the single Duration input with a value+unit pair**

```tsx
// components/programs/set-editor.tsx:21-36 — addSet()
  function addSet() {
    const last = sets[sets.length - 1];
    onChange([
      ...sets,
      {
        orderIndex: sets.length,
        setType: last?.setType || "NORMAL",
        targetReps: last?.targetReps || 10,
        targetWeight: last?.targetWeight || null,
        targetDuration: last?.targetDuration || null,
        targetDurationUnit: last?.targetDurationUnit || "SEC",
        targetDistance: last?.targetDistance || null,
        targetRPE: last?.targetRPE || null,
        restAfter: last?.restAfter || null,
      },
    ]);
  }
```

```tsx
// components/programs/set-editor.tsx:54-61 — header row, widen the Duration column
      <div className="grid grid-cols-[100px_minmax(70px,1fr)_minmax(70px,1fr)_minmax(110px,1.4fr)_minmax(60px,1fr)_40px] gap-2 text-xs text-muted-foreground font-medium px-1">
        <span>Type</span>
        <span>Reps</span>
        <span>Weight</span>
        <span>Duration</span>
        <span>RPE</span>
        <span></span>
      </div>
```
(Update the matching `grid-cols-[...]` string on the per-row `<div>` at line 65 identically, so header and rows stay aligned.)

```tsx
// components/programs/set-editor.tsx:110-123 — replace the single Duration <Input> with:
          <div className="flex gap-1">
            <Input
              type="number"
              value={set.targetDuration ?? ""}
              onChange={(e) =>
                updateSet(
                  si,
                  "targetDuration",
                  e.target.value ? parseInt(e.target.value) : null
                )
              }
              className="h-8 text-xs w-full"
              placeholder="Duration"
              min={0}
            />
            <Select
              value={set.targetDurationUnit || "SEC"}
              onValueChange={(v) => updateSet(si, "targetDurationUnit", v)}
            >
              <SelectTrigger className="h-8 text-xs w-16 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SEC">sec</SelectItem>
                <SelectItem value="MIN">min</SelectItem>
              </SelectContent>
            </Select>
          </div>
```

- [ ] **Step 2: Manually verify in the browser**

Add "5 min brisk walk or bike" as a warmup exercise, set Duration to `5` with unit `min`, save the program, reopen it, and confirm it redisplays as `5` / `min` (not converted to `300` / `sec`).

- [ ] **Step 3: Stage for review**

```bash
git add components/programs/set-editor.tsx
git status
```

### Task 7: Thread `targetDurationUnit` through the Calendar workout editor's per-set update path

The bulk program-tree save (Task 5/6) and the granular calendar/session editor are two independent code paths (confirmed: `calendar-workout-actions.ts`'s `updateSet`/`addSetToExercise` don't share code with `program.service.ts`). Both need the new field or duration edited from the calendar view will silently drop the unit.

**Files:**
- Modify: `actions/calendar-workout-actions.ts:239-286` (`updateSet`), `:292-350` (`addSetToExercise`)
- Modify: `components/calendar/workout-editor-panel.tsx` (duration input around line 489, and the `updateSet`-payload type around line 765)

**Interfaces:**
- Produces: `updateSet(setId, { ...existing fields, targetDurationUnit?: string | null })`.

- [ ] **Step 1: Accept the field in `updateSet`**

```ts
// actions/calendar-workout-actions.ts:239-249
export async function updateSet(
  setId: string,
  data: {
    targetReps?: number | null;
    targetPercentage1RM?: number | null;
    tempo?: string | null;
    targetWeight?: number | null;
    targetDuration?: number | null;
    targetDurationUnit?: string | null;
    targetRPE?: number | null;
    restAfter?: number | null;
  }
): Promise<ActionResult<{ id: string }>> {
```
(The function body at lines 276-278 already does `prisma.exerciseSet.update({ where: { id: setId }, data })` — passing `data` straight through means no further change is needed there; the wider type is the whole fix.)

- [ ] **Step 2: Return the field from `addSetToExercise`**

```ts
// actions/calendar-workout-actions.ts:292-304
export async function addSetToExercise(
  blockExerciseId: string,
  orderIndex: number
): Promise<ActionResult<{
  id: string;
  orderIndex: number;
  setType: string;
  targetReps: number | null;
  targetWeight: number | null;
  targetDuration: number | null;
  targetDurationUnit: string | null;
  targetRPE: number | null;
  restAfter: number | null;
}>> {
```
```ts
// actions/calendar-workout-actions.ts:333-345 — add one line to the returned data object
      data: {
        id: newSet.id,
        orderIndex: newSet.orderIndex,
        setType: newSet.setType,
        targetReps: newSet.targetReps,
        targetWeight: newSet.targetWeight,
        targetDuration: newSet.targetDuration,
        targetDurationUnit: newSet.targetDurationUnit,
        targetRPE: newSet.targetRPE,
        restAfter: newSet.restAfter,
      },
```

- [ ] **Step 3: Add the unit selector next to `workout-editor-panel.tsx`'s duration input**

Find the `targetDuration` input around `components/calendar/workout-editor-panel.tsx:489` and apply the same value+unit `<div className="flex gap-1">` pattern from Task 6 Step 1, calling `debouncedUpdateSet(set.id, { targetDurationUnit: v })` on change (mirror however the existing `targetDuration` field already calls the debounced updater at that call site — do not introduce a new update mechanism). Widen the local `data: { ... }` payload type at `workout-editor-panel.tsx:765` to include `targetDurationUnit?: string | null`, matching Step 1's `updateSet` signature.

- [ ] **Step 4: Manually verify in the browser**

Open a program from the Calendar view (not the Program Builder), edit an exercise's duration to `5` `min`, confirm it saves (check the network tab / no error toast) and reloading the calendar view still shows `5 min`.

- [ ] **Step 5: Stage for review**

```bash
git add actions/calendar-workout-actions.ts components/calendar/workout-editor-panel.tsx
git status
```

### Task 8: Format duration with its unit in display and PDF-export surfaces

**Files:**
- Modify: `components/programs/program-detail-view.tsx:100-130` (`summarizeSets`)
- Modify: `lib/pdf/program-document.tsx:33` (set summary line)

**Interfaces:**
- No new exports — both are internal formatting tweaks reading the same `targetDurationUnit` field.

- [ ] **Step 1: Format duration by unit in `program-detail-view.tsx`**

```ts
// components/programs/program-detail-view.tsx:116 — replace this line:
    const dur = (base.targetDuration as number) ? ` ${base.targetDuration as number}s` : "";
// with:
    const dur = (base.targetDuration as number)
      ? ` ${base.targetDuration as number}${(base.targetDurationUnit as string) === "MIN" ? "min" : "s"}`
      : "";
```
Apply the identical change to the second occurrence at line 126 (the per-set fallback branch).

- [ ] **Step 2: Same fix in the PDF exporter**

```ts
// lib/pdf/program-document.tsx:33 — replace:
  const dur = first.targetDuration ? ` ${first.targetDuration}s` : ''
// with:
  const dur = first.targetDuration
    ? ` ${first.targetDuration}${first.targetDurationUnit === 'MIN' ? 'min' : 's'}`
    : ''
```

- [ ] **Step 3: Manually verify**

Open a program's detail view with a `5 min` set (created in Task 6) — confirm the summary line reads `5min` not `5s`. Export the program to PDF (whatever UI action triggers `program-document.tsx`) and confirm the same in the exported file.

- [ ] **Step 4: Stage for review**

```bash
git add components/programs/program-detail-view.tsx lib/pdf/program-document.tsx
git status
```

---

## Phase 4 — Priority 4: Only show "Video" when a real video exists

### Task 9: Stop auto-generating a fake YouTube-search URL as `videoUrl`, and add a `hasRealVideoUrl` helper

**Root cause:** `lib/services/exercise.service.ts:133` sets `videoUrl = data.videoUrl?.trim() || buildYouTubeSearchUrl(data.name)` — every exercise created without a real video URL still gets a non-empty `videoUrl` pointing at a YouTube **search-results** page (`buildYouTubeSearchUrl`, `lib/utils/video.ts:53-58`), which makes every `{exercise.videoUrl && <Badge>Video</Badge>}` check across the app (6 render sites) render the badge even though there's no real video.

**Files:**
- Modify: `lib/utils/video.ts` (add `hasRealVideoUrl`)
- Modify: `lib/services/exercise.service.ts:115-163` (`createExercise`), `:237-` (`updateExercise`)

**Interfaces:**
- Produces: `hasRealVideoUrl(url: string | null | undefined): boolean` — true only if the URL resolves to an actual playable video (has a YouTube video ID, or is a non-YouTube URL that isn't the search-results shape).

- [ ] **Step 1: Add the helper**

```ts
// lib/utils/video.ts — append at the end of the file
export function hasRealVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (isYouTubeUrl(url)) return extractYouTubeId(url) !== null;
  return true; // non-YouTube URL (e.g. Vimeo) — assume real, no ID-extraction available
}
```

This is deliberately the single source of truth for "does this exercise have a real video," and it correctly returns `false` for both new AND pre-existing exercises that got the search-URL fallback from the old `createExercise` code — no data backfill is required, because `buildYouTubeSearchUrl`'s output (`https://www.youtube.com/results?search_query=...`) has no `v=`, `/embed/`, or `/shorts/` segment, so `extractYouTubeId` already returns `null` for it.

- [ ] **Step 2: Stop writing the fallback URL on create**

```ts
// lib/services/exercise.service.ts:133 — replace:
  const videoUrl = data.videoUrl?.trim() || buildYouTubeSearchUrl(data.name);
// with:
  const videoUrl = data.videoUrl?.trim() || undefined;
```
Remove the now-unused `buildYouTubeSearchUrl` import from this file if it has no other call site (check with `grep -n buildYouTubeSearchUrl lib/services/exercise.service.ts`).

- [ ] **Step 3: Stop writing the fallback URL on update**

Find the equivalent block in `updateExercise` (around lines 263-265, `if (!nextData.videoUrl && ... ) { nextData.videoUrl = buildYouTubeSearchUrl(...) }`) and delete that whole `if` block — an update with a blank `videoUrl` should simply leave it blank, not synthesize a search link.

- [ ] **Step 4: Write a Vitest test**

Create `lib/utils/__tests__/video.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hasRealVideoUrl, buildYouTubeSearchUrl } from '../video'

it('returns false for a YouTube search-results URL', () => {
  expect(hasRealVideoUrl(buildYouTubeSearchUrl('brisk walk'))).toBe(false)
})

it('returns true for a real YouTube watch URL', () => {
  expect(hasRealVideoUrl('https://www.youtube.com/watch?v=abc123')).toBe(true)
})

it('returns false for null/empty', () => {
  expect(hasRealVideoUrl(null)).toBe(false)
  expect(hasRealVideoUrl('')).toBe(false)
})
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run lib/utils/__tests__/video.test.ts
```
Expected: PASS.

- [ ] **Step 6: Stage for review**

```bash
git add lib/utils/video.ts lib/services/exercise.service.ts lib/utils/__tests__/video.test.ts
git status
```

### Task 10: Replace every raw `videoUrl &&` truthiness check with `hasRealVideoUrl(...)`

**Files:**
- Modify: `components/programs/program-builder.tsx:734-755`
- Modify: `components/programs/exercise-picker-dialog.tsx:172`
- Modify: `components/calendar/workout-editor-panel.tsx:373, 430, 854, 1111`
- Modify: `components/programs/program-schedule-view.tsx:854, 1111`
- Modify: `components/exercises/exercise-card.tsx:140`

**Interfaces:**
- Consumes: `hasRealVideoUrl` from Task 9.

- [ ] **Step 1: Fix the Program Builder video badge**

```tsx
// components/programs/program-builder.tsx:734-755
                                          {(() => {
                                            const lib = exerciseLibrary.find(
                                              (e) => e.id === ex.exerciseId
                                            );
                                            return lib?.videoUrl && hasRealVideoUrl(lib.videoUrl) ? (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setVideoPreview({
                                                    url: lib.videoUrl!,
                                                    provider: lib.videoProvider,
                                                    name: lib.name,
                                                  });
                                                }}
                                                className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-sm font-medium shrink-0 hover:bg-blue-100"
                                              >
                                                <Play className="h-2.5 w-2.5" />
                                                Video
                                              </button>
                                            ) : null;
                                          })()}
```
Add `import { hasRealVideoUrl } from "@/lib/utils/video";` to this file's import block.

- [ ] **Step 2: Fix the remaining 5 files identically**

In each file below, add the `hasRealVideoUrl` import and change the condition from `exercise.videoUrl && (...)` (or whatever the local variable is named — `lib.videoUrl`, `be.exercise.videoUrl`, `videoUrl`) to `hasRealVideoUrl(exercise.videoUrl) && (...)`, keeping everything else in the JSX identical:

| File | Line(s) | Variable used in the condition |
|---|---|---|
| `components/programs/exercise-picker-dialog.tsx` | 172 | `ex.videoUrl` |
| `components/calendar/workout-editor-panel.tsx` | 373, 430, 854, 1111 | `exercise.exercise.videoUrl` / `be.exercise.videoUrl` (check each site's exact local name) |
| `components/programs/program-schedule-view.tsx` | 854, 1111 | same shapes as workout-editor-panel |
| `components/exercises/exercise-card.tsx` | 140 | `videoUrl` (destructured prop) |

- [ ] **Step 3: Manually verify in the browser**

Find (or create) an exercise that only ever went through the old fallback path (any exercise created before this fix, or check via `/admin/exercises` for one with a `youtube.com/results?search_query=` URL) — confirm the "Video" badge no longer renders for it anywhere (program builder, exercise picker, calendar editor, exercise card, program schedule view). Then confirm a real-video exercise (e.g. one with an actual `watch?v=` URL) still shows its badge and still opens the video preview.

- [ ] **Step 4: Stage for review**

```bash
git add components/programs/program-builder.tsx components/programs/exercise-picker-dialog.tsx components/calendar/workout-editor-panel.tsx components/programs/program-schedule-view.tsx components/exercises/exercise-card.tsx
git status
```

---

## Phase 5 — Priority 5: YouTube search-by-name when creating an exercise

### Task 11: Build a single-select `YouTubeVideoSearch` component

The existing `/api/youtube/search-videos?q=` route (`app/api/youtube/search-videos/route.ts`) and its consumer (`components/exercises/bulk-import-form.tsx:361-424`) are multi-select and entangled with bulk-import row state — reuse the route, but write a small fresh single-select component rather than refactoring that flow.

**Files:**
- Create: `components/exercises/youtube-video-search.tsx`

**Interfaces:**
- Produces: `<YouTubeVideoSearch onSelect={(video: { videoId: string; title: string; thumbnailUrl: string; videoUrl: string }) => void} />`

- [ ] **Step 1: Write the component**

```tsx
// components/exercises/youtube-video-search.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { toast } from "sonner";

interface Video {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  videoUrl: string;
}

interface Props {
  onSelect: (video: Video) => void;
}

export function YouTubeVideoSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);

  async function runSearch() {
    if (!query.trim()) {
      toast.error("Enter an exercise name");
      return;
    }
    setLoading(true);
    setVideos([]);
    try {
      const res = await fetch(`/api/youtube/search-videos?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Search failed");
        return;
      }
      setVideos(json.videos);
      if (json.total === 0) toast.info("No videos found — try different search terms");
    } catch {
      toast.error("Search failed — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Single Leg RDL"
          className="h-8 text-sm flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch();
            }
          }}
        />
        <Button type="button" size="sm" className="h-8 text-xs shrink-0" disabled={loading} onClick={runSearch}>
          <Search className="h-3.5 w-3.5 mr-1" />
          {loading ? "Searching..." : "Search"}
        </Button>
      </div>
      {videos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
          {videos.map((v) => (
            <button
              key={v.videoId}
              type="button"
              onClick={() => onSelect(v)}
              className="flex flex-col text-left border rounded-md overflow-hidden hover:border-primary transition-colors"
            >
              {v.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnailUrl} alt={v.title} className="w-full aspect-video object-cover" />
              )}
              <span className="text-[11px] font-medium px-1.5 py-1 line-clamp-2">{v.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Stage for review**

```bash
git add components/exercises/youtube-video-search.tsx
git status
```

### Task 12: Wire `YouTubeVideoSearch` into the Create Exercise modal

**Files:**
- Modify: `components/programs/exercise-picker-dialog.tsx:585-671` (AI tab and Manual tab video-url sections)

**Interfaces:**
- Consumes: `YouTubeVideoSearch` from Task 11.

- [ ] **Step 1: Add a "Search by name" toggle above the AI tab's existing paste-URL field**

```tsx
// exercise-picker-dialog.tsx:612-635 — inside the "ai" TabsContent, replace the
// existing "YouTube Video URL" block with a tabbed choice between paste and search:
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Video</Label>
                      <Tabs value={aiVideoMode} onValueChange={(v) => setAiVideoMode(v as "paste" | "search")}>
                        <TabsList className="grid grid-cols-2 h-7">
                          <TabsTrigger value="search" className="text-xs">Search YouTube</TabsTrigger>
                          <TabsTrigger value="paste" className="text-xs">Paste URL</TabsTrigger>
                        </TabsList>
                        <TabsContent value="search" className="mt-2">
                          <YouTubeVideoSearch
                            onSelect={(v) => setAiVideoUrl(v.videoUrl)}
                          />
                          {aiVideoUrl && isYouTubeUrl(aiVideoUrl) && (
                            <p className="text-xs text-muted-foreground mt-1">Selected: {aiVideoUrl}</p>
                          )}
                        </TabsContent>
                        <TabsContent value="paste" className="mt-2">
                          <Input
                            id="ai-video"
                            value={aiVideoUrl}
                            onChange={(e) => setAiVideoUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="h-8 text-sm"
                          />
                        </TabsContent>
                      </Tabs>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 text-xs w-full"
                        disabled={!isYouTubeUrl(aiVideoUrl) || aiStatus === "loading"}
                        onClick={handleGenerateWithAi}
                      >
                        {aiStatus === "loading" ? "Generating..." : "Generate with AI"}
                      </Button>
                      {aiStatus === "error" && (
                        <p className="text-xs text-destructive">{aiError} — check the link and try again.</p>
                      )}
                    </div>
```

Add `const [aiVideoMode, setAiVideoMode] = useState<"paste" | "search">("search");` next to the other `ai*` state declarations (near line 402), and `import { YouTubeVideoSearch } from "@/components/exercises/youtube-video-search";`.

- [ ] **Step 2: Add the same toggle to the Manual tab**

```tsx
// exercise-picker-dialog.tsx:654-663 — replace the Manual tab's single Video URL input with:
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Video</Label>
                      <Tabs value={manualVideoMode} onValueChange={(v) => setManualVideoMode(v as "paste" | "search")}>
                        <TabsList className="grid grid-cols-2 h-7">
                          <TabsTrigger value="search" className="text-xs">Search YouTube</TabsTrigger>
                          <TabsTrigger value="paste" className="text-xs">Paste URL</TabsTrigger>
                        </TabsList>
                        <TabsContent value="search" className="mt-2">
                          <YouTubeVideoSearch
                            onSelect={(v) => setManualForm((f) => ({ ...f, videoUrl: v.videoUrl }))}
                          />
                          {manualForm.videoUrl && (
                            <p className="text-xs text-muted-foreground mt-1">Selected: {manualForm.videoUrl}</p>
                          )}
                        </TabsContent>
                        <TabsContent value="paste" className="mt-2">
                          <Input
                            id="ex-video"
                            value={manualForm.videoUrl}
                            onChange={(e) => setManualForm((f) => ({ ...f, videoUrl: e.target.value }))}
                            placeholder="YouTube or Vimeo URL"
                            className="h-8 text-sm"
                          />
                        </TabsContent>
                      </Tabs>
                    </div>
```

Add `const [manualVideoMode, setManualVideoMode] = useState<"paste" | "search">("search");` next to `manualForm` state (near line 406).

- [ ] **Step 3: Add `YOUTUBE_API_KEY` to local env if missing**

```bash
grep -q YOUTUBE_API_KEY .env.local 2>/dev/null || echo "YOUTUBE_API_KEY not set — search will 500 until it's added to .env.local"
```
If it's not set, get the key from whoever manages this project's API credentials before testing — `/api/youtube/search-videos` returns a 500 without it (`app/api/youtube/search-videos/route.ts:46-48`).

- [ ] **Step 4: Manually verify in the browser**

Open **Add Exercise → Create New → Manual**, type "Single Leg RDL" into the Search YouTube box, confirm thumbnails appear, click one, confirm "Selected: https://www.youtube.com/watch?v=..." appears, fill in Name, submit, and confirm the created exercise's Video badge now works (per Task 9/10). Repeat on the AI tab and confirm clicking a search result populates the URL field enough to enable "Generate with AI".

- [ ] **Step 5: Stage for review**

```bash
git add components/programs/exercise-picker-dialog.tsx
git status
```

---

## Phase 6 — Priority 6: Don't persist Performance/Rehab on individual exercises

### Task 13: Add a regression test proving Exercise records never carry a Rehab/Performance category

**Context:** `exercise-picker-dialog.tsx`'s AI tab has an "Exercise Context" toggle (`aiContext`, "Rehab / Clinical" / "Athletic / Performance") that only steers the AI metadata-generation prompt sent to `/api/ai/generate-exercise-metadata` — it is never included in `handleCreate`'s payload to `createOrganizationExerciseAction` (verified: `aiContext` doesn't appear anywhere in the `{ name, description, bodyRegion, ... }` object built at `exercise-picker-dialog.tsx:516-524`), and `Exercise` has no field for it in the Prisma schema. This item is already satisfied by the current design — this task locks it in with a test rather than changing behavior, so a future edit doesn't accidentally start persisting it.

**Files:**
- Create: `actions/__tests__/exercise-context-not-persisted.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const trainer = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1' }

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk_1', orgId: 'org_1' }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/exercise.service', () => ({
  createExercise: vi.fn().mockResolvedValue({ id: 'ex_1', name: 'Squat' }),
}))

import { prisma } from '@/lib/prisma'
import { createExercise } from '@/lib/services/exercise.service'
import { createOrganizationExerciseAction } from '../exercise-actions'

const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockCreateExercise = vi.mocked(createExercise)

beforeEach(() => {
  vi.clearAllMocks()
  mockUserFindUnique.mockResolvedValue(trainer as never)
})

it('never forwards a rehab/performance context field to the Exercise service', async () => {
  await createOrganizationExerciseAction({
    name: 'Squat',
    bodyRegion: ['LOWER_BODY'],
    difficultyLevel: 'BEGINNER',
    isPublic: true,
    // @ts-expect-error — aiContext is not part of the accepted input type
    aiContext: 'CLINICAL',
  })

  const passedData = mockCreateExercise.mock.calls[0][0]
  expect(passedData).not.toHaveProperty('aiContext')
  expect(passedData).not.toHaveProperty('context')
  expect(passedData).not.toHaveProperty('rehabPerformance')
})
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run actions/__tests__/exercise-context-not-persisted.test.ts
```
Expected: PASS (confirms current behavior; if it ever fails after a future change, that's the regression this task exists to catch).

- [ ] **Step 3: Stage for review**

```bash
git add actions/__tests__/exercise-context-not-persisted.test.ts
git status
```

---

## Phase 7 — Priority 7: Program-level Performance/Rehab categorization

### Task 14: Add `programType` to the `Program` schema and validators

**Naming note:** the codebase already uses the vocabulary `"PERFORMANCE" | "CLINICAL"` in two places (`aiContext` in the exercise modal, `programMode` in `generate-program-form.tsx:100`) — reuse those exact two values for `programType` rather than introducing a third naming convention (e.g. `"REHABILITATION"`).

**Files:**
- Modify: `prisma/schema.prisma:418-445` (`Program`)
- Modify: `lib/validators/program.ts:53-69` (`createProgramSchema`, `updateProgramSchema`)

**Interfaces:**
- Produces: `Program.programType: "PERFORMANCE" | "CLINICAL" | null`. `CreateProgramInput.programType?: "PERFORMANCE" | "CLINICAL" | null`.

- [ ] **Step 1: Add the field to the Prisma model**

```prisma
// prisma/schema.prisma:418-445
model Program {
  id                 String     @id @default(auto()) @map("_id") @db.ObjectId
  name               String
  description        String?
  isTemplate         Boolean    @default(false)
  isGlobal           Boolean    @default(false)
  globalUpdatedAt    DateTime?
  sourceTemplateId   String?    @db.ObjectId
  trainerId          String?    @map("clinicianId") @db.ObjectId
  trainer            User?      @relation("ProgramsCreated", fields: [trainerId], references: [id])
  clientId           String?    @map("patientId") @db.ObjectId
  client             User?      @relation("ProgramsAssigned", fields: [clientId], references: [id])
  status             PlanStatus @default(DRAFT)
  programType        String?
  durationWeeks      Int?
  daysPerWeek        Int?
  tags               String[]
  equipmentRequired  String[]   @default([])
  organizationIds    String[]   @default([])
  aiGenerationParams Json?
  startDate          DateTime?
  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt
  workouts           Workout[]

  @@index([trainerId])
  @@index([clientId])
  @@index([isGlobal])
}
```

- [ ] **Step 2: Apply the schema change**

```bash
npx prisma generate
npx prisma db push
```

- [ ] **Step 3: Add the field to both program zod schemas**

```ts
// lib/validators/program.ts:53-65
export const createProgramSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  isTemplate: z.boolean().default(false),
  sourceTemplateId: z.string().optional().nullable(),
  programType: z.enum(["PERFORMANCE", "CLINICAL"]).optional().nullable(),
  durationWeeks: z.number().int().positive().optional().nullable(),
  daysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
  tags: z.array(z.string()).default([]),
  equipmentRequired: z.array(z.string()).default([]),
  organizationIds: z.array(z.string()).default([]),
  startDate: z.string().datetime().optional().nullable(),
  workouts: z.array(workoutSchema).default([]),
});
```
(`updateProgramSchema` at line 67 is `createProgramSchema.partial().extend({...})` — it inherits `programType` automatically, no separate edit needed.)

- [ ] **Step 4: Stage for review**

```bash
git add prisma/schema.prisma lib/validators/program.ts
git status
```

### Task 15: Add a Program Type selector to the manual Program Builder

**Files:**
- Modify: `components/programs/program-editor.tsx:143-153` (`useForm` defaultValues), `:256-289` (Program Details card fields)

**Interfaces:**
- Consumes: `createProgramSchema.programType` from Task 14.

- [ ] **Step 1: Seed the form's default value**

```ts
// program-editor.tsx:143-152
    defaultValues: {
      name: (program?.name as string) || "",
      description: (program?.description as string) || "",
      isTemplate: (program?.isTemplate as boolean) || false,
      programType: (program?.programType as "PERFORMANCE" | "CLINICAL" | null) || null,
      durationWeeks: (program?.durationWeeks as number) || undefined,
      daysPerWeek: (program?.daysPerWeek as number) || undefined,
      tags: (program?.tags as string[]) || [],
      equipmentRequired: [],
      workouts: [],
    },
```

- [ ] **Step 2: Render the selector in the Program Details card**

```tsx
// program-editor.tsx — insert right after the "name" FormField block (after line 272)
            <FormField
              control={form.control}
              name="programType"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Program Type</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value || "UNSET"}
                      onValueChange={(v) => field.onChange(v === "UNSET" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNSET">Not set</SelectItem>
                        <SelectItem value="PERFORMANCE">🏋️ Performance / Athletic</SelectItem>
                        <SelectItem value="CLINICAL">🩺 Rehab / Clinical</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
```

- [ ] **Step 3: Manually verify in the browser**

Create a new program manually, set Program Type to "Rehab / Clinical", save, reopen the program's edit page, and confirm the selector still shows "Rehab / Clinical" (not reset to "Not set").

- [ ] **Step 4: Stage for review**

```bash
git add components/programs/program-editor.tsx
git status
```

### Task 16: Persist `programMode` as `programType` in the AI-generation flow

**Files:**
- Modify: `components/programs/generate-program-form.tsx:278-294` (`genParams`)
- Modify: `actions/program-actions.ts:53-93` (`createProgramFromGeneratedPlan`)

**Interfaces:**
- Consumes: `programMode` (existing local state, `generate-program-form.tsx:100`).
- Produces: the created `Program.programType` now reflects the coach's Performance/Clinical choice from the generation form, instead of being discarded after generation.

- [ ] **Step 1: Include `programMode` in the exercise-generation payload**

```ts
// generate-program-form.tsx:278-294
    const genParams = {
      clientId: selectedClient || null,
      programMode,
      programGoals: selectedGoals,
      availableEquipment: selectedEquipment,
      startDate: selectedClient ? startDate : null,
      durationMinutes: duration,
      daysPerWeek,
      durationWeeks,
      circuits: circuits.map(({ name, focusType, exerciseCount, rounds, restBetweenRounds }) => ({
        name, focusType, exerciseCount, rounds, restBetweenRounds,
      })),
      preferredWeekdays: selectedWeekdays,
      difficultyLevel: difficulty,
      weekPlan: approvedPlan.weeklyPlan,
      clinicalAssessment: approvedPlan.clinicalAssessment,
      organizationIds: selectedOrganizationIds,
    };
```
(Only the `programMode,` line is new — everything else is unchanged from the current object.)

- [ ] **Step 2: Map it onto the created Program**

```ts
// actions/program-actions.ts:78-93 — inside prisma.program.create({ data: { ... } })
  const program = await prisma.program.create({
    data: {
      name: aiPlan.name,
      description: aiPlan.description || "Generated by AI",
      isTemplate: !clientId && isTemplate,
      isGlobal: params.isGlobal ?? false,
      trainerId,
      clientId: clientId ?? null,
      status: clientId ? "ACTIVE" : "DRAFT",
      programType: typeof aiGenerationParams.programMode === "string" ? aiGenerationParams.programMode : null,
      durationWeeks,
      daysPerWeek,
      startDate: sDate ?? undefined,
      aiGenerationParams: aiGenerationParams as import("@prisma/client").Prisma.InputJsonValue,
    },
    select: { id: true },
  });
```

- [ ] **Step 3: Manually verify in the browser**

Run the AI program-generation flow (Generate Program → pick "Rehab / Clinical" → complete generation), then open the resulting program's edit page and confirm the Program Type selector (Task 15) shows "Rehab / Clinical" — i.e. the choice made during generation survived into the persisted record.

- [ ] **Step 4: Stage for review**

```bash
git add components/programs/generate-program-form.tsx actions/program-actions.ts
git status
```

---

## Phase 8 — Priority 8: Add "Run" as an activity type

### Task 17: Add `activityType` to `BlockExerciseV2`, and `targetPace`/`targetHrZone` to `ExerciseSet`

`targetDistance` already exists on `ExerciseSet` (`prisma/schema.prisma:504`, already in `exerciseSetSchema`) but is never rendered by the current set-editor UI — this task exposes it alongside two genuinely new fields.

**Files:**
- Modify: `prisma/schema.prisma:480-509` (`BlockExerciseV2`, `ExerciseSet`)
- Modify: `lib/validators/program.ts:4-25` (`exerciseSetSchema`, `blockExerciseSchema`)

**Interfaces:**
- Produces: `BlockExerciseInput.activityType?: "STRENGTH" | "RUN" | "INTERVAL_RUN"` (default `"STRENGTH"`). `ExerciseSetInput.targetPace?: string | null`, `.targetHrZone?: string | null`.

- [ ] **Step 1: Add the fields to the Prisma models**

```prisma
// prisma/schema.prisma:480-493
model BlockExerciseV2 {
  id            String         @id @default(auto()) @map("_id") @db.ObjectId
  blockId       String         @db.ObjectId
  block         WorkoutBlockV2 @relation(fields: [blockId], references: [id], onDelete: Cascade)
  exerciseId    String         @db.ObjectId
  exercise      Exercise       @relation("BlockExercisesV2", fields: [exerciseId], references: [id])
  orderIndex    Int
  activityType  String         @default("STRENGTH")
  restSeconds   Int?
  notes         String?
  supersetGroup String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  sets          ExerciseSet[]
}

model ExerciseSet {
  id                  String          @id @default(auto()) @map("_id") @db.ObjectId
  blockExerciseId     String          @db.ObjectId
  blockExercise       BlockExerciseV2 @relation(fields: [blockExerciseId], references: [id], onDelete: Cascade)
  orderIndex          Int
  setType             String          @default("NORMAL")
  targetReps          Int?
  targetWeight        Float?
  targetDuration      Int?
  targetDurationUnit  String?
  targetDistance      Float?
  targetPace          String?
  targetHrZone        String?
  repeatCount         Int?
  targetRPE           Int?
  targetPercentage1RM Float?
  tempo               String?
  restAfter           Int?
}
```
(`repeatCount` is added here too, ahead of Task 20, so this is the only schema-touching task for the whole Run/Interval feature — Task 20 only adds UI/logic on top of it.)

- [ ] **Step 2: Apply the schema change**

```bash
npx prisma generate
npx prisma db push
```

- [ ] **Step 3: Add the fields to the zod schemas**

```ts
// lib/validators/program.ts:4-14
export const exerciseSetSchema = z.object({
  id: z.string().optional(),
  orderIndex: z.number().int().min(0),
  setType: z.enum(["NORMAL", "WARMUP", "DROP_SET", "FAILURE", "WORK", "RECOVERY", "COOLDOWN"]).default("NORMAL"),
  targetReps: z.number().int().positive().optional().nullable(),
  targetWeight: z.number().positive().optional().nullable(),
  targetDuration: z.number().int().positive().optional().nullable(),
  targetDurationUnit: z.enum(["SEC", "MIN"]).optional().nullable(),
  targetDistance: z.number().positive().optional().nullable(),
  targetPace: z.string().max(50).optional().nullable(),
  targetHrZone: z.string().max(50).optional().nullable(),
  repeatCount: z.number().int().positive().optional().nullable(),
  targetRPE: z.number().int().min(1).max(10).optional().nullable(),
  restAfter: z.number().int().min(0).optional().nullable(),
});

// lib/validators/program.ts:17-25
export const blockExerciseSchema = z.object({
  id: z.string().optional(),
  exerciseId: z.string().min(1, "Exercise is required"),
  orderIndex: z.number().int().min(0),
  activityType: z.enum(["STRENGTH", "RUN", "INTERVAL_RUN"]).default("STRENGTH"),
  restSeconds: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  supersetGroup: z.string().optional().nullable(),
  sets: z.array(exerciseSetSchema).min(1, "At least one set is required"),
});
```
(`setType`'s enum gained `WORK`/`RECOVERY`/`COOLDOWN` here rather than in Task 20, since it's a one-line addition to the same schema block this task already touches — Task 20 builds the UI that produces those values.)

- [ ] **Step 4: Thread `activityType` through `program.service.ts`'s bulk mapping**

```ts
// lib/services/program.service.ts:114-124 — inside the exerciseRows.push({ ... }) loop
        exerciseRows.push({
          id: blockExerciseId,
          blockId,
          exerciseId: e.exerciseId,
          orderIndex: e.orderIndex,
          activityType: e.activityType,
          restSeconds: e.restSeconds,
          notes: e.notes,
          supersetGroup: e.supersetGroup,
        });
```
And add `targetPace: s.targetPace, targetHrZone: s.targetHrZone, repeatCount: s.repeatCount,` next to the existing `targetDistance`/`targetRPE` lines in the `setRows.push({...})` block a few lines below (same block Task 5 Step 4 already touched — this task's edit lands on top of it).

Apply the equivalent additions to the nested-`create` mapping inside `updateProgram` (same two spots Task 5 Step 4 touched there).

- [ ] **Step 5: Stage for review**

```bash
git add prisma/schema.prisma lib/validators/program.ts lib/services/program.service.ts
git status
```

### Task 18: Add an activity-type selector to each exercise row in the Program Builder

Mirrors the existing block-`type` conditional-render pattern already in this file (`program-builder.tsx:593-647`, the CIRCUIT/AMRAP rounds+timeCap fields) — this task builds the same shape one level down, on the exercise row.

**Files:**
- Modify: `components/programs/program-builder.tsx` (exercise row header, around lines 723-756; `addExerciseToBlock`, lines 228-262)

**Interfaces:**
- Produces: `ex.activityType`, read by `SetEditor` in Task 19 to decide which fields to render.

- [ ] **Step 1: Default new block-exercises to `STRENGTH`**

```ts
// program-builder.tsx:228-262 — addExerciseToBlock(exercise), find the object literal
// pushed for the new BlockExercise and add one field:
      activityType: "STRENGTH",
```
(Add it alongside the existing `exerciseId`/`sets`/etc. fields in that literal — leave everything else in the function unchanged.)

- [ ] **Step 2: Render a Type selector next to the exercise name**

```tsx
// program-builder.tsx:723-733 — inside the exercise row, right after the
// "font-medium truncate" exercise-name <span> and before the video-badge IIFE:
                                        <Select
                                          value={ex.activityType || "STRENGTH"}
                                          onValueChange={(v) => updateExerciseField(wi, bi, ei, "activityType", v)}
                                        >
                                          <SelectTrigger className="h-6 text-[10px] w-[92px] shrink-0">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="STRENGTH">Strength</SelectItem>
                                            <SelectItem value="RUN">Run</SelectItem>
                                            <SelectItem value="INTERVAL_RUN">Interval Run</SelectItem>
                                          </SelectContent>
                                        </Select>
```

- [ ] **Step 3: Add the `updateExerciseField` helper**

Find `updateExerciseNotes` (the existing per-exercise field setter used at line 774-780) and add a sibling generic setter right above/below it:

```ts
// program-builder.tsx — next to updateExerciseNotes
  function updateExerciseField(
    wi: number,
    bi: number,
    ei: number,
    field: "activityType",
    value: string
  ) {
    const next = [...workouts];
    const block = next[wi].blocks[bi];
    block.exercises = block.exercises.map((e, i) =>
      i === ei ? { ...e, [field]: value } : e
    );
    onChange(next);
  }
```
(Match this function's exact update pattern to whatever `updateExerciseNotes` already does in this file — if it mutates via a different immutability helper, use that same helper instead of hand-rolling a new one.)

- [ ] **Step 4: Manually verify in the browser**

Add an exercise to a block, change its Type selector to "Run", confirm the selection persists after switching to a different block and back (still local `workouts` state, no save needed yet — full persistence is verified in Task 19).

- [ ] **Step 5: Stage for review**

```bash
git add components/programs/program-builder.tsx
git status
```

### Task 19: Render Run-specific fields (Distance / Duration+unit / Pace / HR Zone / RPE) in place of Reps/Weight

**Files:**
- Modify: `components/programs/set-editor.tsx`
- Modify: `components/programs/program-builder.tsx` (pass `activityType` down to `SetEditor`)

**Interfaces:**
- Consumes: `ex.activityType` from Task 18, `targetDistance`/`targetPace`/`targetHrZone` from Task 17.

- [ ] **Step 1: Pass `activityType` into `SetEditor`**

```tsx
// program-builder.tsx:786-791 — the existing <SetEditor> render
                                      <SetEditor
                                        sets={ex.sets}
                                        activityType={ex.activityType || "STRENGTH"}
                                        onChange={(sets) =>
                                          updateExerciseSets(wi, bi, ei, sets)
                                        }
                                      />
```

- [ ] **Step 2: Accept the new prop and branch the column layout**

```tsx
// components/programs/set-editor.tsx:15-18
interface Props {
  sets: ExerciseSetInput[];
  activityType?: "STRENGTH" | "RUN" | "INTERVAL_RUN";
  onChange: (sets: ExerciseSetInput[]) => void;
}

export function SetEditor({ sets, activityType = "STRENGTH", onChange }: Props) {
```

```tsx
// components/programs/set-editor.tsx:51-155 — wrap the existing STRENGTH grid in a
// branch, and add a RUN branch. INTERVAL_RUN is handled separately in Task 21.
  if (activityType === "INTERVAL_RUN") {
    return <IntervalSetEditor sets={sets} onChange={onChange} />; // added in Task 21
  }

  if (activityType === "RUN") {
    return (
      <div className="space-y-1.5">
        <div className="grid grid-cols-[minmax(70px,1fr)_minmax(110px,1.4fr)_minmax(90px,1fr)_minmax(80px,1fr)_minmax(60px,1fr)_40px] gap-2 text-xs text-muted-foreground font-medium px-1">
          <span>Distance</span>
          <span>Duration</span>
          <span>Pace</span>
          <span>HR Zone</span>
          <span>RPE</span>
          <span></span>
        </div>
        {sets.map((set, si) => (
          <div key={si} className="grid grid-cols-[minmax(70px,1fr)_minmax(110px,1.4fr)_minmax(90px,1fr)_minmax(80px,1fr)_minmax(60px,1fr)_40px] gap-2 items-center">
            <Input
              type="number"
              value={set.targetDistance ?? ""}
              onChange={(e) => updateSet(si, "targetDistance", e.target.value ? parseFloat(e.target.value) : null)}
              className="h-8 text-xs"
              placeholder="mi"
              min={0}
              step={0.1}
            />
            <div className="flex gap-1">
              <Input
                type="number"
                value={set.targetDuration ?? ""}
                onChange={(e) => updateSet(si, "targetDuration", e.target.value ? parseInt(e.target.value) : null)}
                className="h-8 text-xs w-full"
                placeholder="Duration"
                min={0}
              />
              <Select value={set.targetDurationUnit || "SEC"} onValueChange={(v) => updateSet(si, "targetDurationUnit", v)}>
                <SelectTrigger className="h-8 text-xs w-16 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEC">sec</SelectItem>
                  <SelectItem value="MIN">min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              value={set.targetPace ?? ""}
              onChange={(e) => updateSet(si, "targetPace", e.target.value || null)}
              className="h-8 text-xs"
              placeholder="9:30/mi"
            />
            <Input
              value={set.targetHrZone ?? ""}
              onChange={(e) => updateSet(si, "targetHrZone", e.target.value || null)}
              className="h-8 text-xs"
              placeholder="Zone 2"
            />
            <Input
              type="number"
              value={set.targetRPE ?? ""}
              onChange={(e) => updateSet(si, "targetRPE", e.target.value ? parseInt(e.target.value) : null)}
              className="h-8 text-xs"
              placeholder="RPE"
              min={1}
              max={10}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeSet(si)} disabled={sets.length <= 1}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addSet} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" /> Add Set
        </Button>
      </div>
    );
  }

  // --- existing STRENGTH branch below, unchanged from the current file ---
  return (
    <div className="space-y-1.5">
      {/* ...existing header row + sets.map(...) + Add Set button, exactly as today... */}
    </div>
  );
}
```
(`addSet`/`removeSet`/`updateSet` at the top of the file stay shared across both branches — no changes needed there beyond what Task 6 already made.)

- [ ] **Step 3: Manually verify in the browser**

Add an exercise, set its Type to "Run", confirm the row switches to Distance/Duration/Pace/HR Zone/RPE columns (Reps/Weight disappear), fill in "Distance: 5 mi", "Target Pace: 9:30-10:00/mi" (as free text), "HR Zone: Zone 2", "RPE: 4", save the program, reload, and confirm all five values redisplay correctly.

- [ ] **Step 4: Stage for review**

```bash
git add components/programs/set-editor.tsx components/programs/program-builder.tsx
git status
```

---

## Phase 9 — Priority 9: Interval Run

### Task 20: Design note — no further schema changes needed

Task 17 already added everything Interval Run needs: `setType`'s zod enum includes `WORK`/`RECOVERY`/`COOLDOWN` (on top of the existing `WARMUP`/`NORMAL`/`DROP_SET`/`FAILURE`, all stored as a plain unconstrained `String` in Mongo — confirmed at `prisma/schema.prisma:500`, so no migration is needed for new string values), and `ExerciseSet.repeatCount` lets a single `WORK` row mean "repeat this segment N times" instead of the coach having to add N duplicate rows by hand. This task is a no-op — it exists only to record the design decision so Task 21's UI has a schema it can point to without re-deriving it.

- [ ] **Step 1: No code changes.** Confirm by reading `lib/validators/program.ts`'s `exerciseSetSchema` (post-Task-17) that `setType`, `repeatCount`, `targetDistance`, `targetDuration`/`targetDurationUnit`, `targetPace` are all present — if any are missing, Task 17 wasn't fully applied; stop and fix Task 17 before continuing.

### Task 21: Build the Interval Run set-builder UI

**Files:**
- Modify: `components/programs/set-editor.tsx` (add `IntervalSetEditor`, referenced by Task 19's `activityType === "INTERVAL_RUN"` branch)

**Interfaces:**
- Produces: `IntervalSetEditor({ sets, onChange })` — same `(sets, onChange)` contract as `SetEditor`, so Task 19's one-line dispatch (`return <IntervalSetEditor sets={sets} onChange={onChange} />;`) needs no further wiring.

- [ ] **Step 1: Add labeled "Add Warmup / Add Work×Recovery / Add Cooldown" buttons instead of the generic "Add Set" button**

```tsx
// components/programs/set-editor.tsx — new component, added below SetEditor in the same file
function segmentDefaults(setType: string): Partial<ExerciseSetInput> {
  if (setType === "WARMUP" || setType === "COOLDOWN") {
    return { targetDistance: 1, targetDurationUnit: "MIN" };
  }
  if (setType === "WORK") {
    return { targetDistance: 0.25, targetPace: null, repeatCount: 6 };
  }
  return { targetDuration: 90, targetDurationUnit: "SEC" }; // RECOVERY
}

function IntervalSetEditor({ sets, onChange }: { sets: ExerciseSetInput[]; onChange: (sets: ExerciseSetInput[]) => void }) {
  function addSegment(setType: "WARMUP" | "WORK" | "RECOVERY" | "COOLDOWN") {
    onChange([
      ...sets,
      { orderIndex: sets.length, setType, ...segmentDefaults(setType) },
    ]);
  }

  function removeSegment(idx: number) {
    onChange(sets.filter((_, i) => i !== idx).map((s, i) => ({ ...s, orderIndex: i })));
  }

  function updateSegment(idx: number, field: string, value: number | string | null) {
    const next = [...sets];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  const SEGMENT_LABEL: Record<string, string> = {
    WARMUP: "Warm-up", WORK: "Work", RECOVERY: "Recovery", COOLDOWN: "Cool-down",
  };

  return (
    <div className="space-y-1.5">
      {sets.map((set, si) => (
        <div key={si} className="flex items-center gap-2 border rounded-md p-2">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground w-16 shrink-0">
            {SEGMENT_LABEL[set.setType] ?? set.setType}
          </span>
          {set.setType === "WORK" && (
            <Input
              type="number"
              value={set.repeatCount ?? ""}
              onChange={(e) => updateSegment(si, "repeatCount", e.target.value ? parseInt(e.target.value) : null)}
              className="h-8 text-xs w-14"
              placeholder="×N"
              min={1}
            />
          )}
          <Input
            type="number"
            value={set.targetDistance ?? ""}
            onChange={(e) => updateSegment(si, "targetDistance", e.target.value ? parseFloat(e.target.value) : null)}
            className="h-8 text-xs w-20"
            placeholder="mi"
            step={0.05}
          />
          <Input
            type="number"
            value={set.targetDuration ?? ""}
            onChange={(e) => updateSegment(si, "targetDuration", e.target.value ? parseInt(e.target.value) : null)}
            className="h-8 text-xs w-20"
            placeholder="Duration"
          />
          <Select value={set.targetDurationUnit || "SEC"} onValueChange={(v) => updateSegment(si, "targetDurationUnit", v)}>
            <SelectTrigger className="h-8 text-xs w-16 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEC">sec</SelectItem>
              <SelectItem value="MIN">min</SelectItem>
            </SelectContent>
          </Select>
          {set.setType === "WORK" && (
            <Input
              value={set.targetPace ?? ""}
              onChange={(e) => updateSegment(si, "targetPace", e.target.value || null)}
              className="h-8 text-xs flex-1"
              placeholder="Target pace (e.g. 7:30/mi)"
            />
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive ml-auto" onClick={() => removeSegment(si)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => addSegment("WARMUP")} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" /> Warm-up
        </Button>
        <Button variant="outline" size="sm" onClick={() => addSegment("WORK")} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" /> Work interval
        </Button>
        <Button variant="outline" size="sm" onClick={() => addSegment("RECOVERY")} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" /> Recovery
        </Button>
        <Button variant="outline" size="sm" onClick={() => addSegment("COOLDOWN")} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" /> Cool-down
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify in the browser**

Add an exercise, set its Type to "Interval Run", add a Warm-up segment (1 mi), a Work interval (0.25 mi = 400m, ×6, pace 7:30/mi), a Recovery segment (90 sec), and a Cool-down segment (1 mi) — matching the docx's example (`Warm-up: 1 mi | Intervals: 6 × 400 m | Target Pace: 7:30/mi | Recovery: 90 sec jog | Cool-down: 1 mi`). Save the program, reload, and confirm all four segments and their fields (including the `×6` repeat count and the pace text) redisplay correctly.

- [ ] **Step 3: Stage for review**

```bash
git add components/programs/set-editor.tsx
git status
```

---

## Self-Review

- **Spec coverage:** items 1-9 from `InMotus_Program_Builder_Engineer_Task_List.docx` map to Phases 1-9 respectively (1↔Task1, 2↔Tasks2-4, 3↔Tasks5-8, 4↔Tasks9-10, 5↔Tasks11-12, 6↔Task13, 7↔Tasks14-16, 8↔Tasks17-19, 9↔Tasks20-21).
- **No placeholders:** every code step above shows the actual diff, not a description of one; the one intentionally-thin task (Task 20) is explicitly a no-op design note, not a deferred implementation step.
- **Type consistency:** `activityType` ("STRENGTH"/"RUN"/"INTERVAL_RUN") is spelled identically in Tasks 17, 18, 19; `targetDurationUnit` ("SEC"/"MIN") is spelled identically in Tasks 5, 6, 7, 8, 19, 21; `programType` ("PERFORMANCE"/"CLINICAL") is spelled identically in Tasks 14, 15, 16; `hasRealVideoUrl` signature matches between Task 9 (definition) and Task 10 (call sites).
