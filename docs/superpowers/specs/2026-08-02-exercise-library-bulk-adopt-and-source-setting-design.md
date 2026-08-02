# Exercise Library Bulk-Adopt & Program Exercise-Source Setting — Design

## Overview

Two related improvements to the exercise library and program building:

1. **Bulk-adopt universal exercises**: a trainer can select multiple exercises on the Universal tab of the exercise library and add them all to their organization in one action.
2. **Program exercise-source preference**: an org-wide setting controlling whether the exercise picker used when building a program shows Universal exercises, the org's own exercises, or both.

## Background (current state)

- `Exercise.source` is `UNIVERSAL | ORGANIZATION` (Prisma enum), with `organizationId` (a plain Clerk org id string, not a relation) and `isPublic` controlling cross-org visibility. There is no `Organization` Prisma model — organization-level settings live in Clerk's `publicMetadata`, read/written via `getOrganizationProfile`/`saveOrganizationProfile` in `actions/organization-actions.ts`.
- `actions/exercise-actions.ts` already has `adoptUniversalExercisesAction(exerciseIds: string[])`, fully implemented: dedupes ids, validates each is a real `UNIVERSAL` exercise independently (one bad id doesn't abort the batch), clones via `exerciseService.cloneExerciseToOrganization`, audits, revalidates `/exercises`, and returns `{success:true, successCount, failures} | {success:false, error}`. It has zero UI callers today.
- `app/(platform)/exercises/page.tsx` renders `ExerciseGrid` (stateless list renderer) → `ExerciseCard` (has a single-exercise "Add to My Organization" button, gated by a `canAdopt` prop computed as `activeSource === "UNIVERSAL" && !!organizationOrgId`).
- `components/admin/exercises-table.tsx` has an established bulk-select pattern: `Set<string>` selection state, toggle/select-all helpers, a floating pill action bar, and (for its destructive action) a confirm dialog.
- `components/programs/exercise-picker-dialog.tsx` renders a two-tab (Universal / My Organization) picker only when `organizationOrganizationId` is truthy; otherwise it renders a single Universal-only list. This truthiness check is the *only* thing gating tab visibility today — there's no separate "preference" concept.
- `organizationOrganizationId` is threaded through an established, unchanged three-hop prop chain: program page (`app/(platform)/programs/new/page.tsx`, `.../[id]/edit/page.tsx`, and admin equivalents) → `ProgramEditor` → `ProgramBuilder` → `ExercisePickerDialog`.

## Feature 1: Bulk-adopt universal exercises

- No backend/schema changes — `adoptUniversalExercisesAction` is reused as-is.
- `ExerciseGrid` becomes a client component. When `activeSource === "UNIVERSAL"` and the trainer has an org, a **"Select"** toggle button appears in the library's toolbar. Toggling it on:
  - Reveals a checkbox overlay (top-left of the thumbnail, `stopPropagation` on click so it doesn't trigger the card's link-through) on every adoptable `ExerciseCard`. New optional `ExerciseCard` props: `selectable?: boolean`, `selected?: boolean`, `onToggleSelect?: () => void`.
  - Shows a "select all on this page" checkbox in the toolbar.
  - Selection state is a `Set<string>` of exercise ids, scoped to the current page/filter view (selecting, then changing a filter, drops ids no longer visible — matching the admin table's page-scoped model).
- Selecting ≥1 exercise shows a floating bottom bar (same visual shape as the admin bulk-delete bar, styled as a primary, non-destructive action): **"N selected · Add to My Organization · Clear"**.
- "Add to My Organization" calls `adoptUniversalExercisesAction(Array.from(selectedIds))` directly — **no confirm dialog** (adopting is non-destructive, unlike the admin table's delete). On response:
  - Toast reflects `successCount`/`failures` (e.g. "Added 8 exercises" or "Added 6 — 2 could not be added" for partial failures).
  - Clears selection, exits Select mode, and redirects to `?source=ORGANIZATION` (matching the existing single-item adopt flow's behavior) so the trainer immediately sees what was added.
- Toggling "Select" off (or navigating away) clears selection and hides checkboxes, restoring today's per-card single-adopt button.

## Feature 2: Program exercise-source preference

- New optional field on `OrganizationMetadata` (`actions/organization-actions.ts`): `exerciseSourcePreference?: "UNIVERSAL" | "ORGANIZATION" | "BOTH"`. Defaults to `"BOTH"` when unset/reading an org that predates this feature — **zero behavior change** for existing orgs until they explicitly set it.
  - `getOrganizationProfile()` returns it (defaulting to `"BOTH"`); `saveOrganizationProfile()` persists it; `diffFields(...)`'s audited field-name list includes it.
- `components/settings/organization-profile-form.tsx` gains a labeled select, **"Program Exercise Library"**, with three options: "Universal + My Organization" (default), "Universal exercises only", "My Organization exercises only". Follows the form's existing plain-`FormData` submission pattern.
- The preference is fetched at the same page level that already resolves `organizationOrganizationId` (`app/(platform)/programs/new/page.tsx`, `.../[id]/edit/page.tsx`, and their admin equivalents), then threaded through the identical `ProgramEditor` → `ProgramBuilder` → `ExercisePickerDialog` prop chain as a new prop (e.g. `exerciseSourcePreference`).
- **New pure helper** `resolvePickerTabs(preference, hasOrg)` — the single source of truth for which tab(s) `ExercisePickerDialog` renders:
  - `hasOrg = false` → always Universal-only (today's existing behavior, unaffected by preference — defensive fallback for the edge case where an org-scoped preference is somehow set without an org).
  - `hasOrg = true, preference = "BOTH"` → both tabs (today's existing behavior).
  - `hasOrg = true, preference = "UNIVERSAL"` → Universal-only, tab hidden.
  - `hasOrg = true, preference = "ORGANIZATION"` → My-Organization-only (new render path; reuses the existing "My Organization" tab's empty state if the org has zero exercises yet — no new empty-state needed).
- The "Create New" exercise flow inside the picker stays available in all cases — creating an exercise always adds it to the org, independent of browsing preference.
- Scope: this preference affects **only** the program-builder's exercise picker. The main `/exercises` library browsing page is unaffected.

## Error handling summary

- Bulk-adopt partial failures render as a differentiated toast (not treated as total failure), matching the existing single-adopt error surface style.
- `saveOrganizationProfile` failures follow the form's existing inline-error pattern.
- `resolvePickerTabs` is the single place the "org-scoped preference without an org" edge case is handled, so it can't drift between call sites.

## Testing plan

- **Unit**: `resolvePickerTabs` — all preference × `hasOrg` combinations (4 cases).
- **Action tests**: extend existing `organization-actions` tests for `exerciseSourcePreference` read (with and without a stored value, confirming the `"BOTH"` default), write, and its presence in `diffFields`'s audited field list.
- **No new tests needed** for `adoptUniversalExercisesAction` itself — unchanged, already covered.
- **Manual QA** (no component test harness in this repo): Select-mode toggle, checkbox overlay + select-all, floating bar (single success, partial failure), redirect-after-adopt; settings dropdown save/reload; picker tab visibility under all three preference values, for both a trainer with an org and (defensively) one without.

## Out of scope

- No changes to the main `/exercises` library page's tab visibility — only the program-builder's picker is affected by the new setting.
- No confirm dialog for bulk-adopt (non-destructive action).
- No new Prisma model — the setting lives in the same Clerk `publicMetadata` blob as every other organization setting today.
