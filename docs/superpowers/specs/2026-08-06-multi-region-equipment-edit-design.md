# Multi-Region Body Tagging & Equipment Edit Parity — Design

## Overview

Two related improvements to the exercise edit experience:

1. **Multi-region body tagging**: an exercise can genuinely belong to more than one body region (e.g. Core + Upper Body), not just one — a true schema change, not a cosmetic one.
2. **Equipment edit parity**: the edit form's equipment picker gains the same "preset chips + free-text custom add" UI the create form already has, so trainers can add equipment not in the fixed preset list when editing an existing exercise.

## Background (current state)

- `Exercise.bodyRegion` is a single Prisma enum field (`BodyRegion`: `LOWER_BODY | UPPER_BODY | CORE | FULL_BODY | BALANCE | FLEXIBILITY`), MongoDB-backed (no `@@index`, no relational constraints).
- `components/exercises/exercise-form.tsx` (create form) already has chip-toggle UI that *looks* multi-select (`selectedRegions: string[]`, comment "first selected becomes primary bodyRegion") but only ever submits `selectedRegions[0]` — no true multi-region support exists end-to-end today.
- `components/exercises/exercise-edit-form.tsx` (edit form) renders body region as a native single-value `<select>`, and equipment as fixed-preset toggle chips only (no custom-add input), unlike the create form's equipment UI which already supports free-text custom entries as removable pills.
- `Exercise.equipmentRequired` is already `String[]` end-to-end — no schema change needed for equipment; this is a pure UI-parity fix.
- Precedent for array-of-enum already exists in the same schema: `exercisePhases ExercisePhase[]`, with an explicit comment in `app/api/ai/generate-exercise-metadata/route.ts` noting "an exercise can belong to more than one phase."
- `bodyRegion` is read, filtered, or displayed in ~30 files: query filters (`exercise.service.ts`, `admin.service.ts`, `ai.service.ts`, `lib/ai/utils/exercise-pool.ts`), display components (cards, badges, detail pages, workout tracker, search command palette), the admin exercise list filter, the program exercise-picker dialog (both its filter bar and embedded mini create-form), seed scripts (`exercises-v2.ts`, `exercises-v3.ts`, `import-athletic-program.ts`), and CSV import.

## Data model & migration

- `prisma/schema.prisma`: `bodyRegion BodyRegion` → `bodyRegion BodyRegion[]`. Enum itself unchanged.
- One-time data migration script (`$runCommandRaw`, following the existing `backfillExerciseSources()` precedent in `exercise.service.ts`) wraps every existing document's scalar value into a single-element array: `"CORE"` → `["CORE"]`. No exercise loses its current region; multi-region is purely additive from that point on.
- This is a one-shot data-fix script run alongside the schema/code deploy, not a repeatable/reversible migration path (Mongo has no transactional schema boundary to straddle).

## Validators & AI metadata generation

- `lib/validators/exercise.ts`: `createExerciseSchema.bodyRegion: z.enum([...])` → `z.array(z.enum([...])).min(1)`, inherited by `updateExerciseSchema` (currently `createExerciseSchema.partial()`). `exerciseFilterSchema.bodyRegion` (a stale/parallel schema not actually wired into the real filter path) reconciled to match rather than left inconsistent.
- `app/api/ai/generate-exercise-metadata/route.ts`: `bodyRegion: z.enum([...]).describe("Primary body region targeted")` → `z.array(z.enum([...])).min(1)`, following the exact pattern already used one field below it for `exercisePhases` ("an exercise can belong to more than one phase... return every phase that genuinely applies") — the region-generation prompt guidance is reworded the same way.
- `actions/exercise-actions.ts` and `actions/bulk-exercise-actions.ts`: single-string params/casts (`bodyRegion: string`, `as BodyRegion`) become `bodyRegion: string[]` / `as BodyRegion[]`.
- CSV validator (`lib/validators/csv-exercise.ts`) is intentionally left as a single-value-per-cell `z.enum(...)`, per the CSV section below — its output is wrapped into a one-element array only at the point it's handed to `prisma.exercise.create`.

## Query/service layer fixes

Five call sites do exact/`in` matching against what is becoming an array field, and must switch to array-aware Prisma operators:

- `lib/services/exercise.service.ts:25` (`getExercises` filter): `{ in: filters.bodyRegions }` → `{ hasSome: filters.bodyRegions }`
- `lib/services/admin.service.ts:247` (admin list filter): `{ equals: bodyRegion }` (implicit) → `{ hasSome: bodyRegions }`, since the admin filter is being upgraded to multi-select (see "Other filter UIs" below) and its param becomes `bodyRegions?: string[]`
- `lib/services/ai.service.ts:201` and `:686` (AI workout-generation pool queries): `{ in: regions }` → `{ hasSome: regions }`
- `lib/ai/utils/exercise-pool.ts:37` (same fix, for consistency, even though not currently called from production)

Every other read site is display-only (see below), not a query change.

## Display & formatting fixes

- `lib/utils/formatting.ts:formatBodyRegion` keeps its single-region-in/single-label-out signature; call sites map over the array and join: `exercise.bodyRegion.map(formatBodyRegion).join(", ")`. Affected: `exercise-card.tsx`, `exercise-detail.tsx`, `exercise-slot.tsx`, `workout-plan-view.tsx`, `command-palette.tsx`. `exercises-table.tsx` renders one badge per region instead of a single color/label lookup.
- `ExerciseImage`'s gradient-background lookup (keyed by a single region) uses the **first** region in the array as "primary" — the same convention the create form already documents ("first selected = primary").
- AI prompt strings (`ai.service.ts:453,765`, `workout-generation.ts:7`) join regions the same way `exercisePhases` already does (`e.bodyRegion.join('/')`) — no prompt-wording changes needed beyond that.

## Edit form UI

- **Body region**: replace the single `<select>` in `exercise-edit-form.tsx` with the chip-toggle multi-select already built (but underused) in `exercise-form.tsx`, pre-checked with whichever regions the exercise currently has. Submits the full array, not just the first entry.
- **Equipment**: port the create form's "preset chips + free-text custom-add, removable pills" pattern into the edit form, replacing today's fixed-preset-only chip list. No schema change — `equipmentRequired` is already `String[]`.
- **Create form**: `exercise-form.tsx` line 77 changes from `bodyRegion: selectedRegions[0]` to sending the full `selectedRegions` array, since the UI already implied this and the backend now supports it.

## Other filter UIs (upgraded to multi-select)

- **Admin exercise list** (`app/admin/exercises/page.tsx`): the single `<Select name="bodyRegion">` becomes a checkbox multi-select (same visual pattern as the public `exercise-filters.tsx` sidebar), comma-joined into the query param, feeding `getAllExercises({ bodyRegions: [...] })` via `hasSome`.
- **Program exercise-picker dialog** (`components/programs/exercise-picker-dialog.tsx`): its `FilterBar` chip toggle becomes multi-select (toggling adds/removes from an array instead of replacing a single value); the client-side filter changes from `ex.bodyRegion !== bodyRegion` to `!ex.bodyRegion.some(r => selected.includes(r))`. Its embedded `CreateExerciseFields` mini create-form gets the same chip multi-select as the main create form.
- The public exercise library filter (`exercise-filters.tsx`) already stores selections as a comma-joined multi-value query param — no change needed there beyond the `hasSome` query fix already covered above.

## Seed data & CSV import

- `lib/db/seed/exercises-v2.ts`, `exercises-v3.ts`, `lib/db/seed/import-athletic-program.ts`: every literal `bodyRegion: "X"` becomes `bodyRegion: ["X"]`. Mechanical find/replace — no exercise's actual seeded region assignment changes.
- CSV import (`lib/validators/csv-exercise.ts`, `actions/bulk-exercise-actions.ts:130`) keeps **one region per CSV row/cell** — no new delimiter convention. The single parsed value is wrapped into a one-element array on create. Multi-region-per-CSV-row is out of scope; a trainer needing multiple regions on an exercise can add the rest afterward via the edit form.

## Error handling summary

- Edit form validation still requires at least one body region selected (mirrors today's required-field behavior, just against an array with `.min(1)` instead of a single required enum).
- Audit-log diffing (`diffFields` in `actions/exercise-actions.ts`) needs array-aware comparison (e.g. sorted-JSON-compare) so reordering the same set of regions doesn't register as a spurious change.

## Testing plan

- **Unit/service**: `exercise.service.test.ts:134-141` and `exercise-pool.test.ts:45` updated to assert `hasSome`/`has` instead of `in`/equality. New cases covering multi-region filter matching (an exercise with `["CORE","UPPER_BODY"]` matches a filter for either region).
- **Action tests**: `bulk-exercise-actions.test.ts`, `exercise-actions-audit.test.ts`, `search-actions.test.ts`, `ai.service.test.ts` fixtures updated from single-value to array `bodyRegion` (some as multi-element, to actually exercise array behavior, not just wrap-in-array). Audit-diff test extended to confirm reordering the same region set produces no diff.
- **Manual QA** (no component test harness in this repo): edit form saving multiple regions and custom equipment; admin list and program-picker filters correctly matching multi-region exercises; card/detail/badge rendering with 1 vs. multiple regions; AI workout generation still producing sensible prompts/matches with multi-region exercises in the pool; CSV import still creates single-region exercises correctly.

## Out of scope

- No CSV format change to support multiple regions per row.
- No change to how many regions an exercise can have (no max) or region-combination validation (e.g. no rule preventing illogical combinations like `FULL_BODY` + `LOWER_BODY`) — trainers self-police this, same as today's single-region field trusted trainer input.
- No retroactive re-tagging of existing exercises with additional regions — the migration only wraps existing single values into one-element arrays; adding a second region to an existing exercise is a manual trainer action via the edit form going forward.
