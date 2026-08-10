# Feature Design: Explicit Program Type Selector

## Overview

Last session, `generateClinicalPlan()` was changed to infer a `programMode` (`CLINICAL` vs `PERFORMANCE`) purely from whether the client's profile has any documented pain/diagnosis/limitations — no UI control existed to override it. This adds a visible, professional-looking "Program Type" control to the generator form so a trainer can see and override that choice, rather than it being an invisible backend inference.

## UI

`components/programs/generate-program-form.tsx` — a new "Program Type" `<select>` dropdown, placed immediately after the Client selector and before Program Goals:

```
Program Type  (auto-detected from client profile — change if needed)
[ 🏋️ Performance / Athletic  ▾ ]
```

Two options only, matching the two real backend modes:
- `🏋️ Performance / Athletic` → `PERFORMANCE`
- `🩺 Rehab / Clinical` → `CLINICAL`

## Default value + override behavior

New form state: `programMode: ProgramMode` and `programModeTouched: boolean` (starts `false`).

- On mount and whenever the selected client changes, if `programModeTouched` is `false`, recompute the default: `PERFORMANCE` unless the selected `ClientSummary` has a non-empty `primaryDiagnosis`, a `painScore > 0`, or a non-empty `limitations` string, in which case `CLINICAL`. This mirrors `hasDocumentedClinicalNeed` from `lib/ai/utils/clinical-context.ts`, using only the subset of fields already present on `ClientSummary` (it doesn't carry `secondaryDiagnoses`/`comorbidities`/etc. — good enough for a UI default since the backend's full-profile check still runs as the fallback whenever no explicit override is sent).
- If the trainer changes the dropdown manually, set `programModeTouched = true` — the value then no longer resets when the client selection changes, until the form is reset.
- No client selected → defaults to `PERFORMANCE` (matches existing `determineProgramMode(null)` behavior), still overridable — this is what unblocks admin/global template authoring for a rehab template with no linked client.

## Wiring

- `handleRequestPlan()` includes `programMode` in the POST body to `/api/ai/generate-clinical-plan`. The route has no body schema restricting fields, so no route change is needed.
- `ClinicalPlanParams` (`lib/ai/types/program-generation.ts`) gains one new optional field: `programMode?: ProgramMode`.
- `generateClinicalPlan()` (`lib/services/ai.service.ts`) changes one line: `const programMode = params.programMode ?? determineProgramMode(profile)` — an explicit value always wins; absence falls back to today's inference untouched.
- Nothing downstream changes. `generateClinicalPlan` already stamps `programMode` onto the returned `ClinicalPlan` and every `WeekPlan`, and Step 2 (`generateWorkoutPlan`'s phase-based generation) already reads `programMode` from `weekPlan[0].programMode` rather than recomputing it — so the override propagates through phase grouping, persona prompts, and progression with no further code changes.

## Out of scope

- The calendar quick-generate dialog (`components/calendar/ai-generate-program-dialog.tsx`, the single-shot branch with no Step 1) is untouched — it has no client-selection UI in the same sense and already infers mode from the linked client's profile. Can be revisited later if needed.
- No change to the two-option constraint — no third "General Fitness" option, matching last session's decision that Performance mode already covers general fitness via goal chips and periodization phases.

## Testing

- Manual: verify the default flips correctly when switching between a client with documented pain/diagnosis and one without; verify a manual override survives a subsequent client switch; verify no-client defaults to Performance and can be overridden to Rehab/Clinical for a global template.
- No new unit tests needed beyond what already covers `determineProgramMode`/`hasDocumentedClinicalNeed` (existing) — this feature is a thin UI layer plus a one-line fallback change in an already-tested function.
