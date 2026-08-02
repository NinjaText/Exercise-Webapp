# Nutrition Logging Enhancements — Design

## Overview

Three related improvements to meal logging:

1. **Edit a logged meal** after the fact (add, remove, or change items).
2. **Structured multi-item entry** when manually logging a meal, so macro estimation is based on distinct foods + quantities rather than one free-text description.
3. **Browse previous days' meals**, not just today's.

All three apply to both the client's own nutrition view and the trainer's view of a specific client.

## Background (current state)

- `NutritionLog` (Prisma/Mongo) is a **flat, one-row-per-food-item** model: `clientId`, `date`, `mealType`, `description`, `quantity`, macros, `photoUrl`. There is no parent "Meal" entity — a meal is implicitly "all rows sharing the same `clientId` + `date` + `mealType`."
- The AI-photo logging flow (`AiPhotoMealForm` → `analyzeMealPhotoAction` → `createNutritionLogsBulkAction`) already works this way: one photo can produce several draft food items, each becomes its own `NutritionLog` row.
- The manual logging flow (`ManualMealForm`) currently only supports a single description + quantity + one AI macro estimate (`estimateMealMacrosAction` / `estimateMealMacrosFromText`).
- `updateNutritionLogAction` / `nutritionService.updateNutritionLog` already exist and are authorized, but no UI calls them.
- Both nutrition pages (`app/(platform)/nutrition/page.tsx` for the client, `app/(platform)/nutrition/[clientId]/page.tsx` for the trainer) hardcode `today = new Date()` and call `getNutritionLogsForDate`. There is no date navigation on the meals table itself (only aggregate trend charts show history).

## Decision: keep the flat data model

We are **not** introducing a parent `Meal` record. A "meal" stays defined implicitly as `(clientId, date, mealType)`. This avoids a schema migration and keeps the existing bulk-insert/AI-photo pattern as the one true creation path. Editing a "meal" means editing the set of `NutritionLog` rows that share that triple.

## Feature 1: Edit a logged meal

- Each meal-type group in `meals-table.tsx` (e.g. "Breakfast") gets an **Edit** affordance.
- Opens a dialog pre-filled with that group's current items as editable rows: name, quantity, and manual number fields for calories/protein/carbs/fat, plus a per-row remove button and an "+ Add another item" button at the bottom (same visual shape as the AI-photo draft list).
- A **"Re-estimate with AI"** button re-runs macro estimation over the current row list (see Feature 2's batched estimator) and fills in macros — it does not submit by itself; the client can still hand-edit after.
- Saving calls a new `updateMealGroupAction(clientId, date, mealType, items)` which diffs the submitted item list against the DB rows for that triple:
  - Item with existing id, changed fields → `updateNutritionLog`
  - New item (no id) → insert (reuses the bulk-create path)
  - Existing row not present in the submitted list → delete
  - **If the diff would remove all rows and add none, reject with a validation error** ("Use delete on the whole meal instead of removing every item") rather than silently leaving an empty meal.
- Authorization reuses the existing pattern from `updateNutritionLogAction`: client must own the log, or trainer must belong to the client's org.

## Feature 2: Structured multi-item manual entry

- `ManualMealForm` changes from one name/quantity field to a **repeatable row list**: each row is `{name, quantity}`; a "+ Add another item" button appends rows; each row has a remove control.
- **"Estimate with AI"** sends the full row list in a single call to a new `estimateMealMacrosBatch(items: {name, quantity}[])` in `nutrition-ai.service.ts` — one `generateObject` call (mirrors the existing `mealPhotoSchema` shape, text-driven instead of vision-driven), returning macros per item in one round trip. Results populate each row's macro fields (still manually editable after).
- Submitting bulk-inserts one `NutritionLog` per row via the existing `createNutritionLogsBulkAction` — no new create path, this is exactly what the AI-photo flow already does.
- The `AiPhotoMealForm` flow is unchanged.
- If the batched estimate call fails or returns malformed data: show a toast error, leave whatever macro values are already in the rows untouched (no partial overwrite).

## Feature 3: Browse previous days' meals

- Both nutrition pages accept a `date` param (default: today).
- `MealsTable` gains a date-navigation header: prev-day / next-day arrows plus a date picker, driving the same `getNutritionLogsForDate`-style query, just parametrized instead of hardcoded to `new Date()`.
- "Next day" is clamped at today (no navigating into the future). An invalid or out-of-range date param falls back to today.
- Applies identically to the client's own view and the trainer's view of a client.

## Error handling summary

- Empty-group-after-edit → rejected server-side with a clear message.
- AI batch estimate failure → toast, no data loss, existing values preserved.
- Date navigation → clamped at today, invalid dates fall back to today.
- All mutation actions reuse the existing client-owns-log / trainer-owns-client-org authorization checks already present in `nutrition-actions.ts`.

## Testing plan

- **Unit**: `estimateMealMacrosBatch` (empty list, single item, multiple items, malformed AI response); `updateMealGroupAction` diff logic (add-only, remove-only, mixed, remove-all rejected, unauthorized caller).
- **Component**: edit dialog (pre-fill from existing rows, add/remove row, re-estimate button wiring); date navigator (prev/next, boundary clamp at today, direct date-picker jump); manual multi-item form (add/remove rows, batched estimate populating fields).
- **Manual QA**: log a multi-item breakfast manually, edit it (add one item, remove one, change a quantity, re-estimate), then browse to a previous day via the date navigator — repeat for both the client's own view and the trainer's view of that client.

## Out of scope

- No new Prisma model (`Meal`/`FoodItem` parent-child) — deferred unless a future need (e.g. reordering items within a meal, meal-level notes) justifies the migration.
- No changes to the AI-photo logging flow itself.
- No changes to daily/weekly AI summary generation (`generateDailySummaryAction`/`generateWeeklyReviewAction`) beyond them naturally reflecting edited data.
