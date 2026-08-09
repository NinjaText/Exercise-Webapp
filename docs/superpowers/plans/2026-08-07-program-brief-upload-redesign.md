# Program Brief Upload Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the program-brief-upload flow so exercise matches are transparent and reviewable, hallucinated exercises are flagged, required structural fields are confirmed upfront via a popup instead of guessed, saving is blocked until every flag is resolved, and the slow per-exercise LLM matching step is replaced with deterministic scoring plus real staged progress feedback.

**Architecture:** Split the current two-action flow (`extractProgramMetadataFromBriefAction` → `generateProgramPreviewFromBriefAction`) into four sequential server actions the client calls one after another, each advancing a visible progress stepper: read metadata → (blocking popup if fields are missing) → extract chunks → match exercises deterministically → save. Exercise matching moves from an LLM tie-break call per exercise to a pure scoring function (`resolveExerciseMatch`) that tags each exercise with a flag (`needs_review` / `not_in_library` / `not_in_document`) instead of silently substituting or dropping it. The trainer resolves every flag in the review screen (confirm / pick alternative via the existing `ExercisePickerDialog` / skip) before Save unlocks.

**Tech Stack:** Next.js Server Actions, Prisma (MongoDB), OpenAI SDK (`gpt-4o` for text extraction only — no LLM calls left in exercise matching), Zod, shadcn/Radix Dialog, Vitest.

## Global Constraints

- No new file formats — upload still accepts only `.pdf`, `.docx`, `.txt`, `.md` (`lib/validators/program-brief.ts`).
- No LLM call anywhere in exercise-name matching after this change (removes `pickClosestExerciseNameAI`).
- Auto-accept threshold for library matching is score ≥ 0.9; "needs review" is 0.5 ≤ score < 0.9; below 0.5 or zero candidates is "not in library" (see spec §2).
- Save / Save & Assign must be disabled while any exercise has an unresolved flag.
- `durationWeeks` on `Program` is computed from the parsed session blueprint's actual week count, never asked of the trainer.
- Follow existing code style per file: `lib/services/ai.service.ts` and `lib/services/program-brief.service.ts` use double-quoted strings; match that in all edits.
- Full spec: `docs/superpowers/specs/2026-08-07-program-brief-upload-redesign-design.md`.

---

## Task 1: Deterministic exercise-match tiering in `ai.service.ts`

**Files:**
- Modify: `lib/services/ai.service.ts:161-178` (export `normalizeExerciseName`), add new code after line 178 (before the `EXERCISE_POOL_SELECT` constant at line 180)
- Test: `lib/services/__tests__/ai.service.test.ts`

**Interfaces:**
- Produces: `export function normalizeExerciseName(name: string): string` (was private), `export type ExerciseMatchFlag = "needs_review" | "not_in_library" | "not_in_document"` (the `"not_in_document"` member is unused by this task's own code — it's produced by Task 3 — but declared here since this is where the type lives), `export type ExerciseMatchCandidate = { exerciseId: string; exerciseName: string; score: number }`, `export type ExerciseMatchResult = { exerciseId: string | null; matchType: "exact" | "needs_review" | "not_in_library"; candidates: ExerciseMatchCandidate[] }`, `export function resolveExerciseMatch(name: string, candidates: Exercise[]): ExerciseMatchResult` (synchronous, no LLM call).
- This task is additive — the existing `resolveExerciseByName`/`pickClosestExerciseNameAI` and the `sessionBlueprint` branch of `generateWorkoutPlan` are left untouched and still work; they're removed later in Task 5 once nothing else calls the new function's replacements.

- [ ] **Step 1: Write the failing test for `resolveExerciseMatch`**

Add to `lib/services/__tests__/ai.service.test.ts`, right after the existing `import { resolveExerciseByName, generateWorkoutPlan } from '../ai.service'` line, change the import to also pull in the new export:

```ts
import { resolveExerciseByName, resolveExerciseMatch, generateWorkoutPlan } from '../ai.service'
```

Then add this new `describe` block right after the existing `describe('resolveExerciseByName', ...)` block (after its closing `})` at line 75):

```ts
describe('resolveExerciseMatch', () => {
  it('auto-accepts an exact match with no candidates list and no AI call', () => {
    const squat = exercise({ name: 'Squat' })
    const result = resolveExerciseMatch('Squat', [squat])
    expect(result).toEqual({ exerciseId: 'ex1', matchType: 'exact', candidates: [] })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('auto-accepts case/punctuation-insensitive exact matches', () => {
    const squat = exercise({ name: 'Back Squat' })
    const result = resolveExerciseMatch('back-squat', [squat])
    expect(result).toEqual({ exerciseId: 'ex1', matchType: 'exact', candidates: [] })
  })

  it('auto-accepts a substring match (score 0.9) as exact', () => {
    const squat = exercise({ id: 'ex9', name: 'Barbell Back Squat' })
    const result = resolveExerciseMatch('Back Squat', [squat])
    expect(result.matchType).toBe('exact')
    expect(result.exerciseId).toBe('ex9')
  })

  it('flags a partial token-overlap match as needs_review with candidates', () => {
    const row = exercise({ id: 'ex5', name: 'Bent Over Row' })
    const result = resolveExerciseMatch('Row', [row])
    expect(result.matchType).toBe('needs_review')
    expect(result.exerciseId).toBe('ex5')
    expect(result.candidates).toEqual([{ exerciseId: 'ex5', exerciseName: 'Bent Over Row', score: expect.any(Number) }])
  })

  it('flags no-overlap names as not_in_library with top candidates, exerciseId null', () => {
    const squat = exercise({ id: 'ex1', name: 'Squat' })
    const result = resolveExerciseMatch('Nordic Hamstring Curl', [squat])
    expect(result.matchType).toBe('not_in_library')
    expect(result.exerciseId).toBeNull()
    expect(result.candidates).toHaveLength(1)
  })

  it('returns not_in_library with empty candidates when the library is empty', () => {
    const result = resolveExerciseMatch('Nonexistent Move', [])
    expect(result).toEqual({ exerciseId: null, matchType: 'not_in_library', candidates: [] })
  })

  it('never calls the AI client', () => {
    const bandPull = exercise({ id: 'ex2', name: 'Band Pull Apart' })
    resolveExerciseMatch('Pull Apart Band', [bandPull])
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/__tests__/ai.service.test.ts -t "resolveExerciseMatch"`
Expected: FAIL — `resolveExerciseMatch` is not exported from `../ai.service`.

- [ ] **Step 3: Implement `resolveExerciseMatch`**

In `lib/services/ai.service.ts`, change line 161 from `function normalizeExerciseName(name: string) {` to `export function normalizeExerciseName(name: string) {`.

Then insert the following new block immediately after the `scoreNameSimilarity` function (after its closing `}` at line 178, before `const EXERCISE_POOL_SELECT = {` at line 180):

```ts
export type ExerciseMatchFlag = "needs_review" | "not_in_library" | "not_in_document";

export type ExerciseMatchCandidate = {
  exerciseId: string;
  exerciseName: string;
  score: number;
};

export type ExerciseMatchResult = {
  exerciseId: string | null;
  matchType: "exact" | "needs_review" | "not_in_library";
  candidates: ExerciseMatchCandidate[];
};

const AUTO_ACCEPT_SCORE = 0.9;
const NEEDS_REVIEW_SCORE = 0.5;

/**
 * Deterministic, LLM-free exercise-name matching against the library.
 * Exact/near-exact matches (score >= AUTO_ACCEPT_SCORE) auto-accept silently.
 * Everything below that is left for the trainer to resolve in the review
 * screen instead of a silent AI best-guess substitution.
 */
export function resolveExerciseMatch(
  name: string,
  candidates: Exercise[]
): ExerciseMatchResult {
  const normalizedTarget = normalizeExerciseName(name);

  const exact = candidates.find(
    (e) => normalizeExerciseName(e.name) === normalizedTarget
  );
  if (exact) {
    return { exerciseId: exact.id, matchType: "exact", candidates: [] };
  }

  const ranked = candidates
    .map((e) => ({
      exercise: e,
      score: scoreNameSimilarity(normalizeExerciseName(e.name), normalizedTarget),
    }))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return { exerciseId: null, matchType: "not_in_library", candidates: [] };
  }

  const top = ranked.slice(0, 5).map((r) => ({
    exerciseId: r.exercise.id,
    exerciseName: r.exercise.name,
    score: r.score,
  }));

  const best = ranked[0];
  if (best.score >= AUTO_ACCEPT_SCORE) {
    return { exerciseId: best.exercise.id, matchType: "exact", candidates: [] };
  }
  if (best.score >= NEEDS_REVIEW_SCORE) {
    return { exerciseId: best.exercise.id, matchType: "needs_review", candidates: top };
  }
  return { exerciseId: null, matchType: "not_in_library", candidates: top };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/ai.service.test.ts`
Expected: PASS for all tests, including the pre-existing `resolveExerciseByName` and `generateWorkoutPlan` describe blocks (untouched).

- [ ] **Step 5: Commit**

```bash
git add lib/services/ai.service.ts lib/services/__tests__/ai.service.test.ts
git commit -m "feat: add deterministic exercise-match tiering alongside existing AI matching"
```

---

## Task 2: Document-fidelity flagging in `program-brief.service.ts`

**Files:**
- Modify: `lib/services/program-brief.service.ts` (types at lines 41-88, `mergeChunkSessions` at lines 161-229, `parseProgramBrief` at lines 482-578)
- Test: `lib/services/__tests__/program-brief.service.test.ts`

**Interfaces:**
- Consumes: `normalizeExerciseName` from `./ai.service` (Task 1's export).
- Produces: `ExerciseBlueprint.traceableInDocument?: boolean`, `RawSession.sourceChunkIndex: number`, `SessionBlueprint.sourceChunkIndex?: number`, `export function isExerciseTraceableInDocument(exerciseName: string, sourceText: string): boolean`, `export function flagUntraceableExercises(sessionBlueprint: SessionBlueprint[], chunks: string[]): SessionBlueprint[]`. `parseProgramBrief`'s returned `ProgramBriefParsed.sessionBlueprint` now has `traceableInDocument` set on every exercise.

- [ ] **Step 1: Write the failing test for `isExerciseTraceableInDocument`**

Add near the top of `lib/services/__tests__/program-brief.service.test.ts`, extend the import at line 23:

```ts
import { splitIntoChunks, mergeChunkSessions, deriveCircuitsFromSessions, extractBriefMetadata, extractChunkSessions, parseProgramBrief, isExerciseTraceableInDocument, flagUntraceableExercises } from '../program-brief.service'
```

Add a new `describe` block (anywhere after the imports, e.g. right before the `describe('splitIntoChunks', ...)` block):

```ts
describe('isExerciseTraceableInDocument', () => {
  it('returns true when the exercise name appears verbatim in the source text', () => {
    expect(isExerciseTraceableInDocument('Barbell Back Squat', 'Day 1\nBarbell Back Squat 4x8\nBench Press 4x8')).toBe(true)
  })

  it('returns true for case/punctuation-insensitive matches', () => {
    expect(isExerciseTraceableInDocument('back-squat', 'Barbell Back Squat: 4 sets of 8')).toBe(true)
  })

  it('returns true when most distinctive tokens overlap even if not a verbatim substring', () => {
    expect(isExerciseTraceableInDocument('Dumbbell Bench Press', 'DB Bench Press 3x10')).toBe(true)
  })

  it('returns false when the exercise name has no meaningful overlap with the source text', () => {
    expect(isExerciseTraceableInDocument('Nordic Hamstring Curl', 'Day 1\nSquat 4x8\nBench Press 4x8')).toBe(false)
  })
})

describe('flagUntraceableExercises', () => {
  it('sets traceableInDocument per exercise based on its originating chunk text', () => {
    const blueprint = [
      {
        dayIndex: 0,
        weekIndex: 0,
        title: 'Day 1',
        sourceChunkIndex: 0,
        blocks: [
          { name: 'Main', focusType: 'FULL_BODY', exercises: [{ name: 'Squat' }, { name: 'Nordic Hamstring Curl' }] },
        ],
      },
    ]
    const chunks = ['Day 1\nSquat 4x8']

    const flagged = flagUntraceableExercises(blueprint as any, chunks)

    expect(flagged[0].blocks[0].exercises[0].traceableInDocument).toBe(true)
    expect(flagged[0].blocks[0].exercises[1].traceableInDocument).toBe(false)
  })

  it('defaults to traceable when a session has no resolvable chunk index', () => {
    const blueprint = [
      { dayIndex: 0, weekIndex: 0, title: 'Day 1', blocks: [{ name: 'Main', focusType: 'FULL_BODY', exercises: [{ name: 'Squat' }] }] },
    ]
    const flagged = flagUntraceableExercises(blueprint as any, [])
    expect(flagged[0].blocks[0].exercises[0].traceableInDocument).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts -t "isExerciseTraceableInDocument|flagUntraceableExercises"`
Expected: FAIL — neither function is exported yet.

- [ ] **Step 3: Add `sourceChunkIndex` tracking and the fidelity-check functions**

In `lib/services/program-brief.service.ts`:

1. Update the `RawSession` type (lines 62-67) to add `sourceChunkIndex`:

```ts
export type RawSession = {
  weekLabel: string | null;
  dayLabel: string | null;
  title: string;
  blocks: BlockBlueprint[];
  sourceChunkIndex: number;
};
```

2. Update `ExerciseBlueprint` (lines 41-47) to add the new optional flag field:

```ts
export type ExerciseBlueprint = {
  name: string;
  sets?: number;
  reps?: number;
  durationSeconds?: number;
  notes?: string;
  traceableInDocument?: boolean;
};
```

3. Update `SessionBlueprint` (lines 55-60) to carry the source chunk index through:

```ts
export type SessionBlueprint = {
  dayIndex: number;
  weekIndex?: number;
  title: string;
  blocks: BlockBlueprint[];
  sourceChunkIndex?: number;
};
```

4. In `mergeChunkSessions` (lines 161-229), update both `sessionBlueprint.push(...)` call sites to carry `sourceChunkIndex` through from `s` (the `withCarriedLabel` item, which already has it via the object spread at line 181):

Replace line 209:
```ts
      sessionBlueprint.push({ dayIndex, weekIndex, title: s.title, blocks: s.blocks });
```
with:
```ts
      sessionBlueprint.push({ dayIndex, weekIndex, title: s.title, blocks: s.blocks, sourceChunkIndex: s.sourceChunkIndex });
```

Replace lines 212-217:
```ts
      sessionBlueprint.push({
        dayIndex: i % perWeek,
        weekIndex: Math.floor(i / perWeek),
        title: s.title,
        blocks: s.blocks,
      });
```
with:
```ts
      sessionBlueprint.push({
        dayIndex: i % perWeek,
        weekIndex: Math.floor(i / perWeek),
        title: s.title,
        blocks: s.blocks,
        sourceChunkIndex: s.sourceChunkIndex,
      });
```

5. Add the import for `normalizeExerciseName` at the top of the file, after the existing imports (line 4):

```ts
import { normalizeExerciseName } from "./ai.service";
```

6. Add the two new exported functions right after `deriveCircuitsFromSessions` (after its closing `}` at line 250, before `export type BriefMetadata = {` at line 252):

```ts
/**
 * Checks whether an extracted exercise name is actually traceable back to the
 * chunk of source text it was extracted from — a guard against the extraction
 * LLM inventing an exercise the document never mentioned.
 */
export function isExerciseTraceableInDocument(exerciseName: string, sourceText: string): boolean {
  const normalizedName = normalizeExerciseName(exerciseName);
  if (!normalizedName) return true;

  const normalizedSource = normalizeExerciseName(sourceText);
  if (normalizedSource.includes(normalizedName)) return true;

  // Fall back to token overlap for names the model paraphrased slightly
  // (e.g. "DB" expanded to "Dumbbell") — require most of the exercise name's
  // distinctive (length > 2) tokens to appear somewhere in the source chunk.
  const nameTokens = normalizedName.split(" ").filter((t) => t.length > 2);
  if (!nameTokens.length) return true;

  const sourceTokens = new Set(normalizedSource.split(" "));
  const matched = nameTokens.filter((t) => sourceTokens.has(t)).length;
  return matched / nameTokens.length >= 0.6;
}

/**
 * Sets `traceableInDocument` on every exercise in the blueprint by checking it
 * against the raw text of the chunk it was extracted from.
 */
export function flagUntraceableExercises(
  sessionBlueprint: SessionBlueprint[],
  chunks: string[]
): SessionBlueprint[] {
  return sessionBlueprint.map((session) => {
    const sourceText =
      session.sourceChunkIndex != null ? (chunks[session.sourceChunkIndex] ?? "") : "";
    return {
      ...session,
      blocks: session.blocks.map((block) => ({
        ...block,
        exercises: block.exercises.map((exercise) => ({
          ...exercise,
          traceableInDocument: sourceText ? isExerciseTraceableInDocument(exercise.name, sourceText) : true,
        })),
      })),
    };
  });
}
```

7. In `parseProgramBrief` (lines 482-578), tag each chunk's sessions with their chunk index, and apply the fidelity flagging before returning.

Replace the `mapWithConcurrency` callback body (lines 512-534):
```ts
  const chunkResults = await mapWithConcurrency(chunks, MAX_CONCURRENT_CHUNKS, async (chunk, index) => {
    const continuityNote = lastSessionNote
      ? `The previous chunk's last session was: ${lastSessionNote}.`
      : null;
    try {
      const result = await extractChunkSessions(chunk, index, chunks.length, continuityNote);
      if (result.sessions.length) {
        lastSessionNote = sessionSummary(result.sessions[result.sessions.length - 1]);
      }
      return result;
    } catch {
      try {
        return await extractChunkSessions(chunk, index, chunks.length, continuityNote);
      } catch {
        return {
          sessions: [],
          warnings: [
            `Couldn't parse part of the document (section ${index + 1} of ${chunks.length}) — please review that section manually.`,
          ],
        };
      }
    }
  });
```
with (adds `sourceChunkIndex: index` onto every session returned for this chunk):
```ts
  const chunkResults = await mapWithConcurrency(chunks, MAX_CONCURRENT_CHUNKS, async (chunk, index) => {
    const continuityNote = lastSessionNote
      ? `The previous chunk's last session was: ${lastSessionNote}.`
      : null;
    const tagWithChunk = (result: ChunkExtractionResult): ChunkExtractionResult => ({
      ...result,
      sessions: result.sessions.map((s) => ({ ...s, sourceChunkIndex: index })),
    });
    try {
      const result = await extractChunkSessions(chunk, index, chunks.length, continuityNote);
      if (result.sessions.length) {
        lastSessionNote = sessionSummary(result.sessions[result.sessions.length - 1]);
      }
      return tagWithChunk(result);
    } catch {
      try {
        return tagWithChunk(await extractChunkSessions(chunk, index, chunks.length, continuityNote));
      } catch {
        return {
          sessions: [],
          warnings: [
            `Couldn't parse part of the document (section ${index + 1} of ${chunks.length}) — please review that section manually.`,
          ],
        };
      }
    }
  });
```

Then, right after the `mergeChunkSessions` call (lines 536-539) and before `if (!sessionBlueprint.length)` (line 541), add:

```ts
  const flaggedSessionBlueprint = flagUntraceableExercises(sessionBlueprint, chunks);
```

Finally, in the returned object (line 573), replace `sessionBlueprint,` with `sessionBlueprint: flaggedSessionBlueprint,`. Also replace the `programTitle` fallback at line 566 (`sessionBlueprint[0].title`) with `flaggedSessionBlueprint[0].title` for consistency (same data, flagged variant is now the canonical one).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts`
Expected: PASS for all tests, including the new ones and every pre-existing `parseProgramBrief`/`mergeChunkSessions` test (they don't assert on `traceableInDocument` or `sourceChunkIndex`, so adding the fields doesn't break them).

- [ ] **Step 5: Commit**

```bash
git add lib/services/program-brief.service.ts lib/services/__tests__/program-brief.service.test.ts
git commit -m "feat: flag exercises not traceable to their source document text"
```

---

## Task 3: Preview builder with flags in `ai.service.ts`

**Files:**
- Modify: `lib/services/ai.service.ts` (interfaces around lines 929-960, `generateProgram` at lines 972-1085)
- Test: `lib/services/__tests__/ai.service.test.ts`

**Interfaces:**
- Consumes: `resolveExerciseMatch`, `ExerciseMatchFlag`, `ExerciseMatchCandidate` (Task 1), `normalizeExerciseName` (Task 1).
- Produces: `export async function buildProgramPreviewFromBlueprint(params: { sessionBlueprint: BlueprintSession[]; circuits?: CircuitConfig[]; preferredWeekdays?: string[]; programTitle?: string }): Promise<PreviewGeneratedProgram>`, plus the new isolated types `PreviewExercise`, `PreviewBlock`, `PreviewWorkout`, `PreviewGeneratedProgram` (exerciseId nullable, `flags`/`matchCandidates` always present). `GeneratedExercise`, `GeneratedProgramWorkoutBlock`, `GeneratedProgram`, and `generateProgram` are NOT widened or modified — they remain byte-for-byte identical to their pre-task form, since those are the "ready to save" contract other code (Prisma writes, other actions) depends on. This task is still additive to the old `sessionBlueprint` branch of `generateWorkoutPlan` (removed in Task 5) — both code paths coexist and both compile/pass tests after this task.

- [ ] **Step 1: Write the failing test for `buildProgramPreviewFromBlueprint`**

Add to `lib/services/__tests__/ai.service.test.ts`, extend the import line to:

```ts
import { resolveExerciseByName, resolveExerciseMatch, generateWorkoutPlan, buildProgramPreviewFromBlueprint } from '../ai.service'
```

Add a new `describe` block at the end of the file (after the existing `describe('generateWorkoutPlan (sessionBlueprint path)', ...)` block):

```ts
describe('buildProgramPreviewFromBlueprint', () => {
  it('auto-accepts an exact match with no flags, no AI call', async () => {
    const squat = exercise({ id: 'sq1', name: 'Back Squat', defaultSets: 4, defaultReps: 8 })
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([squat])

    const result = await buildProgramPreviewFromBlueprint({
      circuits: [{ name: 'Strength Block A', focusType: 'LOWER_BODY', exerciseCount: 1 }],
      preferredWeekdays: ['Monday'],
      programTitle: 'Test Program',
      sessionBlueprint: [
        {
          dayIndex: 0,
          weekIndex: 0,
          title: 'Lower Body A',
          blocks: [{ name: 'Strength Block A', exercises: [{ name: 'Back Squat', sets: 4, reps: 8 }] }],
        },
      ],
    })

    expect(mockCreate).not.toHaveBeenCalled()
    const ex = result.workouts[0].blocks[0].exercises[0]
    expect(ex.exerciseId).toBe('sq1')
    expect(ex.flags).toEqual([])
  })

  it('flags an unmatched exercise as not_in_library with a null exerciseId instead of dropping it', async () => {
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([])

    const result = await buildProgramPreviewFromBlueprint({
      circuits: [{ name: 'Strength Block A', focusType: 'LOWER_BODY', exerciseCount: 1 }],
      preferredWeekdays: ['Monday'],
      sessionBlueprint: [
        {
          dayIndex: 0,
          weekIndex: 0,
          title: 'Lower Body A',
          blocks: [{ name: 'Strength Block A', exercises: [{ name: 'Nonexistent Move' }] }],
        },
      ],
    })

    expect(result.workouts).toHaveLength(1)
    const ex = result.workouts[0].blocks[0].exercises[0]
    expect(ex.exerciseId).toBeNull()
    expect(ex.flags).toEqual(['not_in_library'])
  })

  it('adds a not_in_document flag alongside a library flag when the exercise is untraceable', async () => {
    const squat = exercise({ id: 'sq1', name: 'Squat' })
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([squat])

    const result = await buildProgramPreviewFromBlueprint({
      circuits: [{ name: 'Strength Block A', focusType: 'LOWER_BODY', exerciseCount: 1 }],
      preferredWeekdays: ['Monday'],
      sessionBlueprint: [
        {
          dayIndex: 0,
          weekIndex: 0,
          title: 'Lower Body A',
          blocks: [
            {
              name: 'Strength Block A',
              exercises: [{ name: 'Nordic Hamstring Curl', traceableInDocument: false } as any],
            },
          ],
        },
      ],
    })

    const ex = result.workouts[0].blocks[0].exercises[0]
    expect(ex.flags).toContain('not_in_document')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/ai.service.test.ts -t "buildProgramPreviewFromBlueprint"`
Expected: FAIL — `buildProgramPreviewFromBlueprint` is not exported yet.

- [ ] **Step 3: Implement `buildProgramPreviewFromBlueprint` with its own isolated preview types**

**Do not modify `GeneratedExercise`, `GeneratedProgramWorkoutBlock`, `GeneratedProgram`, or `generateProgram` at all.** Those types are the "ready to save" contract: `GeneratedProgram` flows into `createProgramFromGeneratedPlan` (Task 5), which writes `exerciseId` into Prisma's `BlockExerciseV2.exerciseId` — a required, non-nullable field — and `generateProgram`/`GeneratedExercise` are also used by two other live call sites outside this task's files (`actions/global-program-actions.ts`, `actions/workout-actions.ts`) that all assume non-null `exerciseId`. Widening `exerciseId` to `string | null` on those shared types breaks those consumers' type-checking even though this task doesn't touch their files. Keep them exactly as they are today.

Instead, add a **separate, new set of types** for the preview/matching stage, where an unresolved `exerciseId` genuinely can be `null` until the trainer resolves it in the review screen (a later task). In `lib/services/ai.service.ts`, add the following after the `resolveExerciseMatch` function from Task 1 (i.e. after its closing `}`, before `const EXERCISE_POOL_SELECT = {`):

```ts
export type PreviewExercise = {
  exerciseId: string | null;
  exerciseName?: string;
  orderIndex: number;
  sets: number;
  reps: string;
  notes?: string;
  restSeconds?: number;
  flags: ExerciseMatchFlag[];
  matchCandidates: ExerciseMatchCandidate[];
};

export type PreviewBlock = {
  type: string;
  name?: string;
  circuitIndex?: number;
  orderIndex: number;
  rounds?: number;
  restBetweenRounds?: number | null;
  exercises: PreviewExercise[];
};

export type PreviewWorkout = {
  name: string;
  dayIndex: number;
  weekIndex: number;
  blocks: PreviewBlock[];
};

export type PreviewGeneratedProgram = {
  name: string;
  description?: string;
  workouts: PreviewWorkout[];
};
```

Then add `buildProgramPreviewFromBlueprint` itself, plus its own private, self-contained workout/block assembly helper (a deliberate near-duplicate of `generateProgram`'s existing circuit-grouping logic, scoped only to this function — do NOT extract or share it with `generateProgram`, precisely to avoid the type-widening risk above). Add this near the end of the file, after the existing `generateProgram` function (after its closing `}`, before `export async function generateClinicalPlan`):

```ts
type BlueprintExercise = {
  name: string;
  sets?: number;
  reps?: number;
  durationSeconds?: number;
  notes?: string;
  traceableInDocument?: boolean;
};
type BlueprintBlock = { name: string; exercises: BlueprintExercise[] };
type BlueprintSession = { dayIndex: number; weekIndex?: number; title: string; blocks: BlueprintBlock[] };

function assemblePreviewWorkouts(
  sessions: { dayOfWeek: number; weekIndex: number; name: string }[],
  exercises: (PreviewExercise & { dayOfWeek: number; weekIndex: number; circuitIndex: number; phase: string })[],
  circuits: CircuitConfig[]
): PreviewWorkout[] {
  const hasCircuits = circuits.length > 0;
  const sessionNameMap = new Map<string, string>(sessions.map((s) => [`${s.weekIndex}_${s.dayOfWeek}`, s.name]));
  const workoutsMap = new Map<string, PreviewWorkout>();

  exercises.forEach((ex) => {
    const key = `${ex.weekIndex}_${ex.dayOfWeek}`;
    if (!workoutsMap.has(key)) {
      const sessionNum = workoutsMap.size;
      workoutsMap.set(key, {
        name: sessionNameMap.get(key) ?? `Session ${sessionNum + 1}`,
        dayIndex: ex.dayOfWeek,
        weekIndex: ex.weekIndex,
        blocks: [],
      });
    }
    const workout = workoutsMap.get(key)!;

    if (hasCircuits) {
      const circuitIdx = Math.max(0, Math.min(ex.circuitIndex, circuits.length - 1));
      const circuitConfig = circuits[circuitIdx];

      let block = workout.blocks.find((b) => b.circuitIndex === circuitIdx);
      if (!block) {
        block = {
          type: circuitFocusToBlockType(circuitConfig.focusType),
          name: circuitConfig.name,
          circuitIndex: circuitIdx,
          orderIndex: circuitIdx,
          rounds: circuitConfig.rounds ?? defaultRoundsForFocusType(circuitConfig.focusType),
          restBetweenRounds: circuitConfig.restBetweenRounds ?? null,
          exercises: [],
        };
        workout.blocks.push(block);
      }

      block.exercises.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        orderIndex: block.exercises.length,
        sets: 1,
        reps: ex.reps,
        notes: ex.notes,
        restSeconds: ex.restSeconds,
        flags: ex.flags,
        matchCandidates: ex.matchCandidates,
      });
    } else {
      let targetType = ex.phase.toUpperCase();
      if (["ACTIVATION", "STRENGTHENING", "MOBILITY"].includes(targetType)) targetType = "NORMAL";

      let block = workout.blocks.find((b) => b.type === targetType && b.circuitIndex === undefined);
      if (!block) {
        block = {
          type: ["WARMUP", "COOLDOWN", "SUPERSET", "CIRCUIT", "AMRAP", "EMOM"].includes(targetType) ? targetType : "NORMAL",
          orderIndex: workout.blocks.length,
          exercises: [],
        };
        workout.blocks.push(block);
      }

      block.exercises.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        orderIndex: block.exercises.length,
        sets: ex.sets,
        reps: ex.reps,
        notes: ex.notes,
        restSeconds: ex.restSeconds,
        flags: ex.flags,
        matchCandidates: ex.matchCandidates,
      });
    }
  });

  for (const workout of workoutsMap.values()) {
    workout.blocks.sort((a, b) => a.orderIndex - b.orderIndex);
  }
  return Array.from(workoutsMap.values()).sort((a, b) =>
    a.weekIndex !== b.weekIndex ? a.weekIndex - b.weekIndex : a.dayIndex - b.dayIndex
  );
}

/**
 * Builds a program preview directly from a parsed brief's session blueprint,
 * using deterministic exercise matching (no LLM calls). Unmatched or
 * low-confidence exercises are kept in the output with `flags` set instead of
 * being silently substituted or dropped — the trainer resolves them in the
 * review screen before the program can be saved. Returns `PreviewGeneratedProgram`
 * (nullable `exerciseId`, always-present `flags`), a deliberately separate type
 * from `GeneratedProgram` (non-null `exerciseId`, the "ready to save" contract) —
 * a later task (client-side, after the trainer resolves every flag) converts a
 * resolved preview into a plain `GeneratedProgram` before calling the save action.
 */
export async function buildProgramPreviewFromBlueprint(params: {
  sessionBlueprint: BlueprintSession[];
  circuits?: CircuitConfig[];
  preferredWeekdays?: string[];
  programTitle?: string;
}): Promise<PreviewGeneratedProgram> {
  const weekdayToIndex: Record<string, number> = {
    monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
  };

  const circuits = params.circuits || [];
  const circuitNameMap = new Map(circuits.map((c, idx) => [normalizeExerciseName(c.name), idx]));

  const allBriefExercises = await prisma.exercise.findMany({ where: { isActive: true } });

  const preferredDayIndices = (params.preferredWeekdays ?? [])
    .map((d) => weekdayToIndex[d.toLowerCase().trim()])
    .filter((d): d is number => Number.isInteger(d));

  function toActualDayOfWeek(dayIndex: number): number {
    if (preferredDayIndices.length === 0) return dayIndex;
    return preferredDayIndices[dayIndex % preferredDayIndices.length];
  }

  const sessions = params.sessionBlueprint.map((s) => ({
    dayOfWeek: toActualDayOfWeek(s.dayIndex),
    weekIndex: s.weekIndex ?? 0,
    name: s.title,
  }));

  const exercisesOutput: (PreviewExercise & { dayOfWeek: number; weekIndex: number; circuitIndex: number; phase: string })[] = [];

  for (const session of params.sessionBlueprint) {
    let orderIndex = 0;
    for (let blockIdx = 0; blockIdx < session.blocks.length; blockIdx += 1) {
      const block = session.blocks[blockIdx];
      const blockKey = normalizeExerciseName(block.name);
      const circuitIndex = circuitNameMap.get(blockKey) ?? Math.min(blockIdx, Math.max(0, circuits.length - 1));

      for (const exerciseBp of block.exercises) {
        const match = resolveExerciseMatch(exerciseBp.name, allBriefExercises);
        const flags: ExerciseMatchFlag[] = [];
        if (match.matchType === "needs_review") flags.push("needs_review");
        if (match.matchType === "not_in_library") flags.push("not_in_library");
        if (exerciseBp.traceableInDocument === false) flags.push("not_in_document");

        const matchedExercise = match.exerciseId
          ? (allBriefExercises.find((e) => e.id === match.exerciseId) ?? null)
          : null;

        const sets = exerciseBp.sets ?? matchedExercise?.defaultSets ?? 3;
        const hasDuration =
          exerciseBp.durationSeconds != null ||
          (exerciseBp.reps == null && matchedExercise?.defaultHoldSeconds != null);
        const repsValue = hasDuration ? undefined : (exerciseBp.reps ?? matchedExercise?.defaultReps ?? 10);
        const durationSeconds =
          exerciseBp.durationSeconds ??
          (hasDuration ? (matchedExercise?.defaultHoldSeconds ?? undefined) : undefined);
        const reps = repsValue != null ? repsValue.toString() : durationSeconds != null ? `${durationSeconds}s` : "10";

        const focusType = circuits[circuitIndex]?.focusType?.toUpperCase();
        const phase =
          focusType === "WARMUP" ? "WARMUP" :
          focusType === "COOLDOWN" ? "COOLDOWN" :
          focusType === "FLEXIBILITY" ? "MOBILITY" :
          focusType === "CARDIO" ? "ACTIVATION" :
          focusType === "BALANCE" ? "ACTIVATION" : "STRENGTHENING";

        exercisesOutput.push({
          exerciseId: match.exerciseId,
          exerciseName: matchedExercise?.name ?? exerciseBp.name,
          phase,
          circuitIndex,
          sets,
          reps,
          restSeconds: undefined,
          weekIndex: session.weekIndex ?? 0,
          dayOfWeek: toActualDayOfWeek(session.dayIndex),
          orderIndex: orderIndex++,
          notes: exerciseBp.notes ?? undefined,
          flags,
          matchCandidates: match.candidates,
        });
      }
    }
  }

  const programTitle = params.programTitle || "Athletic Program";
  const description = "Generated from uploaded brief";
  const workouts = assemblePreviewWorkouts(sessions, exercisesOutput, circuits);

  return { name: programTitle, description, workouts };
}
```

Note: `sets`/`reps` on `PreviewExercise` are `number`/`string` per the type above — `sets` is a plain number (not stringified) and `reps` is pre-stringified into its final display form (either the rep count or `"Ns"` for a duration) before being pushed, so `assemblePreviewWorkouts` just copies them through unchanged (unlike `generateProgram`'s existing assembly step, which does that stringification itself — here it happens earlier, in the exercise-building loop, since this is a single self-contained function rather than a two-stage pipeline).

This produces `buildProgramPreviewFromBlueprint`/`PreviewGeneratedProgram` fully isolated from `GeneratedProgram`/`generateProgram` — zero changes to any type or function outside this new code, so nothing outside `lib/services/ai.service.ts` is affected by this task.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/ai.service.test.ts`
Expected: PASS for all tests — the pre-existing `generateWorkoutPlan`/`generateProgram` tests for the weekPlan and general paths must still pass unchanged (they don't reference `flags`/`matchCandidates`), plus the new `buildProgramPreviewFromBlueprint` tests.

- [ ] **Step 5: Commit**

```bash
git add lib/services/ai.service.ts lib/services/__tests__/ai.service.test.ts
git commit -m "feat: add flag-aware program preview builder using deterministic exercise matching"
```

---

## Task 4: Dedicated Zod schema for the generated-program shape

**Files:**
- Create: `lib/validators/generated-program.ts`
- Test: `lib/validators/__tests__/generated-program.test.ts`

**Interfaces:**
- Produces: `export const generatedProgramSchema` (Zod schema matching `GeneratedProgram`'s actual flat `sets: number, reps: string` shape — NOT `createProgramSchema`, which validates the manual builder's different nested-set shape and doesn't match this data).
- Consumed by: Task 5's `createProgramFromGeneratedPlan`.

- [ ] **Step 1: Write the failing test**

Create `lib/validators/__tests__/generated-program.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generatedProgramSchema } from '../generated-program'

function validProgram() {
  return {
    name: 'Offseason Strength',
    description: 'Generated from uploaded brief',
    workouts: [
      {
        name: 'Lower Body A',
        dayIndex: 0,
        weekIndex: 0,
        blocks: [
          {
            type: 'NORMAL',
            orderIndex: 0,
            exercises: [
              { exerciseId: 'ex1', exerciseName: 'Squat', orderIndex: 0, sets: 4, reps: '8' },
            ],
          },
        ],
      },
    ],
  }
}

describe('generatedProgramSchema', () => {
  it('accepts a well-formed generated program', () => {
    const result = generatedProgramSchema.safeParse(validProgram())
    expect(result.success).toBe(true)
  })

  it('rejects a program with no workouts', () => {
    const input = { ...validProgram(), workouts: [] }
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects a workout with no blocks', () => {
    const input = validProgram()
    input.workouts[0].blocks = []
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects a block with no exercises', () => {
    const input = validProgram()
    input.workouts[0].blocks[0].exercises = []
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects an exercise with a null exerciseId (unresolved flag slipped through)', () => {
    const input: any = validProgram()
    input.workouts[0].blocks[0].exercises[0].exerciseId = null
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects an exercise with zero sets', () => {
    const input = validProgram()
    input.workouts[0].blocks[0].exercises[0].sets = 0
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects a program with no name', () => {
    const input = { ...validProgram(), name: '' }
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validators/__tests__/generated-program.test.ts`
Expected: FAIL — `lib/validators/generated-program.ts` doesn't exist yet.

- [ ] **Step 3: Implement the schema**

Create `lib/validators/generated-program.ts`:

```ts
import { z } from "zod";

// Validates the shape produced by lib/services/ai.service.ts's GeneratedProgram
// (flat sets: number / reps: string per exercise) — distinct from
// lib/validators/program.ts's createProgramSchema, which validates the manual
// builder's different nested-set-array shape and does not match this data.
export const generatedProgramExerciseSchema = z.object({
  exerciseId: z.string().min(1, "Exercise is required"),
  exerciseName: z.string().optional(),
  orderIndex: z.number().int().min(0),
  sets: z.number().int().min(1),
  reps: z.string().min(1),
  notes: z.string().optional(),
  restSeconds: z.number().int().min(0).optional(),
});

export const generatedProgramBlockSchema = z.object({
  type: z.string().min(1),
  name: z.string().optional(),
  circuitIndex: z.number().int().optional(),
  orderIndex: z.number().int().min(0),
  rounds: z.number().int().min(1).optional(),
  restBetweenRounds: z.number().int().min(0).nullable().optional(),
  exercises: z.array(generatedProgramExerciseSchema).min(1, "Each block needs at least one exercise"),
});

export const generatedProgramWorkoutSchema = z.object({
  name: z.string().min(1),
  dayIndex: z.number().int().min(0),
  weekIndex: z.number().int().min(0),
  blocks: z.array(generatedProgramBlockSchema).min(1, "Each workout needs at least one block"),
});

export const generatedProgramSchema = z.object({
  name: z.string().min(1, "Program name is required"),
  description: z.string().optional(),
  workouts: z.array(generatedProgramWorkoutSchema).min(1, "Program must include at least one workout"),
  warnings: z.array(z.string()).optional(),
});

export type GeneratedProgramInput = z.infer<typeof generatedProgramSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/validators/__tests__/generated-program.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validators/generated-program.ts lib/validators/__tests__/generated-program.test.ts
git commit -m "feat: add Zod schema for validating AI-generated program plans before save"
```

---

## Task 5: Staged server actions, durationWeeks persistence fix, and dead-code removal

**Files:**
- Modify: `actions/program-actions.ts` (imports, `createProgramFromGeneratedPlan` at lines 47-168, `extractProgramMetadataFromBriefAction` at lines 462-480, `generateProgramPreviewFromBriefAction` at lines 482-538, `saveGeneratedProgramAction` at lines 540-569)
- Modify: `lib/services/ai.service.ts` (remove dead code: `pickClosestExerciseNameAI`, `resolveExerciseByName`, the `sessionBlueprint` branch of `generateWorkoutPlan`, the now-unused `sessionBlueprint` field on `GenerateWorkoutParams`)
- Modify: `lib/services/__tests__/ai.service.test.ts` (remove the now-obsolete `resolveExerciseByName` and `generateWorkoutPlan (sessionBlueprint path)` describe blocks — their replacements already exist from Tasks 1 and 3)
- Test: no new test file — this task is verified via the existing `ai.service.test.ts` (after obsolete blocks are removed) plus a new focused test file for `createProgramFromGeneratedPlan`'s persistence fix

**Interfaces:**
- Consumes: `buildProgramPreviewFromBlueprint` (Task 3), `resolveExerciseMatch` (Task 1), `parseProgramBrief` (unchanged, now flags exercises per Task 2), `generatedProgramSchema` (Task 4).
- Produces new server actions: `extractProgramChunksAction(input: { rawText: string; metadata: BriefMetadata }): Promise<{ success: true; data: ProgramBriefParsed } | { success: false; error: string }>`, `matchProgramExercisesAction(input: { brief: ProgramBriefParsed }): Promise<{ success: true; data: { preview: PreviewGeneratedProgram; params: Record<string, unknown>; parsed: ProgramBriefParsed; warnings: string[] } } | { success: false; error: string }>` (note: `preview` is `PreviewGeneratedProgram` — Task 3's isolated preview type with nullable `exerciseId` and always-present `flags`/`matchCandidates` per exercise — not `GeneratedProgram`; no explicit type annotation is needed in the action's return since TypeScript infers it from `buildProgramPreviewFromBlueprint`'s return type). Modifies `extractProgramMetadataFromBriefAction`'s return shape to add `missingRequiredFields: string[]`. Removes `generateProgramPreviewFromBriefAction` (replaced by the two actions above).

- [ ] **Step 1: Write the failing test for the `durationWeeks`/`daysPerWeek` persistence fix**

Create `actions/__tests__/program-actions-persistence.test.ts` (this directory doesn't exist yet in the repo — create it) — this tests the pure computation logic extracted for clarity, since the full `createProgramFromGeneratedPlan` requires a live Prisma/Clerk mock setup that doesn't exist yet in this codebase's test suite for `actions/program-actions.ts`, so we test the computation as a standalone exported helper instead of the full action:

```ts
import { describe, it, expect } from 'vitest'
import { computeDurationWeeksFromWorkouts } from '../program-actions'

describe('computeDurationWeeksFromWorkouts', () => {
  it('returns max weekIndex + 1 across all workouts', () => {
    const workouts = [{ weekIndex: 0 }, { weekIndex: 2 }, { weekIndex: 1 }] as any
    expect(computeDurationWeeksFromWorkouts(workouts)).toBe(3)
  })

  it('returns 1 for a single-week program', () => {
    const workouts = [{ weekIndex: 0 }, { weekIndex: 0 }] as any
    expect(computeDurationWeeksFromWorkouts(workouts)).toBe(1)
  })

  it('returns null for an empty workouts array', () => {
    expect(computeDurationWeeksFromWorkouts([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run actions/__tests__/program-actions-persistence.test.ts`
Expected: FAIL — `computeDurationWeeksFromWorkouts` is not exported from `../program-actions` yet.

- [ ] **Step 3: Modify `actions/program-actions.ts`**

1. Update imports (lines 1-38) — replace:

```ts
import { generateProgram, type GeneratedProgram } from "@/lib/services/ai.service";
import {
  extractProgramBriefText,
  extractBriefMetadata,
  parseProgramBrief,
  type BriefMetadata,
} from "@/lib/services/program-brief.service";
```

with:

```ts
import {
  generateProgram,
  buildProgramPreviewFromBlueprint,
  type GeneratedProgram,
} from "@/lib/services/ai.service";
import {
  extractProgramBriefText,
  extractBriefMetadata,
  parseProgramBrief,
  type BriefMetadata,
  type ProgramBriefParsed,
} from "@/lib/services/program-brief.service";
import { generatedProgramSchema } from "@/lib/validators/generated-program";
```

2. Add the extracted, exported computation helper right before `createProgramFromGeneratedPlan` (before line 47):

```ts
export function computeDurationWeeksFromWorkouts(
  workouts: { weekIndex: number }[]
): number | null {
  if (!workouts.length) return null;
  return Math.max(...workouts.map((w) => w.weekIndex)) + 1;
}
```

3. In `createProgramFromGeneratedPlan` (lines 47-76), add schema validation and set `durationWeeks`/`daysPerWeek`. Replace:

```ts
async function createProgramFromGeneratedPlan(params: {
  aiPlan: GeneratedProgram;
  trainerId: string | null;
  isGlobal?: boolean;
  isTemplate: boolean;
  aiGenerationParams: Record<string, unknown>;
  clientId?: string | null;
  startDate?: string | null;
}) {
  const { aiPlan, trainerId, isTemplate, aiGenerationParams, clientId, startDate } = params;

  const sDate = startDate
    ? (() => { const [y, m, d] = startDate.split("-").map(Number); return new Date(y, m - 1, d); })()
    : null;

  // Round 1: program shell only — no nested creates
  const program = await prisma.program.create({
    data: {
      name: aiPlan.name,
      description: aiPlan.description || "Generated by AI",
      isTemplate: !clientId && isTemplate,
      isGlobal: params.isGlobal ?? false,
      trainerId,
      clientId: clientId ?? null,
      status: clientId ? "ACTIVE" : "DRAFT",
      startDate: sDate ?? undefined,
      aiGenerationParams: aiGenerationParams as import("@prisma/client").Prisma.InputJsonValue,
    },
    select: { id: true },
  });
```

with:

```ts
async function createProgramFromGeneratedPlan(params: {
  aiPlan: GeneratedProgram;
  trainerId: string | null;
  isGlobal?: boolean;
  isTemplate: boolean;
  aiGenerationParams: Record<string, unknown>;
  clientId?: string | null;
  startDate?: string | null;
}) {
  const { aiPlan, trainerId, isTemplate, aiGenerationParams, clientId, startDate } = params;

  const validation = generatedProgramSchema.safeParse(aiPlan);
  if (!validation.success) {
    throw new Error(`Invalid generated program: ${validation.error.issues[0].message}`);
  }

  const sDate = startDate
    ? (() => { const [y, m, d] = startDate.split("-").map(Number); return new Date(y, m - 1, d); })()
    : null;

  const durationWeeks = computeDurationWeeksFromWorkouts(aiPlan.workouts);
  const daysPerWeek =
    typeof aiGenerationParams.daysPerWeek === "number" ? aiGenerationParams.daysPerWeek : null;

  // Round 1: program shell only — no nested creates
  const program = await prisma.program.create({
    data: {
      name: aiPlan.name,
      description: aiPlan.description || "Generated by AI",
      isTemplate: !clientId && isTemplate,
      isGlobal: params.isGlobal ?? false,
      trainerId,
      clientId: clientId ?? null,
      status: clientId ? "ACTIVE" : "DRAFT",
      durationWeeks,
      daysPerWeek,
      startDate: sDate ?? undefined,
      aiGenerationParams: aiGenerationParams as import("@prisma/client").Prisma.InputJsonValue,
    },
    select: { id: true },
  });
```

4. Replace `extractProgramMetadataFromBriefAction` (lines 462-480) to compute and return `missingRequiredFields`:

```ts
const REQUIRED_BRIEF_METADATA_FIELDS = ["programTitle", "estimatedDaysPerWeek", "preferredWeekdays"] as const;

export async function extractProgramMetadataFromBriefAction(input: {
  fileUrl: string;
  fileName: string;
}) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const rawText = await extractProgramBriefText(input.fileUrl, input.fileName);
    if (!rawText.trim()) {
      return { success: false as const, error: "The document appears to be empty or unreadable." };
    }
    const metadata = await extractBriefMetadata(rawText);
    const missingRequiredFields = REQUIRED_BRIEF_METADATA_FIELDS.filter((f) =>
      metadata.inferredFields.includes(f)
    );
    return { success: true as const, data: { metadata, rawText, missingRequiredFields } };
  } catch (error) {
    console.error("Failed to extract program metadata from brief:", error);
    return { success: false as const, error: "Failed to read this document" };
  }
}
```

5. Replace `generateProgramPreviewFromBriefAction` (lines 482-538) with two new actions:

```ts
// Stage 2 of the brief-upload flow: chunk + extract every session/exercise
// from the full document. No exercise-library matching happens here — that's
// stage 3 (matchProgramExercisesAction) — so this stays fast and its result
// can be shown as its own progress step.
export async function extractProgramChunksAction(input: {
  rawText: string;
  metadata: BriefMetadata;
}) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const parsed = await parseProgramBrief(input.rawText, input.metadata);
    if (!parsed.ok) {
      return { success: false as const, error: parsed.errors.join("\n") };
    }
    return { success: true as const, data: parsed.data };
  } catch (error) {
    console.error("Failed to extract program chunks from brief:", error);
    return { success: false as const, error: "Failed to extract program structure from this document" };
  }
}

// Stage 3: deterministically match every extracted exercise against the
// exercise library (no LLM calls) and return a preview where unmatched or
// low-confidence exercises carry `flags` instead of being silently
// substituted or dropped.
export async function matchProgramExercisesAction(input: {
  brief: ProgramBriefParsed;
}) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const brief = input.brief;
    if (!brief.sessionBlueprint?.length) {
      return { success: false as const, error: "No training sessions were found to match exercises for" };
    }

    const params = {
      programTitle: brief.programTitle,
      focusAreas: brief.focusAreas,
      durationMinutes: brief.durationMinutes,
      daysPerWeek: brief.daysPerWeek,
      circuits: brief.circuits.map((c) => ({
        name: c.name,
        focusType: c.focusType,
        exerciseCount: c.exerciseCount,
        rounds: c.rounds,
      })),
      difficultyLevel: brief.difficultyLevel,
      preferredWeekdays: brief.preferredWeekdays,
      sessionBlueprint: brief.sessionBlueprint,
    };

    const preview = await buildProgramPreviewFromBlueprint(params);

    return {
      success: true as const,
      data: {
        preview,
        params,
        parsed: brief,
        warnings: Array.from(new Set(brief.warnings ?? [])),
      },
    };
  } catch (error) {
    console.error("Failed to match exercises for brief:", error);
    return { success: false as const, error: "Failed to match exercises against your exercise library" };
  }
}
```

6. In `saveGeneratedProgramAction` (lines 540-569), surface the specific validation error instead of a generic message. Replace the catch block:

```ts
  } catch (error) {
    console.error("Failed to save generated program:", error);
    return { success: false as const, error: "Failed to save program" };
  }
```

with:

```ts
  } catch (error) {
    console.error("Failed to save generated program:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to save program",
    };
  }
```

- [ ] **Step 4: Remove dead code from `lib/services/ai.service.ts`**

1. Delete the `pickClosestExerciseNameAI` function and `resolveExerciseByName` function entirely (the block spanning what was originally lines 246-295 — locate by their exact bodies, now shifted down by Task 1's additions).

2. Delete the `sessionBlueprint?: {...}[]` field from the `GenerateWorkoutParams` interface (originally lines 56-64) since nothing sets it anymore.

3. Delete the entire `if (params.sessionBlueprint?.length) { ... }` branch from `generateWorkoutPlan` (originally lines 573-679) — locate by its opening `if (params.sessionBlueprint?.length) {` line and matching closing brace before the `// Fetch exercises with enriched fields` comment.

- [ ] **Step 5: Remove obsolete tests from `lib/services/__tests__/ai.service.test.ts`**

1. Remove the `describe('resolveExerciseByName', ...)` block (superseded by `describe('resolveExerciseMatch', ...)` from Task 1) and remove `resolveExerciseByName` from the import line.

2. Remove the `describe('generateWorkoutPlan (sessionBlueprint path)', ...)` block (superseded by `describe('buildProgramPreviewFromBlueprint', ...)` from Task 3).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS across all test files — `ai.service.test.ts` (obsolete blocks gone, new ones from Tasks 1/3 remain), `program-brief.service.test.ts` (untouched, still passes), `generated-program.test.ts` (Task 4), the new `actions/__tests__/program-actions-persistence.test.ts`, and every other unrelated existing test file.

Run: `npx tsc --noEmit`
Expected: no type errors — confirms no leftover references to `resolveExerciseByName`, `pickClosestExerciseNameAI`, or `sessionBlueprint` on `GenerateWorkoutParams` anywhere in the codebase (there shouldn't be any per the Task 2 exclusivity check already done).

- [ ] **Step 7: Commit**

```bash
git add actions/program-actions.ts actions/__tests__/program-actions-persistence.test.ts lib/services/ai.service.ts lib/services/__tests__/ai.service.test.ts
git commit -m "feat: split brief-upload into staged actions, fix durationWeeks persistence, remove dead AI-matching code"
```

---

## Task 6: Missing-fields blocking dialog component

**Files:**
- Create: `components/programs/missing-fields-dialog.tsx`

**Interfaces:**
- Produces: `export interface MissingFieldsValues { programTitle: string; daysPerWeek: number; preferredWeekdays: string[] }`, `export function MissingFieldsDialog(props: { open: boolean; missingFields: string[]; initialValues: MissingFieldsValues; onConfirm: (values: MissingFieldsValues) => void }): JSX.Element`.
- Consumed by: Task 10 (`program-brief-upload.tsx`).

- [ ] **Step 1: Create the component**

Create `components/programs/missing-fields-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface MissingFieldsValues {
  programTitle: string;
  daysPerWeek: number;
  preferredWeekdays: string[];
}

interface Props {
  open: boolean;
  missingFields: string[];
  initialValues: MissingFieldsValues;
  onConfirm: (values: MissingFieldsValues) => void;
}

export function MissingFieldsDialog({ open, missingFields, initialValues, onConfirm }: Props) {
  const [title, setTitle] = useState(initialValues.programTitle);
  const [weekdays, setWeekdays] = useState<string[]>(initialValues.preferredWeekdays);

  useEffect(() => {
    if (open) {
      setTitle(initialValues.programTitle);
      setWeekdays(initialValues.preferredWeekdays);
    }
  }, [open, initialValues]);

  const needsTitle = missingFields.includes("programTitle");
  const needsSchedule =
    missingFields.includes("estimatedDaysPerWeek") || missingFields.includes("preferredWeekdays");

  function toggleDay(day: string) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  const canConfirm = (!needsTitle || title.trim().length > 0) && (!needsSchedule || weekdays.length > 0);

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>A few details we couldn&apos;t find</DialogTitle>
          <DialogDescription>
            This document didn&apos;t state everything needed to build the program. Fill these in
            before we generate it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {needsTitle && (
            <div className="space-y-2">
              <Label>Program Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Offseason Strength Block"
              />
            </div>
          )}
          {needsSchedule && (
            <div className="space-y-2">
              <Label>Which days does training happen on?</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const active = weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/60"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {weekdays.length} day{weekdays.length === 1 ? "" : "s"} per week
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                programTitle: title.trim(),
                daysPerWeek: weekdays.length || 1,
                preferredWeekdays: weekdays,
              })
            }
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new type errors from this file.

- [ ] **Step 3: Commit**

```bash
git add components/programs/missing-fields-dialog.tsx
git commit -m "feat: add blocking dialog for confirming required brief-upload fields"
```

---

## Task 7: Flagged-exercise row component

**Files:**
- Create: `components/programs/flagged-exercise-row.tsx`

**Interfaces:**
- Produces: `export type ExerciseMatchFlag = "needs_review" | "not_in_library" | "not_in_document"`, `export function FlaggedExerciseRow(props): JSX.Element` with props `{ exerciseName?: string; sets: number; reps: string; flags: ExerciseMatchFlag[]; hasSuggestion: boolean; resolved: boolean; resolvedLabel?: string; onConfirm: () => void; onPickAlternative: () => void; onSkip: () => void }`.
- Consumed by: Task 10.

- [ ] **Step 1: Create the component**

Create `components/programs/flagged-exercise-row.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, HelpCircle, FileWarning, Check, X } from "lucide-react";

export type ExerciseMatchFlag = "needs_review" | "not_in_library" | "not_in_document";

const FLAG_META: Record<ExerciseMatchFlag, { label: string; icon: typeof AlertTriangle; className: string }> = {
  needs_review: {
    label: "Needs review",
    icon: HelpCircle,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  not_in_library: {
    label: "Not in library",
    icon: AlertTriangle,
    className: "bg-red-50 text-red-700 border-red-200",
  },
  not_in_document: {
    label: "Not in document",
    icon: FileWarning,
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
};

interface Props {
  exerciseName?: string;
  sets: number;
  reps: string;
  flags: ExerciseMatchFlag[];
  hasSuggestion: boolean;
  resolved: boolean;
  resolvedLabel?: string;
  onConfirm: () => void;
  onPickAlternative: () => void;
  onSkip: () => void;
}

export function FlaggedExerciseRow({
  exerciseName,
  sets,
  reps,
  flags,
  hasSuggestion,
  resolved,
  resolvedLabel,
  onConfirm,
  onPickAlternative,
  onSkip,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm">
            {exerciseName} — {sets} x {reps}
          </span>
          {flags.map((flag) => {
            const meta = FLAG_META[flag];
            const Icon = meta.icon;
            return (
              <Badge key={flag} variant="outline" className={`gap-1 text-[10px] ${meta.className}`}>
                <Icon className="h-2.5 w-2.5" />
                {meta.label}
              </Badge>
            );
          })}
        </div>
        {resolved && resolvedLabel && (
          <p className="mt-1 text-xs text-emerald-700">Resolved: {resolvedLabel}</p>
        )}
      </div>
      {!resolved && (
        <div className="flex shrink-0 gap-1.5">
          {hasSuggestion && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onConfirm}>
              <Check className="h-3 w-3" /> Confirm
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPickAlternative}>
            Choose exercise
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={onSkip}>
            <X className="h-3 w-3" /> Skip
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new type errors from this file.

- [ ] **Step 3: Commit**

```bash
git add components/programs/flagged-exercise-row.tsx
git commit -m "feat: add flagged-exercise row component for the brief-upload review screen"
```

---

## Task 8: Fetch exercise library and org context on the upload page

**Files:**
- Modify: `app/(platform)/programs/upload/page.tsx`

**Interfaces:**
- Consumes: `getExercisesForPicker` from `@/lib/services/exercise.service`, `getOrganizationProfile` from `@/actions/organization-actions`.
- Produces: new props passed to `ProgramBriefUpload` — `exercises`, `organizationOrganizationId`, `exerciseSourcePreference` (Task 10 will add these to its `Props` interface).

- [ ] **Step 1: Modify the page**

Replace the full contents of `app/(platform)/programs/upload/page.tsx`:

```tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { getExercisesForPicker } from "@/lib/services/exercise.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { ProgramBriefUpload } from "@/components/programs/program-brief-upload";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Upload Program Brief - Unity Health",
  description: "Upload a program brief file and generate a professional AI program",
};

export default async function ProgramBriefUploadPage() {
  const { userId, orgId: sessionOrgId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, role: true, clerkOrgId: true },
  });

  if (!user || user.role !== "TRAINER") {
    redirect("/dashboard");
  }

  const organizationOrgId = sessionOrgId ?? user.clerkOrgId ?? undefined;

  const [clients, exercises, organizationProfile] = await Promise.all([
    getClientsForTrainer(user.id),
    getExercisesForPicker(organizationOrgId),
    getOrganizationProfile().catch(() => null),
  ]);

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link href="/programs">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Programs
        </Link>
      </Button>
      <PageHeader
        title="Upload Program Brief"
        description="Upload a structured brief and let AI generate a full program for review."
      />
      <div className="max-w-3xl mx-auto">
        <ProgramBriefUpload
          clients={clients}
          exercises={exercises}
          organizationOrganizationId={organizationOrgId}
          exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: This will fail until Task 10 updates `ProgramBriefUpload`'s `Props` interface to accept the three new props — that's expected and resolved by the next task. Verify the failure is specifically about `ProgramBriefUpload`'s prop types, not an unrelated error (e.g. `getExercisesForPicker`/`getOrganizationProfile` import paths resolving correctly).

- [ ] **Step 3: Commit**

```bash
git add "app/(platform)/programs/upload/page.tsx"
git commit -m "feat: fetch exercise library and org context for the brief-upload page"
```

---

## Task 9: Rewrite `program-brief-upload.tsx` — staged flow, missing-fields gate, flag resolution, save gating

**Files:**
- Modify: `components/programs/program-brief-upload.tsx` (full rewrite)

**Interfaces:**
- Consumes: `extractProgramMetadataFromBriefAction`, `extractProgramChunksAction`, `matchProgramExercisesAction`, `saveGeneratedProgramAction` (Task 5), `generateProgramBriefUploadUrlAction` (unchanged), `MissingFieldsDialog` (Task 6), `FlaggedExerciseRow` (Task 7), `ExercisePickerDialog` (existing, `components/programs/exercise-picker-dialog.tsx`).
- This is the terminal task for the client-side flow — after this task the whole feature works end to end (paired with Task 5's backend and Task 8's page).

- [ ] **Step 1: Replace the full file**

Replace the full contents of `components/programs/program-brief-upload.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  generateProgramBriefUploadUrlAction,
  extractProgramMetadataFromBriefAction,
  extractProgramChunksAction,
  matchProgramExercisesAction,
  saveGeneratedProgramAction,
} from "@/actions/program-actions";
import type { BriefMetadata, ProgramBriefParsed } from "@/lib/services/program-brief.service";
import { MissingFieldsDialog, type MissingFieldsValues } from "@/components/programs/missing-fields-dialog";
import { FlaggedExerciseRow, type ExerciseMatchFlag } from "@/components/programs/flagged-exercise-row";
import { ExercisePickerDialog } from "@/components/programs/exercise-picker-dialog";
import type { ExerciseSourcePreference } from "@/lib/utils/exercise-picker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";

interface PickerExercise {
  id: string;
  name: string;
  bodyRegion: string[];
  difficultyLevel: string;
  defaultReps: number | null;
  musclesTargeted: string[];
  description: string | null;
  videoUrl: string | null;
  videoProvider: string | null;
  exercisePhases: string[];
  source: string;
  organizationId: string | null;
  isPublic: boolean;
}

interface Props {
  clients: { id: string; firstName: string; lastName: string }[];
  exercises: PickerExercise[];
  organizationOrganizationId?: string | null;
  exerciseSourcePreference?: ExerciseSourcePreference;
}

type PreviewExercise = {
  exerciseId: string | null;
  exerciseName?: string;
  orderIndex: number;
  sets: number;
  reps: string;
  flags?: ExerciseMatchFlag[];
  matchCandidates?: { exerciseId: string; exerciseName: string; score: number }[];
};

type PreviewBlock = {
  name?: string;
  type: string;
  orderIndex: number;
  exercises: PreviewExercise[];
};

type PreviewWorkout = {
  name: string;
  dayIndex: number;
  weekIndex: number;
  blocks: PreviewBlock[];
};

type PreviewState = {
  aiPlan: { name: string; description?: string; workouts: PreviewWorkout[] };
  params: Record<string, unknown>;
  parsed: {
    programTitle: string;
    focusAreas: string[];
    difficultyLevel: string;
    durationMinutes: number;
    daysPerWeek: number;
    preferredWeekdays: string[];
    circuits: { name: string; focusType: string; exerciseCount: number }[];
    inferredFields?: string[];
  };
  warnings: string[];
};

type Resolution = { exerciseId: string; exerciseName: string } | { skip: true };

type Stage = "idle" | "reading" | "extracting" | "matching" | "ready";

const STAGE_ORDER: Stage[] = ["reading", "extracting", "matching"];
const STAGE_LABELS: Record<string, string> = {
  reading: "Reading document",
  extracting: "Extracting weeks & sessions",
  matching: "Matching exercises",
};

const DIFFICULTY_OPTIONS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

// Schedule is deliberately NOT in here — it gets baked into the generated
// program's day assignments during generation, so it must be confirmed
// BEFORE generation (see the missing-fields dialog), not edited after the fact.
type EditableFields = {
  programTitle: string;
  difficultyLevel: string;
  durationMinutes: string;
  focusAreas: string;
};

function toEditableFields(parsed: PreviewState["parsed"]): EditableFields {
  return {
    programTitle: parsed.programTitle,
    difficultyLevel: parsed.difficultyLevel,
    durationMinutes: String(parsed.durationMinutes),
    focusAreas: parsed.focusAreas.join(", "),
  };
}

type PendingMetadata = {
  rawText: string;
  metadata: BriefMetadata;
  missingRequiredFields: string[];
};

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

function formatFileName(name: string) {
  return name.length > 48 ? `${name.slice(0, 45)}...` : name;
}

function isAllowedFile(file: File) {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function flagKey(workoutIdx: number, blockIdx: number, exIdx: number) {
  return `${workoutIdx}-${blockIdx}-${exIdx}`;
}

function ProgressStepper({ stage }: { stage: Stage }) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  if (currentIndex === -1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {STAGE_ORDER.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-1.5",
              i < currentIndex ? "text-emerald-600" : i === currentIndex ? "font-medium text-blue-600" : "text-muted-foreground"
            )}
          >
            {i < currentIndex ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : i === currentIndex ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="h-4 w-4 rounded-full border" />
            )}
            {STAGE_LABELS[s]}
          </div>
          {i < STAGE_ORDER.length - 1 && <div className="h-px w-6 bg-border" />}
        </div>
      ))}
    </div>
  );
}

export function ProgramBriefUpload({
  clients,
  exercises,
  organizationOrganizationId,
  exerciseSourcePreference,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [editableFields, setEditableFields] = useState<EditableFields | null>(null);
  const [pendingMetadata, setPendingMetadata] = useState<PendingMetadata | null>(null);
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map());
  const [resolverKey, setResolverKey] = useState<string | null>(null);
  const [assignClientId, setAssignClientId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState<"template" | "assign" | null>(null);

  const flaggedSlots = useMemo(() => {
    if (!preview) return [];
    const slots: { key: string; exercise: PreviewExercise }[] = [];
    preview.aiPlan.workouts.forEach((w, wi) =>
      w.blocks.forEach((b, bi) =>
        b.exercises.forEach((e, ei) => {
          if (e.flags && e.flags.length > 0) {
            slots.push({ key: flagKey(wi, bi, ei), exercise: e });
          }
        })
      )
    );
    return slots;
  }, [preview]);

  const unresolvedCount = flaggedSlots.filter((s) => !resolutions.has(s.key)).length;

  // MissingFieldsDialog resets its local state whenever `initialValues`
  // changes identity while open — memoizing here (keyed on pendingMetadata,
  // which only changes once per upload cycle) keeps that identity stable
  // across unrelated re-renders so the trainer's in-progress edits in the
  // dialog are never silently discarded.
  const missingFieldsInitialValues = useMemo(() => {
    if (!pendingMetadata) return null;
    return {
      programTitle: pendingMetadata.metadata.programTitle,
      daysPerWeek: pendingMetadata.metadata.estimatedDaysPerWeek,
      preferredWeekdays: pendingMetadata.metadata.preferredWeekdays,
    };
  }, [pendingMetadata]);

  function handleFileChange(files: FileList | null) {
    if (!files || !files.length) return;
    const next = files[0];
    if (!isAllowedFile(next)) {
      toast.error("Only PDF, DOCX, TXT, or Markdown files are supported");
      return;
    }
    setFile(next);
    setPreview(null);
    setPendingMetadata(null);
    setResolutions(new Map());
  }

  async function runExtractionAndMatching(rawText: string, metadata: BriefMetadata) {
    setStage("extracting");
    const chunksResult = await extractProgramChunksAction({ rawText, metadata });
    if (!chunksResult.success || !chunksResult.data) {
      toast.error(chunksResult.error ?? "Failed to extract program structure");
      setStage("idle");
      return;
    }

    setStage("matching");
    const matchResult = await matchProgramExercisesAction({ brief: chunksResult.data as ProgramBriefParsed });
    if (!matchResult.success || !matchResult.data) {
      toast.error(matchResult.error ?? "Failed to match exercises");
      setStage("idle");
      return;
    }

    setPreview({
      aiPlan: matchResult.data.preview,
      params: matchResult.data.params,
      parsed: matchResult.data.parsed,
      warnings: matchResult.data.warnings,
    });
    setEditableFields(toEditableFields(matchResult.data.parsed));
    setResolutions(new Map());
    setStage("ready");
    toast.success("Preview generated");
  }

  async function handleUploadAndGenerate() {
    if (!file) return;

    setStage("reading");
    try {
      const extension = file.name.toLowerCase().split(".").pop() ?? "";
      const presignResult = await generateProgramBriefUploadUrlAction(extension);
      if (!presignResult.success || !presignResult.data) {
        toast.error(presignResult.error ?? "Failed to get upload URL");
        setStage("idle");
        return;
      }
      const { presignedUrl, fileUrl, contentType } = presignResult.data;

      const uploadResp = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
      });
      if (!uploadResp.ok) {
        toast.error("Upload to storage failed. Please try again.");
        setStage("idle");
        return;
      }

      const metaResult = await extractProgramMetadataFromBriefAction({
        fileUrl,
        fileName: file.name,
      });
      if (!metaResult.success || !metaResult.data) {
        toast.error(metaResult.error ?? "Failed to read this document");
        setStage("idle");
        return;
      }

      const { metadata, rawText, missingRequiredFields } = metaResult.data;

      if (missingRequiredFields.length > 0) {
        setPendingMetadata({ rawText, metadata, missingRequiredFields });
        setStage("idle");
        return;
      }

      await runExtractionAndMatching(rawText, metadata);
    } catch (err) {
      console.error("[program-brief-upload]", err);
      toast.error("Upload failed. Please try again.");
      setStage("idle");
    }
  }

  async function handleMissingFieldsConfirm(values: MissingFieldsValues) {
    if (!pendingMetadata) return;
    const confirmedMetadata: BriefMetadata = {
      ...pendingMetadata.metadata,
      programTitle: values.programTitle || pendingMetadata.metadata.programTitle,
      preferredWeekdays: values.preferredWeekdays,
      estimatedDaysPerWeek: values.daysPerWeek,
      inferredFields: pendingMetadata.metadata.inferredFields.filter(
        (f) => !["programTitle", "preferredWeekdays", "estimatedDaysPerWeek"].includes(f)
      ),
    };
    setPendingMetadata(null);
    await runExtractionAndMatching(pendingMetadata.rawText, confirmedMetadata);
  }

  function confirmSuggestion(key: string, exercise: PreviewExercise) {
    if (!exercise.exerciseId) return;
    setResolutions((prev) =>
      new Map(prev).set(key, { exerciseId: exercise.exerciseId!, exerciseName: exercise.exerciseName ?? "" })
    );
  }

  function skipSlot(key: string) {
    setResolutions((prev) => new Map(prev).set(key, { skip: true }));
  }

  function handlePickerSelect(exercise: { id: string; name: string }) {
    if (!resolverKey) return;
    setResolutions((prev) => new Map(prev).set(resolverKey, { exerciseId: exercise.id, exerciseName: exercise.name }));
    setResolverKey(null);
  }

  function resolutionLabel(resolution: Resolution | undefined) {
    if (!resolution) return undefined;
    if ("skip" in resolution) return "Skipped";
    return resolution.exerciseName;
  }

  function buildResolvedPlan() {
    if (!preview) return null;
    const workouts = preview.aiPlan.workouts
      .map((w, wi) => ({
        name: w.name,
        dayIndex: w.dayIndex,
        weekIndex: w.weekIndex,
        blocks: w.blocks
          .map((b, bi) => ({
            name: b.name,
            type: b.type,
            orderIndex: b.orderIndex,
            exercises: b.exercises
              .map((e, ei) => {
                const key = flagKey(wi, bi, ei);
                const resolution = resolutions.get(key);
                if (resolution && "skip" in resolution) return null;
                const exerciseId = resolution && "exerciseId" in resolution ? resolution.exerciseId : e.exerciseId;
                const exerciseName = resolution && "exerciseName" in resolution ? resolution.exerciseName : e.exerciseName;
                if (!exerciseId) return null;
                return {
                  exerciseId,
                  exerciseName,
                  orderIndex: e.orderIndex,
                  sets: e.sets,
                  reps: e.reps,
                };
              })
              .filter((e): e is NonNullable<typeof e> => e !== null),
          }))
          .filter((b) => b.exercises.length > 0),
      }))
      .filter((w) => w.blocks.length > 0);

    return { name: preview.aiPlan.name, description: preview.aiPlan.description, workouts };
  }

  async function handleSave(isTemplate: boolean) {
    if (!preview || !editableFields) return;
    if (unresolvedCount > 0) {
      toast.error(`Resolve ${unresolvedCount} flagged exercise${unresolvedCount === 1 ? "" : "s"} before saving`);
      return;
    }
    if (!isTemplate && !assignClientId) {
      toast.error("Select a client to assign");
      return;
    }

    const resolvedPlan = buildResolvedPlan();
    if (!resolvedPlan || resolvedPlan.workouts.length === 0) {
      toast.error("No exercises remain in this program — nothing to save");
      return;
    }

    setSaving(isTemplate ? "template" : "assign");
    try {
      const editedTitle = editableFields.programTitle.trim() || preview.parsed.programTitle;
      const editedFocusAreas = editableFields.focusAreas
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const editedDuration = Number.parseInt(editableFields.durationMinutes, 10);

      const result = await saveGeneratedProgramAction({
        aiPlan: { ...resolvedPlan, name: editedTitle },
        params: {
          ...preview.params,
          programTitle: editedTitle,
          difficultyLevel: editableFields.difficultyLevel,
          durationMinutes: Number.isFinite(editedDuration) ? editedDuration : preview.parsed.durationMinutes,
          focusAreas: editedFocusAreas.length ? editedFocusAreas : preview.parsed.focusAreas,
        },
        isTemplate,
        clientId: isTemplate ? null : assignClientId,
        startDate: isTemplate ? undefined : assignStartDate,
      });

      if (result.success) {
        toast.success(isTemplate ? "Program saved" : "Program assigned and saved");
        router.push(`/programs/${result.data}`);
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(null);
    }
  }

  const processing = stage !== "idle" && stage !== "ready";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Upload Program Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Any format works — tables, bullet lists, or plain prose. Not sure where to start?
              </p>
              <Link
                className="text-sm text-blue-600 hover:underline"
                href="/templates/program-brief-template.txt"
                target="_blank"
              >
                See an example document
              </Link>
            </div>
            <Badge variant="outline" className="w-fit">
              Supported: PDF, DOCX, TXT, MD
            </Badge>
          </div>

          <div className="border border-dashed rounded-lg p-6 text-center space-y-3">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files)}
            />
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="text-sm">
              {file ? (
                <span className="font-medium">{formatFileName(file.name)}</span>
              ) : (
                "Choose a program brief file"
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={processing}>
                Select File
              </Button>
              <Button onClick={handleUploadAndGenerate} disabled={!file || processing} className="gap-2">
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Preview
              </Button>
            </div>
            {processing && (
              <div className="pt-2">
                <ProgressStepper stage={stage} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {pendingMetadata && (
        <MissingFieldsDialog
          open
          missingFields={pendingMetadata.missingRequiredFields}
          initialValues={missingFieldsInitialValues!}
          onConfirm={handleMissingFieldsConfirm}
        />
      )}

      {preview && editableFields && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Review Generated Program
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Review before saving
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {preview.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {(() => {
              const inferred = new Set(preview.parsed.inferredFields ?? []);
              const inferredNote = (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Not stated in the document — please confirm.
                </p>
              );
              return (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Program Title</Label>
                    <Input
                      value={editableFields.programTitle}
                      onChange={(e) =>
                        setEditableFields((f) => (f ? { ...f, programTitle: e.target.value } : f))
                      }
                      className={inferred.has("programTitle") ? "border-amber-400" : undefined}
                    />
                    {inferred.has("programTitle") && inferredNote}
                  </div>
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select
                      value={editableFields.difficultyLevel}
                      onValueChange={(v) =>
                        setEditableFields((f) => (f ? { ...f, difficultyLevel: v ?? f.difficultyLevel } : f))
                      }
                    >
                      <SelectTrigger className={inferred.has("difficultyLevel") ? "border-amber-400" : undefined}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIFFICULTY_OPTIONS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {inferred.has("difficultyLevel") && inferredNote}
                  </div>
                  <div className="space-y-2">
                    <Label>Focus Areas (comma separated)</Label>
                    <Input
                      value={editableFields.focusAreas}
                      onChange={(e) =>
                        setEditableFields((f) => (f ? { ...f, focusAreas: e.target.value } : f))
                      }
                      className={inferred.has("focusAreas") ? "border-amber-400" : undefined}
                    />
                    {inferred.has("focusAreas") && inferredNote}
                  </div>
                  <div className="space-y-2">
                    <Label>Schedule</Label>
                    <div className="text-sm font-medium">
                      {preview.parsed.daysPerWeek} days/week — {preview.parsed.preferredWeekdays.join(", ")}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Confirmed before generation — already reflected in the sessions below.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Session Length (minutes)</Label>
                    <Input
                      type="number"
                      value={editableFields.durationMinutes}
                      onChange={(e) =>
                        setEditableFields((f) => (f ? { ...f, durationMinutes: e.target.value } : f))
                      }
                      className={inferred.has("durationMinutes") ? "border-amber-400" : undefined}
                    />
                    {inferred.has("durationMinutes") && inferredNote}
                  </div>
                </div>
              );
            })()}

            {unresolvedCount > 0 && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {unresolvedCount} exercise{unresolvedCount === 1 ? "" : "s"} need{unresolvedCount === 1 ? "s" : ""}{" "}
                your review before this program can be saved.
              </div>
            )}

            <div className="space-y-2">
              <Label>Generated Sessions</Label>
              <div className="space-y-3">
                {preview.aiPlan.workouts.map((workout, wIdx) => (
                  <div key={`${workout.name}-${wIdx}`} className="border rounded-lg p-4">
                    <div className="font-medium">{workout.name}</div>
                    <div className="mt-3 space-y-3">
                      {workout.blocks.map((block, bIdx) => (
                        <div key={`${block.name || block.type}-${bIdx}`}>
                          <div className="text-sm font-semibold flex items-center gap-2">
                            <span>{block.name || "Block"}</span>
                            {block.type !== "NORMAL" && <Badge variant="outline">{block.type}</Badge>}
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {block.exercises.map((ex, eIdx) => {
                              const key = flagKey(wIdx, bIdx, eIdx);
                              const flags = ex.flags ?? [];
                              if (flags.length === 0) {
                                return (
                                  <div key={key} className="text-sm text-muted-foreground">
                                    {ex.exerciseName || ex.exerciseId} — {ex.sets} x {ex.reps}
                                  </div>
                                );
                              }
                              const resolution = resolutions.get(key);
                              return (
                                <FlaggedExerciseRow
                                  key={key}
                                  exerciseName={ex.exerciseName}
                                  sets={ex.sets}
                                  reps={ex.reps}
                                  flags={flags}
                                  hasSuggestion={!!ex.exerciseId}
                                  resolved={!!resolution}
                                  resolvedLabel={resolutionLabel(resolution)}
                                  onConfirm={() => confirmSuggestion(key, ex)}
                                  onPickAlternative={() => setResolverKey(key)}
                                  onSkip={() => skipSlot(key)}
                                />
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Assign to Client (optional)</Label>
                  <Select value={assignClientId} onValueChange={(v) => setAssignClientId(v ?? "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={assignStartDate} onChange={(e) => setAssignStartDate(e.target.value)} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => handleSave(true)} disabled={saving !== null || unresolvedCount > 0}>
                  {saving === "template" ? "Saving..." : "Save as Template"}
                </Button>
                <Button onClick={() => handleSave(false)} disabled={saving !== null || unresolvedCount > 0}>
                  {saving === "assign" ? "Assigning..." : "Save & Assign"}
                </Button>
                {unresolvedCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {unresolvedCount} unresolved exercise{unresolvedCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ExercisePickerDialog
        open={!!resolverKey}
        onOpenChange={(open) => {
          if (!open) setResolverKey(null);
        }}
        exercises={exercises}
        onSelect={handlePickerSelect}
        organizationOrganizationId={organizationOrganizationId}
        exerciseSourcePreference={exerciseSourcePreference}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no type errors — this also resolves Task 8's expected failure (the page now compiles against the new `Props` interface).

- [ ] **Step 3: Run the full test suite one more time**

Run: `npx vitest run`
Expected: PASS (no service-layer code changed in this task, so this should be unaffected, but confirms nothing broke from the full sequence of prior tasks).

- [ ] **Step 4: Commit**

```bash
git add components/programs/program-brief-upload.tsx
git commit -m "feat: staged progress, missing-fields gate, and flag resolution in brief-upload UI"
```

---

## Task 10: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Walk through the flow in a browser as a trainer user**

1. Navigate to `/programs/upload`.
2. Upload a real multi-week program brief document (e.g. the linked example template) that includes at least one exercise name unlikely to exactly match the library (to trigger `needs_review`/`not_in_library`) — confirm the progress stepper shows "Reading document" → "Extracting weeks & sessions" → "Matching exercises" in sequence, not one long spinner.
3. If the document is missing title/schedule info, confirm the blocking `MissingFieldsDialog` appears before extraction proceeds, and that it cannot be dismissed without filling required fields.
4. On the review screen, confirm flagged exercises show badges (`Needs review` / `Not in library` / `Not in document`) and that non-flagged exercises render as plain text like before.
5. Confirm "Save & Assign" and "Save as Template" are disabled while any flag is unresolved, and the unresolved count shown matches the number of flagged rows.
6. Resolve each flag via all three paths at least once: "Confirm" a suggested match, "Choose exercise" to open `ExercisePickerDialog` and pick an alternative, and "Skip" one exercise — confirm the row updates to show "Resolved: ..." and the unresolved count decrements each time.
7. Once all flags are resolved, confirm Save unlocks; save as a template and confirm the resulting program page shows the correct `durationWeeks`/`daysPerWeek` (previously always blank) via `/admin/programs` or the program detail view.

- [ ] **Step 3: Report results**

Note any UX rough edges found (e.g. stepper timing, dialog copy) as follow-up items — do not silently fix scope beyond this plan without checking in first, since Task 9 already implements the agreed design.
