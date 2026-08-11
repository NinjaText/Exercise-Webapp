# Assessment Exercise Flag — Design

## Problem

The exercise library currently has no way to distinguish exercises used to *assess* a
patient/client (e.g. "Single-Leg Squat Test", "Sit-to-Stand Test") from exercises used to
*train* them. Every program-building path in the app treats all active exercises as
program-eligible, so assessment-style exercises risk being pulled into AI-generated
programs or manually added to a program via the picker, when they should only ever be
used for evaluation.

Note: "Assessment" already exists in this codebase as a patient outcome-measurement
feature (`app/(platform)/assessments/*`, `actions/assessment-actions.ts`,
`lib/services/outcome.service.ts`). That feature is unrelated to this one and shares no
schema with `Exercise`. To avoid confusion, the new field and UI copy should always say
"assessment exercise" (never bare "assessment") when referring to this flag.

## Goal

Let a trainer/admin mark an exercise as an assessment exercise, and have that flag:
- Exclude the exercise from every AI program-generation exercise pool.
- Exclude the exercise from the manual "add exercise to program" picker and the
  in-program workout editor's add-exercise list.
- Surface as a separate filter/tab in the exercise library browsing UI (trainer-facing
  and admin), rather than being hidden or mixed in with a badge.

## Non-goals

- No new exercise-kind taxonomy/enum — a boolean is sufficient for the current need.
- No change to the existing patient-outcomes "Assessment" feature.
- No exclusion from global search (`actions/search-actions.ts`) or the program
  equipment-availability computation (`actions/program-actions.ts`) — these aren't part
  of program-building or library browsing, so they're left unfiltered for now.

## Design

### 1. Data model

Add to `Exercise` in `prisma/schema.prisma`:

```prisma
isAssessment Boolean @default(false)
```

Defaulting to `false` means every existing exercise stays program-eligible with no
backfill needed.

### 2. AI-suggested tagging

`app/api/ai/generate-exercise-metadata/route.ts`'s `buildMetadataFields()` gets an added
`isAssessment: z.boolean()` field in the generated-object schema, with a description
telling the model to set `true` for clinical/functional assessments or outcome-measure
tests rather than training movements. The system prompt gets a short instruction
explaining the distinction with 1-2 examples (e.g. movement screens, timed/rep-max
tests) vs. ordinary strengthening/mobility exercises.

This is a *suggestion* — the value comes back with the rest of the generated metadata
and pre-fills the create/edit form's toggle, but does not get persisted until a human
saves the exercise.

### 3. Human confirmation on create/edit

- Manual create/edit exercise form: add an "Assessment exercise" toggle/checkbox,
  pre-filled from the AI suggestion when present, default off otherwise. Editable before
  save.
- `components/exercises/bulk-import-form.tsx`: add the same toggle per row, pre-filled
  from that row's AI-suggested metadata.
- `lib/services/exercise.service.ts` — `createExercise()` and `updateExercise()` accept
  and persist `isAssessment`.
- `actions/bulk-exercise-actions.ts` — `bulkCreateExercisesAction` persists
  `isAssessment` per row.

### 4. Excluded from program-building paths

Add `isAssessment: false` to the Prisma `where` clause at each of these sites:

- `lib/ai/utils/exercise-pool.ts` — `buildPhasePoolPrimaryWhereClause()` and
  `buildPhasePoolFallbackWhereClause()`
- `lib/services/ai.service.ts` — `buildExercisePoolForPhase()`'s primary/fallback
  queries, the legacy single-phase pool query, and the `allBriefExercises` lookup
- `app/api/ai/generate-program/route.ts` — the exercise-name matcher query
- `lib/services/exercise.service.ts` — `getExercisesForPicker()` (backs
  `components/programs/exercise-picker-dialog.tsx`)
- `actions/workout-editor-actions.ts` — the manual workout-editor add-exercise query

### 5. Library browsing

`getExercises()` (trainer-facing exercise library page + admin exercise listing) gets an
`isAssessment` filter parameter. The listing UI defaults to showing training exercises
(`isAssessment: false`) with a filter/tab to switch to viewing assessment exercises
(`isAssessment: true`) — not a mixed badge view.

## Testing

- Unit tests: `buildPhasePoolPrimaryWhereClause()` and
  `buildPhasePoolFallbackWhereClause()` in `lib/ai/utils/__tests__/exercise-pool.test.ts`
  assert `isAssessment: false` is present in the returned where clause.
- Unit/integration test on `getExercises()`/`getExercisesForPicker()` covering the
  `isAssessment` filter default and explicit-`true` behavior.
