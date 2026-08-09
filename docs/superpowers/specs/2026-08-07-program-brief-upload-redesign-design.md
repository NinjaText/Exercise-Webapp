# Program Brief Upload Redesign

**Date:** 2026-08-07
**Status:** Approved for implementation

## Problem

Trainers can generate a program by uploading a brief document (`app/(platform)/programs/upload`). The current pipeline has four compounding problems:

1. **No exercise-match transparency.** `resolveExerciseByName` (`lib/services/ai.service.ts:272-295`) silently asks an LLM to pick a "best guess" replacement for almost every extracted exercise that isn't a literal exact string match. The trainer never sees that a substitution happened — only true misses (empty candidate list, essentially never) surface as a warning.
2. **Hallucinated exercises.** The chunk-extraction LLM call sometimes invents exercises the source document never mentioned, with no check against the source text.
3. **Missing required program fields.** `createProgramFromGeneratedPlan` (`actions/program-actions.ts:47-168`) never writes `durationWeeks`/`daysPerWeek` onto the created `Program`, even though the schema and the manual builder path support both fields. There's also no upfront check that fields required to generate a sane program (weeks, days/week, schedule) were actually inferred before running the expensive generation.
4. **Slow.** The exercise-matching loop awaits one `gpt-4o` call per exercise, sequentially (`ai.service.ts:604-665`) — 100+ round-trips for a realistic multi-week program. No progress feedback during the wait.

## Goals

- Every exercise in the final preview is either a high-confidence library match or explicitly flagged for trainer action — no silent substitution.
- Exercises not traceable to the source document are flagged, not silently accepted or silently dropped.
- Required structural fields (title, weeks, days/week, schedule) are confirmed before the expensive generation step runs, via a popup when they can't be inferred.
- The review screen won't let a trainer save a program with unresolved flags.
- `durationWeeks`/`daysPerWeek` are persisted correctly; the AI-generated plan is validated with the existing Zod schemas before writing to the DB.
- Remove the per-exercise LLM tie-break call — matching becomes deterministic and fast.
- Real staged progress feedback during generation.

## Non-goals

- No new file formats (image/OCR support). Stays `.pdf`, `.docx`, `.txt`, `.md`.
- No configurable/trainer-tunable matching strictness — thresholds are fixed (see §2).
- No changes to the unrelated questionnaire-based generator (`app/api/ai/generate-program/route.ts`).

## 1. Flow architecture

Replace the current two-action flow with four sequential server actions orchestrated by the client, each advancing a visible progress stepper. The client accumulates the plan in local state across stages; each action takes the previous stage's output.

| Stage | Progress label | Action | Notes |
|---|---|---|---|
| 1 | "Reading document" | `extractProgramMetadataFromBriefAction` (existing) | Fetch file, extract text, one LLM call for title/focus/difficulty/schedule metadata. Also computes `missingRequiredFields`. |
| gate | — | *(client-side)* | If `missingRequiredFields` is non-empty, block on the popup in §3 before continuing. No server call. |
| 2 | "Extracting weeks & sessions" | `extractProgramChunksAction` (new) | Split out of today's `parseProgramBrief`: chunking + per-chunk LLM extraction (concurrency 4, unchanged) → merged `sessionBlueprint`. No exercise matching. |
| 3 | "Matching exercises" | `matchProgramExercisesAction` (new) | Deterministic tiered matching + hallucination check (§2). No LLM calls. |
| 4 | "Finalizing" | `saveGeneratedProgramAction` (existing, fixed) | Persists once all flags are resolved (§4). |

`extractProgramChunksAction` and `matchProgramExercisesAction` are new actions in `actions/program-actions.ts`, backed by new/refactored functions in `lib/services/program-brief.service.ts` (chunk extraction, already close to this shape) and `lib/services/ai.service.ts` (matching, replacing the `resolveExerciseByName` LLM path).

## 2. Exercise resolution

Two independent, deterministic checks per extracted exercise — no LLM calls.

**Library match tier**, using the existing `scoreNameSimilarity` (`ai.service.ts:169-178`) against the full active exercise list:

- **score ≥ 0.9** (exact or substring match) → auto-accepted silently, no flag.
- **0.5 ≤ score < 0.9** → flagged `needs_review`; the top-scoring candidate is pre-selected in the UI but must be confirmed.
- **score < 0.5, or zero candidates** → flagged `not_in_library`; no pre-selection.

`pickClosestExerciseNameAI` (`ai.service.ts:246-270`) and its call site are removed.

**Document-fidelity check** (new): for each extracted exercise, check whether its name is traceable in the source chunk text it was extracted from (case-insensitive substring or token-overlap check against that chunk's raw text, reusing `normalizeExerciseName`). If not traceable → flagged `not_in_document`.

An exercise can carry both `needs_review`/`not_in_library` AND `not_in_document` simultaneously — both badges render.

Flags are attached to the exercise entries in the preview payload returned by stage 3, e.g. `{ exerciseName, matchedExerciseId, flags: ['needs_review' | 'not_in_library' | 'not_in_document'], candidates: [...] }`.

## 3. Upfront missing-info popup

After stage 1, if any of these **required** fields are missing from `extractBriefMetadata`'s output, a blocking shadcn `Dialog` collects them before stage 2 runs:

- Program title
- Days per week
- Weekly schedule (which weekdays)

Note: total **number of weeks** is deliberately not part of this gate — it isn't knowable from the cheap metadata call at all; it only emerges once stage 2 actually groups extracted sessions by week label. It's a fact derived from the document's real structure, not something to ask the trainer to pre-guess. `durationWeeks` is computed from the parsed `sessionBlueprint`'s actual week count and persisted automatically at save time (§4) — this is what fixes the "durationWeeks never saved" gap.

This dialog replaces the current inline "Confirm Schedule" card (`program-brief-upload.tsx:345-373`). Optional metadata (difficulty, focus areas, session duration) remains the existing inline amber-highlighted editable-field treatment on the review screen (`program-brief-upload.tsx:397-472`) — not blocking, not part of this popup.

## 4. Review screen & save gating

- Each flagged exercise shows its badge(s) (`Needs review`, `Not in library`, `Not in document`) plus a "Resolve" button that opens `ExercisePickerDialog` (`components/programs/exercise-picker-dialog.tsx`) scoped to that slot — same component already used by the program builder for swapping exercises.
- Resolving a flag requires one explicit action: confirm the pre-selected candidate, pick a different library exercise, create a new exercise (existing AI-assisted or manual flow inside `ExercisePickerDialog`), or explicitly mark "skip this exercise" (removes it from the plan).
- Save / Save & Assign buttons are disabled while any exercise still has an unresolved flag. A count of remaining unresolved flags is shown next to the disabled button.
- `createProgramFromGeneratedPlan` (`actions/program-actions.ts:47-168`) is updated to set `durationWeeks` (computed as `max(weekIndex across aiPlan.workouts) + 1`) and `daysPerWeek` (confirmed value) on the `Program.create` call.
- Before persisting, the assembled `GeneratedProgram` plan is run through a new dedicated Zod schema (`lib/validators/generated-program.ts`) — the existing `createProgramSchema`/`workoutSchema`/`blockExerciseSchema` (`lib/validators/program.ts`) validate a different, nested per-set shape used by the manual builder and don't match the flat `sets: number, reps: string` shape `GeneratedProgram` actually uses, so reusing them isn't viable without a lossy reshape. The new schema validates the AI-generated shape directly (non-empty workouts/blocks/exercises, non-null `exerciseId`, positive `sets`, etc.). A validation failure surfaces a clear error instead of an unguarded Prisma call.

## 5. Performance

- Removing the per-exercise `pickClosestExerciseNameAI` call eliminates the dominant cost (100+ sequential round-trips on a large program) — matching becomes an in-process scoring pass over the exercise list.
- Chunk extraction (stage 2) is unchanged: concurrency-4 batching stays, since it's a separately-parallelized, harder-to-cut cost.
- Splitting into four sequential actions doesn't reduce chunk-extraction wall-clock time, but gives the trainer real stage-by-stage feedback instead of one long spinner, which is most of the perceived "too slow" complaint.

## Testing

- Unit tests for the tiering function (score thresholds → correct flag) and the document-fidelity check (traceable vs. not).
- Unit test confirming `createProgramFromGeneratedPlan` sets `durationWeeks`/`daysPerWeek`.
- Unit test confirming save is rejected (client-side gating + ideally a server-side check too) when unresolved flags are present.
- Manual run through the upload UI with a real multi-week brief document to confirm staged progress renders and timing is noticeably improved.
