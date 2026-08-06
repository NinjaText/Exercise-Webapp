---
name: patterns-local-type-duplication
description: Many components in this repo re-declare Prisma field shapes as local structural types instead of importing Prisma's type — these are the sites a schema-shape migration misses
metadata:
  type: project
---

This codebase has a recurring pattern: instead of importing a Prisma-generated type (e.g. `Exercise`)
or one exported from a service layer, many components/pages declare their own local structural type
for "the subset of fields I need" — e.g. `type ExerciseSummary = { id: string; name: string;
bodyRegion: string; ... }` duplicated separately in `components/calendar/client-calendar.tsx`,
`components/calendar/workout-editor-panel.tsx`, `components/programs/program-builder.tsx`,
`components/programs/program-editor.tsx`, `components/programs/program-schedule-view.tsx`, plus
`Props` interfaces in `app/admin/**/*-editor-wrapper.tsx` files.

**Why this matters:** when a Prisma field's *shape* changes (e.g. `Exercise.bodyRegion` went from a
single `BodyRegion` enum to `BodyRegion[]` across the 10-task migration in
`.superpowers/sdd/2026-08-06-multi-region-equipment-edit/`), every one of these local duplicate
type declarations has to be updated by hand — none of them get the fix "for free" via a shared
import. Task 10 (final full-repo verification) found **8 separate files** with a stale
`bodyRegion: string` local type that no earlier task in the plan had touched or even listed as a
risk (only 3 of the 8 were even mentioned in the task brief's "double-check these" list). Some of
these types also carry an internal shadow field (e.g. `_exerciseBodyRegion: string` in
`program-builder.tsx`/`program-editor.tsx`) used only for bookkeeping and never rendered — those
need the same fix even though grep won't show them being displayed anywhere.

**How to apply:** when auditing whether a Prisma field-shape migration is complete, don't trust the
plan's own "should tolerate this automatically" list. Do two things:
1. Run `npx tsc --noEmit -p tsconfig.json` for a *full* one-pass error listing — `next build`'s
   Turbopack worker stops after the first error per invocation, so iterating on `next build` alone
   means re-running the build once per remaining bug, one at a time. `tsc --noEmit` surfaces
   everything in the whole program in one shot.
2. Grep for the migrated field name across the whole repo and manually check every match that
   isn't importing the Prisma type directly — local re-declarations of the same shape are the
   highest-risk miss site, specifically in `components/calendar/*`, `components/programs/program-
   builder.tsx` / `program-editor.tsx` / `program-schedule-view.tsx`, and `app/admin/**/*-wrapper.tsx`
   files, which is where they clustered this time.

**Odd but confirmed side effect:** fixing `lib/services/admin.service.ts`'s `getAllExercises`
`where`-clause typing (`bodyRegion: { hasSome: string[] }` → cast to `BodyRegion[]`) also silently
fixed an unrelated pre-existing `createdBy` TS2551 error in `components/admin/exercises-table.tsx`
that two earlier task reviewers had confirmed as "pre-existing, not migration-related, safe to
ignore." Once the `where` object literal's shape correctly matched `Prisma.ExerciseWhereInput`,
TypeScript resolved the correct `prisma.exercise.findMany` overload and the `include: { createdBy }`
narrowing showed up in the inferred return type. Lesson: an "accepted pre-existing error" in this
codebase's `admin.service.ts` where-object-literal pattern can sometimes be a downstream symptom of
a real typing bug elsewhere in the same query, not necessarily a true Prisma/TS quirk — worth a
quick recheck with `tsc --noEmit` after any adjacent fix before re-accepting it as unrelated.

See also [[patterns_mongo_type_queries]] for the same migration's earlier Mongo `$type` filter trap.

**`any`-boundary blind spot (missed on the first pass, caught by coordinator review):** two files
the brief explicitly flagged — `components/workout/workout-checklist-tracker.tsx` and
`components/workout/workout-session-tracker.tsx` — were initially left unfixed because
`tsc --noEmit` reported no error for them. That check doesn't apply when the component receives its
data through a prop typed `any` — here, `components/workout/workout-mode-wrapper.tsx:15`
(`interface Props { session: any; ... }`) — which is a full type-erasure boundary. `tsc` cannot
validate anything crossing an `any`-typed prop, so a stale local `bodyRegion: string` type inside
the child component will never surface as a build error even though the runtime data is now an
array. It was masked further because `["LOWER_BODY"].toString() === "LOWER_BODY"`, so with all-
single-region seed data the old scalar-shaped render still happened to look correct.

**How to apply:** "no tsc error" is not sufficient proof a migrated field is safe everywhere. Before
declaring a field-shape migration complete, also grep for `: any` (and `as any`) prop/parameter
boundaries anywhere near components that consume the migrated field, and manually check the local
types on the *far side* of each one — tsc's silence there is not evidence.
