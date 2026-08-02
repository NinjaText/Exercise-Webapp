# Nutrition Logging Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let clients log a meal as multiple distinct food items (each with its own quantity) so AI macro estimation is accurate, edit a previously-logged meal (add/remove/adjust items), and browse previous days' meals — with trainers getting the same edit and browsing capability on their clients' nutrition views.

**Architecture:** No schema changes. `NutritionLog` stays a flat one-row-per-food-item model; a "meal" remains implicitly defined as `(clientId, date, mealType)`. New capability is layered on top: a batched AI macro estimator, a diff-based "update this meal's item set" action, a shared repeatable food-item-row UI component reused by the manual entry form, the AI-photo form, and the new edit dialog, and date-parameterized page queries for history browsing.

**Tech Stack:** Next.js App Router (TypeScript) Server Actions, Prisma/MongoDB, Vercel AI SDK (`generateObject` + `@ai-sdk/openai`), Zod, Vitest for tests (node environment — this repo has no React component test harness, so UI-only behavior is verified by manual QA in-browser, not automated component tests).

## Global Constraints

- No new Prisma models or migrations — reuse `NutritionLog` as-is.
- Every mutation action must reuse the existing `getAuthedUser()` / `canTrainerAccessClient()` helpers already defined in `actions/nutrition-actions.ts` — do not invent a new auth pattern.
- Trainers get the same edit + history-browsing capability as clients (per design decision); a bare per-row delete button stays client-only — trainers remove items through the edit-meal-group dialog instead.
- Follow the existing action-file test convention: mock every top-level import of `actions/nutrition-actions.ts` (`@clerk/nextjs/server`, `@/lib/prisma`, `next/cache`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@/lib/r2`, `@/lib/pusher`, `@/lib/services/notification.service`, `@/lib/services/client.service`, `@/lib/services/nutrition.service`, `@/lib/services/nutrition-ai.service`) — see `actions/__tests__/voice-memo-actions.test.ts` and `actions/__tests__/adopt-universal-exercises.test.ts` for the established pattern.
- Delete code that becomes fully unreferenced as a direct result of this work (see Tasks 2 and 3) — do not leave superseded dead exports behind.

---

### Task 1: Batched AI macro estimation

**Files:**
- Modify: `lib/services/nutrition-ai.service.ts`
- Modify: `lib/validators/nutrition.ts`
- Modify: `actions/nutrition-actions.ts`
- Test: `lib/services/__tests__/nutrition-ai.service.test.ts` (create)
- Test: `actions/__tests__/nutrition-actions.test.ts` (create)

**Interfaces:**
- Consumes: existing `MealMacroEstimate` type (already exported from `nutrition-ai.service.ts`).
- Produces: `estimateMealMacrosBatch(items: {name: string; quantity?: string}[]): Promise<MealMacroEstimate[]>` (service), `estimateMealMacrosBatchSchema` (validator), `estimateMealMacrosBatchAction(input: unknown): Promise<ActionResult<{estimates: MealMacroEstimate[]}>>` (action) — all consumed by Task 2 and Task 4.

- [ ] **Step 1: Write the failing service test**

Create `lib/services/__tests__/nutrition-ai.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGenerateObject } = vi.hoisted(() => ({ mockGenerateObject: vi.fn() }));

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => "mock-model") }));
vi.mock("@/lib/prisma", () => ({
  prisma: { nutritionAiSummary: { findUnique: vi.fn(), upsert: vi.fn() } },
}));
vi.mock("@/lib/services/nutrition.service", () => ({
  getDailySummary: vi.fn(),
  getNutritionHistory: vi.fn(),
  averageAdherence: vi.fn(),
}));

import { estimateMealMacrosBatch } from "../nutrition-ai.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("estimateMealMacrosBatch", () => {
  it("returns an empty array without calling the model for an empty item list", async () => {
    const result = await estimateMealMacrosBatch([]);
    expect(result).toEqual([]);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("returns one estimate per input item, in order", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        items: [
          { calories: 5, proteinG: 0.3, carbsG: 1, fatG: 0 },
          { calories: 300, proteinG: 25, carbsG: 0, fatG: 20 },
        ],
      },
    });

    const result = await estimateMealMacrosBatch([
      { name: "Coffee", quantity: "1 cup" },
      { name: "Roasted chicken", quantity: "6 oz" },
    ]);

    expect(result).toEqual([
      { calories: 5, proteinG: 0.3, carbsG: 1, fatG: 0 },
      { calories: 300, proteinG: 25, carbsG: 0, fatG: 20 },
    ]);
  });

  it("throws if the model returns a different number of estimates than items submitted", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { items: [{ calories: 100, proteinG: 2, carbsG: 20, fatG: 1 }] },
    });

    await expect(
      estimateMealMacrosBatch([{ name: "Coffee" }, { name: "Bread" }])
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/services/__tests__/nutrition-ai.service.test.ts`
Expected: FAIL — `estimateMealMacrosBatch` is not exported from `../nutrition-ai.service`.

- [ ] **Step 3: Implement `estimateMealMacrosBatch`**

In `lib/services/nutrition-ai.service.ts`, add after the existing `estimateMealMacrosFromText` function (before the `// ─── Daily Summary ───` section):

```ts
const mealMacroBatchItemSchema = z.object({
  name: z.string(),
  quantity: z.string().optional(),
});

export type MealMacroBatchInput = z.infer<typeof mealMacroBatchItemSchema>;

const mealMacroBatchSchema = z.object({
  items: z
    .array(
      z.object({
        calories: z.number().int().min(0).describe("Estimated calories for this item"),
        proteinG: z.number().min(0).describe("Estimated grams of protein"),
        carbsG: z.number().min(0).describe("Estimated grams of carbohydrates"),
        fatG: z.number().min(0).describe("Estimated grams of fat"),
      })
    )
    .describe("One estimate per input item, in the same order as the input list"),
});

/**
 * Estimates macros for several food items in a single model call (e.g. "1 cup
 * coffee", "2 slices bread", "6 oz roasted chicken" logged together as one
 * meal) — the multi-item counterpart to estimateMealMacrosFromText. Never
 * writes to the database; the caller reviews/edits before saving.
 */
export async function estimateMealMacrosBatch(
  items: MealMacroBatchInput[]
): Promise<MealMacroEstimate[]> {
  if (items.length === 0) return [];

  const itemLines = items
    .map((item, i) => `${i + 1}. ${item.name}${item.quantity ? ` (serving size: "${item.quantity}")` : ""}`)
    .join("\n");

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: mealMacroBatchSchema,
    prompt: `Estimate the nutritional content of each of these food items, logged together as one meal:\n\n${itemLines}\n\nBe a reasonable, conservative estimator based on typical preparation and portion sizes — these are draft values a person will review and can correct before saving. Return exactly ${items.length} estimate(s), in the same order as the input list.`,
  });

  if (object.items.length !== items.length) {
    throw new Error(`Expected ${items.length} macro estimates but received ${object.items.length}`);
  }

  return object.items;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/services/__tests__/nutrition-ai.service.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing action test**

Create `actions/__tests__/nutrition-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const client = { id: 'client_1', role: 'CLIENT' }
const trainer = { id: 'trainer_1', role: 'TRAINER' }

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    nutritionLog: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  CopyObjectCommand: vi.fn(),
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }))
vi.mock('@/lib/r2', () => ({
  getR2Client: vi.fn(() => ({ send: vi.fn() })),
  R2_BUCKET_NAME: 'test-bucket',
  R2_PUBLIC_URL: 'https://pub.r2.dev',
}))
vi.mock('@/lib/pusher', () => ({ pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@/lib/services/notification.service', () => ({
  createNotification: vi.fn(),
  NOTIFICATION_TYPES: { NUTRITION_COMMENT: 'NUTRITION_COMMENT', NUTRITION_REPLY: 'NUTRITION_REPLY' },
}))
vi.mock('@/lib/services/client.service', () => ({
  getClientIdsForTrainer: vi.fn(),
  getTrainerForClient: vi.fn(),
}))
vi.mock('@/lib/services/nutrition.service', () => ({
  createNutritionLog: vi.fn(),
  updateNutritionLog: vi.fn(),
  deleteNutritionLog: vi.fn(),
  updateNutritionTarget: vi.fn(),
  addWaterLog: vi.fn(),
  createNutritionComment: vi.fn(),
  updateMealGroup: vi.fn(),
}))
vi.mock('@/lib/services/nutrition-ai.service', () => ({
  analyzeMealPhoto: vi.fn(),
  estimateMealMacrosBatch: vi.fn(),
  generateDailyNutritionSummary: vi.fn(),
  generateWeeklyNutritionReview: vi.fn(),
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import * as nutritionAiService from '@/lib/services/nutrition-ai.service'
import { estimateMealMacrosBatchAction } from '../nutrition-actions'

const mockAuth = vi.mocked(auth)
const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockEstimateBatch = vi.mocked(nutritionAiService.estimateMealMacrosBatch)

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
})

describe('estimateMealMacrosBatchAction', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const result = await estimateMealMacrosBatchAction({ items: [{ name: 'Coffee' }] })
    expect(result.success).toBe(false)
  })

  it('allows a client to estimate their own draft items', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)
    mockEstimateBatch.mockResolvedValue([{ calories: 5, proteinG: 0.3, carbsG: 1, fatG: 0 }])

    const result = await estimateMealMacrosBatchAction({ items: [{ name: 'Coffee' }] })

    expect(result.success).toBe(true)
    expect(result.success && result.data.estimates).toEqual([{ calories: 5, proteinG: 0.3, carbsG: 1, fatG: 0 }])
  })

  it("allows a trainer to estimate on a client's behalf", async () => {
    mockUserFindUnique.mockResolvedValue(trainer as never)
    mockEstimateBatch.mockResolvedValue([{ calories: 5, proteinG: 0.3, carbsG: 1, fatG: 0 }])

    const result = await estimateMealMacrosBatchAction({ items: [{ name: 'Coffee' }] })

    expect(result.success).toBe(true)
  })

  it('rejects an empty item list', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)
    const result = await estimateMealMacrosBatchAction({ items: [] })
    expect(result.success).toBe(false)
    expect(mockEstimateBatch).not.toHaveBeenCalled()
  })

  it('returns an error when the AI service throws', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)
    mockEstimateBatch.mockRejectedValue(new Error('model unavailable'))

    const result = await estimateMealMacrosBatchAction({ items: [{ name: 'Coffee' }] })

    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run actions/__tests__/nutrition-actions.test.ts`
Expected: FAIL — `estimateMealMacrosBatchAction` is not exported from `../nutrition-actions`.

- [ ] **Step 7: Implement the validator and the action**

In `lib/validators/nutrition.ts`, add after `estimateMealMacrosSchema`:

```ts
export const estimateMealMacrosBatchSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        quantity: z.string().max(100).optional(),
      })
    )
    .min(1)
    .max(20),
})
```

In `actions/nutrition-actions.ts`, add the import to the existing validators import block and add the action after `estimateMealMacrosAction`:

```ts
// add to the existing import from "@/lib/validators/nutrition":
  estimateMealMacrosBatchSchema,
```

```ts
export async function estimateMealMacrosBatchAction(
  input: unknown
): Promise<ActionResult<{ estimates: MealMacroEstimate[] }>> {
  const parsed = estimateMealMacrosBatchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "CLIENT" && user.role !== "TRAINER") {
    return { success: false, error: "Forbidden" };
  }

  try {
    const estimates = await nutritionAiService.estimateMealMacrosBatch(parsed.data.items);
    return { success: true, data: { estimates } };
  } catch (err) {
    console.error("[nutrition] estimateMealMacrosBatch error:", err);
    return { success: false, error: "Failed to estimate macros" };
  }
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run actions/__tests__/nutrition-actions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Commit**

```bash
git add lib/services/nutrition-ai.service.ts lib/validators/nutrition.ts actions/nutrition-actions.ts lib/services/__tests__/nutrition-ai.service.test.ts actions/__tests__/nutrition-actions.test.ts
git commit -m "feat(nutrition): add batched AI macro estimation for multi-item meals"
```

---

### Task 2: Manual multi-item entry UI

**Files:**
- Create: `components/nutrition/food-item-row-list.tsx`
- Modify: `components/nutrition/meal-log-dialog.tsx`

**Interfaces:**
- Consumes: `estimateMealMacrosBatchAction` (Task 1), existing `createNutritionLogsBulkAction`.
- Produces: `FoodItemDraft` type, `emptyFoodItemDraft()`, `FoodItemRowList` component from `components/nutrition/food-item-row-list.tsx` — consumed by Task 4's edit dialog.

This task has no new automated tests (no component test harness exists in this repo — see Global Constraints). Verify via manual QA in Step 5.

- [ ] **Step 1: Extract the shared food-item row-list component**

Create `components/nutrition/food-item-row-list.tsx`:

```tsx
"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface FoodItemDraft {
  id?: string;
  description: string;
  quantity: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

export function emptyFoodItemDraft(): FoodItemDraft {
  return { description: "", quantity: "", calories: "", proteinG: "", carbsG: "", fatG: "" };
}

interface FoodItemRowListProps {
  items: FoodItemDraft[];
  onChange: (index: number, field: keyof FoodItemDraft, value: string) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
  descriptionPlaceholder?: string;
}

export function FoodItemRowList({
  items,
  onChange,
  onRemove,
  disabled = false,
  descriptionPlaceholder = "e.g. Grilled chicken breast",
}: FoodItemRowListProps) {
  return (
    <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-lg p-3 ring-1 ring-border/50">
          <div className="flex items-center gap-2">
            <Input
              value={item.description}
              onChange={(e) => onChange(i, "description", e.target.value)}
              disabled={disabled}
              placeholder={descriptionPlaceholder}
              className="h-8 flex-1 text-sm"
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              disabled={disabled}
              aria-label="Remove item"
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Input
            value={item.quantity}
            onChange={(e) => onChange(i, "quantity", e.target.value)}
            disabled={disabled}
            placeholder="Serving size (e.g. 1 cup)"
            className="h-7 text-xs"
          />
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <div className="space-y-0.5">
              <Label className="text-[10px] font-normal text-muted-foreground">Calories (kcal)</Label>
              <Input
                type="number"
                value={item.calories}
                onChange={(e) => onChange(i, "calories", e.target.value)}
                disabled={disabled}
                placeholder="kcal"
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-normal text-muted-foreground">Protein (g)</Label>
              <Input
                type="number"
                value={item.proteinG}
                onChange={(e) => onChange(i, "proteinG", e.target.value)}
                disabled={disabled}
                placeholder="protein"
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-normal text-muted-foreground">Carbs (g)</Label>
              <Input
                type="number"
                value={item.carbsG}
                onChange={(e) => onChange(i, "carbsG", e.target.value)}
                disabled={disabled}
                placeholder="carbs"
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-normal text-muted-foreground">Fat (g)</Label>
              <Input
                type="number"
                value={item.fatG}
                onChange={(e) => onChange(i, "fatG", e.target.value)}
                disabled={disabled}
                placeholder="fat"
                className="h-7 text-xs"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Refactor `AiPhotoMealForm` to use the shared component**

In `components/nutrition/meal-log-dialog.tsx`:

1. Remove the local `interface DraftFood { ... }` block (lines 36-43).
2. Add to imports:
   ```ts
   import { FoodItemRowList, emptyFoodItemDraft, type FoodItemDraft } from "./food-item-row-list";
   ```
3. Remove `Trash2` from the `lucide-react` import (it's now only used inside `food-item-row-list.tsx`).
4. In `AiPhotoMealForm`, replace every remaining use of the type name `DraftFood` with `FoodItemDraft` (the `useState<DraftFood[] | null>` declaration and the `updateDraft`/`removeDraft` signatures).
5. Replace the inline `drafts.map((draft, i) => ( ... ))` block (the JSX that renders each draft row, roughly lines 551-632) with:
   ```tsx
   <FoodItemRowList
     items={drafts}
     onChange={(i, field, value) => updateDraft(i, field, value)}
     onRemove={removeDraft}
     disabled={busy}
   />
   ```

- [ ] **Step 3: Rewrite `ManualMealForm` for multi-item entry**

Replace the entire `ManualMealForm` function in `components/nutrition/meal-log-dialog.tsx` with:

```tsx
function ManualMealForm({
  clientId,
  date,
  mealType,
  onSaved,
  onCancel,
}: {
  clientId: string;
  date: Date;
  mealType: MealType;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isEstimating, setIsEstimating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploadState } = useMealPhotoUpload();

  const [items, setItems] = useState<FoodItemDraft[]>([emptyFoodItemDraft()]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const isUploadingPhoto = uploadState === "uploading" || uploadState === "confirming";
  const busy = isPending || isUploadingPhoto || isEstimating;
  const validItems = items.filter((i) => i.description.trim().length > 0);

  function updateItem(index: number, field: keyof FoodItemDraft, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyFoodItemDraft()]);
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleEstimate() {
    if (validItems.length === 0) {
      toast.error("Enter at least one food item first");
      return;
    }

    setIsEstimating(true);
    try {
      const result = await estimateMealMacrosBatchAction({
        items: validItems.map((i) => ({
          name: i.description.trim(),
          quantity: i.quantity.trim() || undefined,
        })),
      });

      if (result.success) {
        setItems((prev) => {
          const next = [...prev];
          let estimateIndex = 0;
          for (let i = 0; i < next.length; i++) {
            if (next[i].description.trim().length === 0) continue;
            const estimate = result.data.estimates[estimateIndex];
            estimateIndex++;
            if (!estimate) continue;
            next[i] = {
              ...next[i],
              calories: String(estimate.calories),
              proteinG: String(estimate.proteinG),
              carbsG: String(estimate.carbsG),
              fatG: String(estimate.fatG),
            };
          }
          return next;
        });
        toast.success("Estimated — review and adjust if needed");
      } else {
        toast.error(result.error ?? "Failed to estimate macros");
      }
    } finally {
      setIsEstimating(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (validItems.length === 0) {
      toast.error("Please enter at least one food item");
      return;
    }

    startTransition(async () => {
      let photoUrl: string | null = null;
      if (photoFile) {
        photoUrl = await upload(photoFile);
        if (!photoUrl) {
          toast.error("Photo upload failed — logging meal without photo");
        }
      }

      const result = await createNutritionLogsBulkAction({
        clientId,
        date,
        mealType,
        logs: validItems.map((i) => ({
          description: i.description.trim(),
          quantity: i.quantity.trim() || undefined,
          calories: i.calories ? parseInt(i.calories, 10) : undefined,
          proteinG: i.proteinG ? parseFloat(i.proteinG) : undefined,
          carbsG: i.carbsG ? parseFloat(i.carbsG) : undefined,
          fatG: i.fatG ? parseFloat(i.fatG) : undefined,
          photoUrl,
        })),
      });

      if (result.success) {
        toast.success(`Logged ${validItems.length} item${validItems.length !== 1 ? "s" : ""}`);
        onSaved();
      } else {
        toast.error(result.error ?? "Failed to log meal");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Food items</Label>
          <button
            type="button"
            onClick={handleEstimate}
            disabled={busy || validItems.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {isEstimating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Estimate with AI
          </button>
        </div>

        <FoodItemRowList items={items} onChange={updateItem} onRemove={removeItem} disabled={busy} />

        <button
          type="button"
          onClick={addItem}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add another item
        </button>

        <div className="space-y-2">
          <Label>Photo (optional)</Label>
          {photoPreview ? (
            <div className="relative w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="Meal preview" className="h-24 w-24 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => {
                  setPhotoFile(null);
                  setPhotoPreview(null);
                }}
                disabled={busy}
                className="absolute -right-2 -top-2 rounded-full bg-background p-1 ring-1 ring-border"
                aria-label="Remove photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg ring-1 ring-dashed ring-border/70 text-muted-foreground hover:ring-border"
            >
              <Camera className="h-5 w-5" />
              <span className="text-[10px]">Add photo</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelect}
            className="hidden"
          />
        </div>
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || validItems.length === 0}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save {validItems.length} Item{validItems.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 4: Remove now-dead code and fix imports**

In `components/nutrition/meal-log-dialog.tsx`:
1. Replace the `estimateMealMacrosAction` import with `estimateMealMacrosBatchAction` in the import block from `@/actions/nutrition-actions`, and remove the `createNutritionLogAction` import (no longer called anywhere in this file).

In `actions/nutrition-actions.ts`:
2. Delete the `createNutritionLogAction` function (lines ~92-112) — confirm no other caller first: `grep -rn "createNutritionLogAction" --include="*.ts" --include="*.tsx" .` should only show the definition line after this deletion.
3. Delete the `estimateMealMacrosAction` function (was around line 339-359) — confirm: `grep -rn "estimateMealMacrosAction\b" --include="*.ts" --include="*.tsx" .` should show zero matches after this deletion (note the `\b` so it doesn't match `estimateMealMacrosBatchAction`).
4. Remove `createNutritionLogSchema` and `estimateMealMacrosSchema` from the validators import block (leave `createNutritionLogSchema` itself defined in `lib/validators/nutrition.ts` for now — `updateNutritionLogSchema` still derives from it until Task 3).

In `lib/services/nutrition-ai.service.ts`:
5. Delete the `estimateMealMacrosFromText` function and its `mealMacroEstimateSchema` — **wait**, `mealMacroEstimateSchema` also defines the `MealMacroEstimate` type used by the new batch estimator. Keep `mealMacroEstimateSchema`/`MealMacroEstimate`; delete only the `estimateMealMacrosFromText` function itself (confirm no other caller: `grep -rn "estimateMealMacrosFromText" --include="*.ts" .` should show zero matches afterward).

In `lib/validators/nutrition.ts`:
6. Delete the `estimateMealMacrosSchema` export (confirm no remaining references with `grep -rn "estimateMealMacrosSchema\b" --include="*.ts" .`).

- [ ] **Step 5: Manual QA (no component test harness in this repo)**

Run `npm run dev`, open the nutrition page as a client, click "Log Meal" → "Manual Entry":
- Add three rows: "Coffee" / "1 cup", "Bread" / "2 slices", "Roasted chicken" / "6 oz".
- Click "Estimate with AI" — verify all three rows get populated with plausible, distinct macro values (not one lump sum).
- Remove one row, add another empty row (leave its description blank), click "Estimate with AI" again — verify it estimates only the two non-empty rows and does not error on the blank one.
- Submit — verify a toast confirms "Logged 2 items" (or however many non-empty rows) and the meals table shows each item as a separate row under the correct meal type.
- Switch to "AI Photo" mode and confirm the existing photo-analysis flow still works unchanged (upload a photo, see draft rows, edit one, save).

- [ ] **Step 6: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: all existing tests still PASS (no regressions from the deleted actions/schemas).

- [ ] **Step 7: Commit**

```bash
git add components/nutrition/food-item-row-list.tsx components/nutrition/meal-log-dialog.tsx actions/nutrition-actions.ts lib/services/nutrition-ai.service.ts lib/validators/nutrition.ts
git commit -m "feat(nutrition): support structured multi-item manual meal entry"
```

---

### Task 3: Meal-group update (edit backend)

**Files:**
- Modify: `lib/services/nutrition.service.ts`
- Modify: `lib/validators/nutrition.ts`
- Modify: `actions/nutrition-actions.ts`
- Test: `lib/services/__tests__/nutrition.service.test.ts` (modify)
- Test: `actions/__tests__/nutrition-actions.test.ts` (modify)

**Interfaces:**
- Consumes: existing `createNutritionLog`, `updateNutritionLog`, `dayRange` helper (all in `nutrition.service.ts`).
- Produces: `updateMealGroup(clientId: string, date: Date, mealType: string, items: MealGroupItemInput[]): Promise<{ids: string[]}>` (service), `updateMealGroupSchema` (validator), `updateMealGroupAction(clientId: string, date: Date, mealType: string, input: unknown): Promise<ActionResult<{ids: string[]}>>` (action) — consumed by Task 4's edit dialog.

- [ ] **Step 1: Write the failing service test**

In `lib/services/__tests__/nutrition.service.test.ts`, add at the top (this file currently has no mocks — adding them here is safe since `computeAdherence` doesn't touch prisma):

```ts
vi.mock('@/lib/prisma', () => ({
  prisma: {
    nutritionLog: { findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  },
}))
```

Update the top import line to include `vi` and the new function, then add a new `describe` block:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeAdherence, updateMealGroup } from '../nutrition.service'
import { prisma } from '@/lib/prisma'

const mockFindMany = vi.mocked(prisma.nutritionLog.findMany)
const mockUpdate = vi.mocked(prisma.nutritionLog.update)
const mockDeleteMany = vi.mocked(prisma.nutritionLog.deleteMany)
const mockCreate = vi.mocked(prisma.nutritionLog.create)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updateMealGroup', () => {
  const clientId = 'client_1'
  const date = new Date('2026-08-01T00:00:00Z')
  const mealType = 'BREAKFAST'

  it('rejects an empty item list instead of deleting the whole meal', async () => {
    await expect(updateMealGroup(clientId, date, mealType, [])).rejects.toThrow()
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('updates existing items by id and leaves untouched rows alone', async () => {
    mockFindMany.mockResolvedValue([{ id: 'log_1' }, { id: 'log_2' }] as never)
    mockUpdate.mockResolvedValue({ id: 'log_1' } as never)

    await updateMealGroup(clientId, date, mealType, [
      { id: 'log_1', description: 'Coffee', quantity: '1 cup' },
      { id: 'log_2', description: 'Bread', quantity: '2 slices' },
    ])

    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockDeleteMany).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('creates rows for items with no id', async () => {
    mockFindMany.mockResolvedValue([] as never)
    mockCreate.mockResolvedValue({ id: 'log_new' } as never)

    await updateMealGroup(clientId, date, mealType, [{ description: 'New item', quantity: '1 serving' }])

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it('deletes existing rows that are not present in the submitted list', async () => {
    mockFindMany.mockResolvedValue([{ id: 'log_1' }, { id: 'log_2' }] as never)
    mockUpdate.mockResolvedValue({ id: 'log_1' } as never)

    await updateMealGroup(clientId, date, mealType, [{ id: 'log_1', description: 'Coffee' }])

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['log_2'] } } })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/services/__tests__/nutrition.service.test.ts`
Expected: FAIL — `updateMealGroup` is not exported from `../nutrition.service`, and `prisma` import resolves to the real (unmocked-until-now) module inconsistently. If the existing `computeAdherence` tests break due to the new mock, adjust: they don't touch prisma so they should be unaffected.

- [ ] **Step 3: Implement `updateMealGroup`**

In `lib/services/nutrition.service.ts`, add after `deleteNutritionLog`:

```ts
export interface MealGroupItemInput {
  id?: string;
  description: string;
  quantity?: string | null;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  photoUrl?: string | null;
}

/**
 * Replaces the set of NutritionLog rows for a (clientId, date, mealType)
 * group with `items`, diffing against what's currently stored: items with an
 * `id` are updated, items without one are created, and existing rows not
 * present in `items` are deleted. Throws if `items` is empty rather than
 * silently deleting the whole meal — callers should delete individual logs
 * instead if that's the intent.
 */
export async function updateMealGroup(
  clientId: string,
  date: Date,
  mealType: string,
  items: MealGroupItemInput[]
): Promise<{ ids: string[] }> {
  if (items.length === 0) {
    throw new Error("A meal must have at least one item — delete it instead if you want to remove it entirely");
  }

  const { start, end } = dayRange(date);
  const existing = await prisma.nutritionLog.findMany({
    where: { clientId, date: { gte: start, lt: end }, mealType },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((l) => l.id));
  const submittedIds = new Set(items.filter((i) => i.id).map((i) => i.id as string));
  const toDelete = [...existingIds].filter((id) => !submittedIds.has(id));

  const [updated, created] = await Promise.all([
    Promise.all(
      items
        .filter((i): i is MealGroupItemInput & { id: string } => Boolean(i.id))
        .map((i) =>
          updateNutritionLog(i.id, {
            description: i.description,
            quantity: i.quantity ?? null,
            calories: i.calories ?? null,
            proteinG: i.proteinG ?? null,
            carbsG: i.carbsG ?? null,
            fatG: i.fatG ?? null,
          })
        )
    ),
    Promise.all(
      items
        .filter((i) => !i.id)
        .map((i) =>
          createNutritionLog({
            clientId,
            date,
            mealType,
            description: i.description,
            quantity: i.quantity ?? undefined,
            calories: i.calories,
            proteinG: i.proteinG,
            carbsG: i.carbsG,
            fatG: i.fatG,
            photoUrl: i.photoUrl,
          })
        )
    ),
  ]);

  if (toDelete.length > 0) {
    await prisma.nutritionLog.deleteMany({ where: { id: { in: toDelete } } });
  }

  return { ids: [...updated.map((l) => l.id), ...created.map((l) => l.id)] };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/services/__tests__/nutrition.service.test.ts`
Expected: PASS (all `computeAdherence` tests plus the new 4 `updateMealGroup` tests)

- [ ] **Step 5: Write the failing action test**

In `actions/__tests__/nutrition-actions.test.ts` (created in Task 1), add:

```ts
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as nutritionService from '@/lib/services/nutrition.service'
import { updateMealGroupAction } from '../nutrition-actions'

const mockGetClientIdsForTrainer = vi.mocked(getClientIdsForTrainer)
const mockUpdateMealGroup = vi.mocked(nutritionService.updateMealGroup)

describe('updateMealGroupAction', () => {
  const date = new Date('2026-08-01T00:00:00Z')

  it('allows a client to update their own meal group', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)
    mockUpdateMealGroup.mockResolvedValue({ ids: ['log_1'] })

    const result = await updateMealGroupAction('client_1', date, 'BREAKFAST', {
      items: [{ id: 'log_1', description: 'Coffee' }],
    })

    expect(result.success).toBe(true)
  })

  it("rejects a client trying to update another client's meal group", async () => {
    mockUserFindUnique.mockResolvedValue(client as never)

    const result = await updateMealGroupAction('someone_else', date, 'BREAKFAST', {
      items: [{ description: 'Coffee' }],
    })

    expect(result.success).toBe(false)
    expect(mockUpdateMealGroup).not.toHaveBeenCalled()
  })

  it("allows a trainer to update their client's meal group", async () => {
    mockUserFindUnique.mockResolvedValue(trainer as never)
    mockGetClientIdsForTrainer.mockResolvedValue(['client_1'])
    mockUpdateMealGroup.mockResolvedValue({ ids: ['log_1'] })

    const result = await updateMealGroupAction('client_1', date, 'BREAKFAST', {
      items: [{ id: 'log_1', description: 'Coffee' }],
    })

    expect(result.success).toBe(true)
  })

  it("rejects a trainer updating a client outside their roster", async () => {
    mockUserFindUnique.mockResolvedValue(trainer as never)
    mockGetClientIdsForTrainer.mockResolvedValue(['someone_else'])

    const result = await updateMealGroupAction('client_1', date, 'BREAKFAST', {
      items: [{ description: 'Coffee' }],
    })

    expect(result.success).toBe(false)
    expect(mockUpdateMealGroup).not.toHaveBeenCalled()
  })

  it('surfaces the empty-items error message from the service layer', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)
    mockUpdateMealGroup.mockRejectedValue(new Error('A meal must have at least one item'))

    const result = await updateMealGroupAction('client_1', date, 'BREAKFAST', { items: [] })

    expect(result.success).toBe(false)
  })
})
```

Note: the fifth test's `{ items: [] }` will actually fail Zod validation before reaching the service (since real behavior should reject empty arrays at some layer) — confirm in Step 7 which layer produces the rejection and that the test still asserts `success: false` either way, which it does.

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run actions/__tests__/nutrition-actions.test.ts`
Expected: FAIL — `updateMealGroupAction` is not exported from `../nutrition-actions`.

- [ ] **Step 7: Implement the validator and the action, and delete superseded dead code**

In `lib/validators/nutrition.ts`, add after `bulkCreateNutritionLogSchema`:

```ts
export const updateMealGroupSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        description: z.string().min(1).max(200),
        quantity: z.string().max(100).nullable().optional(),
        calories: z.number().int().min(0).max(10000).nullable().optional(),
        proteinG: z.number().min(0).max(2000).nullable().optional(),
        carbsG: z.number().min(0).max(2000).nullable().optional(),
        fatG: z.number().min(0).max(2000).nullable().optional(),
        photoUrl: z.string().url().nullable().optional(),
      })
    )
    .max(20),
})
```

Delete `updateNutritionLogSchema` (its only consumer, `updateNutritionLogAction`, is being deleted next) and `createNutritionLogSchema` (its last remaining consumer was `updateNutritionLogSchema`) from `lib/validators/nutrition.ts`. Confirm afterward: `grep -rn "updateNutritionLogSchema\|createNutritionLogSchema" --include="*.ts" --include="*.tsx" .` shows zero matches.

In `actions/nutrition-actions.ts`:
1. Delete the `updateNutritionLogAction` function (it has zero callers — confirmed dead, superseded by group-based editing).
2. Remove `updateNutritionLogSchema` from the validators import block.
3. Add `updateMealGroupSchema` to the validators import block.
4. Add the new action after `deleteNutritionLogAction`:

```ts
export async function updateMealGroupAction(
  clientId: string,
  date: Date,
  mealType: string,
  input: unknown
): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = updateMealGroupSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role === "CLIENT") {
    if (user.id !== clientId) return { success: false, error: "Forbidden" };
  } else if (user.role === "TRAINER") {
    if (!(await canTrainerAccessClient(user.id, clientId))) {
      return { success: false, error: "Forbidden" };
    }
  } else {
    return { success: false, error: "Forbidden" };
  }

  try {
    const { ids } = await nutritionService.updateMealGroup(clientId, date, mealType, parsed.data.items);
    revalidatePath("/nutrition");
    revalidatePath(`/nutrition/${clientId}`);
    return { success: true, data: { ids } };
  } catch (err) {
    console.error("[nutrition] updateMealGroup error:", err);
    const message = err instanceof Error ? err.message : "Failed to update meal";
    return { success: false, error: message };
  }
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run actions/__tests__/nutrition-actions.test.ts`
Expected: PASS (all tests from Task 1 plus the new 5 `updateMealGroupAction` tests)

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: all tests PASS, no regressions.

- [ ] **Step 10: Commit**

```bash
git add lib/services/nutrition.service.ts lib/validators/nutrition.ts actions/nutrition-actions.ts lib/services/__tests__/nutrition.service.test.ts actions/__tests__/nutrition-actions.test.ts
git commit -m "feat(nutrition): add diff-based meal-group update for editing logged meals"
```

---

### Task 4: Edit meal group dialog UI

**Files:**
- Create: `components/nutrition/edit-meal-group-dialog.tsx`
- Modify: `components/nutrition/meals-table.tsx`
- Modify: `app/(platform)/nutrition/page.tsx`
- Modify: `app/(platform)/nutrition/[clientId]/page.tsx`

**Interfaces:**
- Consumes: `FoodItemDraft`, `emptyFoodItemDraft`, `FoodItemRowList` (Task 2), `updateMealGroupAction`, `estimateMealMacrosBatchAction` (Tasks 1 & 3).
- Produces: `EditMealGroupDialog` component; `canEdit: boolean` prop added to `MealsTable`.

No new automated tests (UI-only change, no component test harness — see Global Constraints). Verified via manual QA in Step 4.

- [ ] **Step 1: Create the edit dialog**

Create `components/nutrition/edit-meal-group-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Loader2, Sparkles } from "lucide-react";
import { updateMealGroupAction, estimateMealMacrosBatchAction } from "@/actions/nutrition-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FoodItemRowList, emptyFoodItemDraft, type FoodItemDraft } from "./food-item-row-list";

const MEAL_LABELS: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack",
};

interface EditableLog {
  id: string;
  description: string;
  quantity: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

interface EditMealGroupDialogProps {
  clientId: string;
  date: Date;
  mealType: string;
  logs: EditableLog[];
}

function toDraft(log: EditableLog): FoodItemDraft {
  return {
    id: log.id,
    description: log.description,
    quantity: log.quantity ?? "",
    calories: log.calories != null ? String(log.calories) : "",
    proteinG: log.proteinG != null ? String(log.proteinG) : "",
    carbsG: log.carbsG != null ? String(log.carbsG) : "",
    fatG: log.fatG != null ? String(log.fatG) : "",
  };
}

export function EditMealGroupDialog({ clientId, date, mealType, logs }: EditMealGroupDialogProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FoodItemDraft[]>([]);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSaving, startSaving] = useTransition();

  const busy = isEstimating || isSaving;
  const validItems = items.filter((i) => i.description.trim().length > 0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setItems(logs.map(toDraft));
  }

  function updateItem(index: number, field: keyof FoodItemDraft, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyFoodItemDraft()]);
  }

  async function handleEstimate() {
    if (validItems.length === 0) {
      toast.error("Add at least one food item first");
      return;
    }

    setIsEstimating(true);
    try {
      const result = await estimateMealMacrosBatchAction({
        items: validItems.map((i) => ({
          name: i.description.trim(),
          quantity: i.quantity.trim() || undefined,
        })),
      });

      if (result.success) {
        setItems((prev) => {
          const next = [...prev];
          let estimateIndex = 0;
          for (let i = 0; i < next.length; i++) {
            if (next[i].description.trim().length === 0) continue;
            const estimate = result.data.estimates[estimateIndex];
            estimateIndex++;
            if (!estimate) continue;
            next[i] = {
              ...next[i],
              calories: String(estimate.calories),
              proteinG: String(estimate.proteinG),
              carbsG: String(estimate.carbsG),
              fatG: String(estimate.fatG),
            };
          }
          return next;
        });
        toast.success("Estimated — review and adjust if needed");
      } else {
        toast.error(result.error ?? "Failed to estimate macros");
      }
    } finally {
      setIsEstimating(false);
    }
  }

  function handleSave() {
    if (validItems.length === 0) {
      toast.error("A meal needs at least one item — delete it instead if you want to remove it entirely");
      return;
    }

    startSaving(async () => {
      const result = await updateMealGroupAction(clientId, date, mealType, {
        items: validItems.map((i) => ({
          id: i.id,
          description: i.description.trim(),
          quantity: i.quantity.trim() || undefined,
          calories: i.calories ? parseInt(i.calories, 10) : undefined,
          proteinG: i.proteinG ? parseFloat(i.proteinG) : undefined,
          carbsG: i.carbsG ? parseFloat(i.carbsG) : undefined,
          fatG: i.fatG ? parseFloat(i.fatG) : undefined,
        })),
      });

      if (result.success) {
        toast.success("Meal updated");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed to update meal");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        aria-label={`Edit ${MEAL_LABELS[mealType] ?? mealType}`}
        className="rounded-md p-1 text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {MEAL_LABELS[mealType] ?? mealType}</DialogTitle>
          <DialogDescription>Add, remove, or adjust items logged under this meal.</DialogDescription>
        </DialogHeader>

        <div className="mt-3 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Food items</Label>
            <button
              type="button"
              onClick={handleEstimate}
              disabled={busy || validItems.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {isEstimating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Re-estimate with AI
            </button>
          </div>

          <FoodItemRowList items={items} onChange={updateItem} onRemove={removeItem} disabled={busy} />

          <button
            type="button"
            onClick={addItem}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add another item
          </button>
        </div>

        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={busy || validItems.length === 0}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire the edit affordance into `MealsTable`**

In `components/nutrition/meals-table.tsx`:

1. Add the import: `import { EditMealGroupDialog } from "./edit-meal-group-dialog";`
2. Add `canEdit: boolean` to the `MealsTableProps` interface and to the destructured props of `MealsTable`.
3. In the actions cell (inside the `<div className="flex items-center justify-end gap-0.5">` block), add the edit button before the existing delete button:

```tsx
{canEdit && (
  <EditMealGroupDialog
    clientId={clientId}
    date={date}
    mealType={log.mealType}
    logs={sorted.filter((l) => l.mealType === log.mealType)}
  />
)}
{canDelete && <DeleteLogButton logId={log.id} />}
```

Note: since the table renders one row per food item (not grouped visually), every row belonging to the same meal type will show its own edit button — clicking any of them opens the same shared group dialog pre-filled with all of that meal type's items. This is intentional; a full visual regrouping of the table is out of scope for this plan.

- [ ] **Step 3: Pass `canEdit` from both page call sites**

In `app/(platform)/nutrition/page.tsx`, in `ClientNutritionView`'s `<MealsTable ... />` call, change:

```tsx
<MealsTable clientId={clientId} date={today} logs={logs} comments={comments} canDelete />
```

to:

```tsx
<MealsTable clientId={clientId} date={today} logs={logs} comments={comments} canDelete canEdit />
```

In `app/(platform)/nutrition/[clientId]/page.tsx`, in `ClientNutritionDetailPage`'s `<MealsTable ... />` call, change:

```tsx
<MealsTable
  clientId={clientId}
  date={today}
  logs={logs}
  comments={comments}
  canDelete={false}
/>
```

to:

```tsx
<MealsTable
  clientId={clientId}
  date={today}
  logs={logs}
  comments={comments}
  canDelete={false}
  canEdit
/>
```

(Trainers get edit access — including removing individual items via the dialog — but not the bare per-row delete button, per the Global Constraints.)

- [ ] **Step 4: Manual QA**

Run `npm run dev`:
- As a client: log a multi-item breakfast, then click the pencil icon on one of its rows. Verify the dialog opens pre-filled with all breakfast items, not just the one clicked. Add one new item, remove one existing item, change a quantity, click "Re-estimate with AI", then "Save Changes" — verify the meals table reflects the new item set (correct count of rows, correct data) without a page reload.
- Try removing every item in the dialog and saving — verify a toast blocks the save with the "at least one item" message.
- As a trainer viewing that same client's nutrition detail page: verify the pencil icon appears and works identically, but the per-row trash icon is absent.

- [ ] **Step 5: Commit**

```bash
git add components/nutrition/edit-meal-group-dialog.tsx components/nutrition/meals-table.tsx "app/(platform)/nutrition/page.tsx" "app/(platform)/nutrition/[clientId]/page.tsx"
git commit -m "feat(nutrition): let clients and trainers edit previously-logged meals"
```

---

### Task 5: Browse previous days' meals

**Files:**
- Modify: `lib/services/nutrition.service.ts`
- Create: `components/nutrition/date-navigator.tsx`
- Modify: `components/nutrition/meals-table.tsx`
- Modify: `app/(platform)/nutrition/page.tsx`
- Modify: `app/(platform)/nutrition/[clientId]/page.tsx`
- Test: `lib/services/__tests__/nutrition.service.test.ts` (modify)

**Interfaces:**
- Consumes: existing `dayRange`, `getNutritionLogsForDate`, `getNutritionCommentsForDate`.
- Produces: `parseNutritionDateParam(raw: string | undefined): Date` (service helper), `DateNavigator` component.

- [ ] **Step 1: Write the failing test for date-param parsing**

In `lib/services/__tests__/nutrition.service.test.ts`, add:

```ts
describe('parseNutritionDateParam', () => {
  it('returns today when given undefined', () => {
    const result = parseNutritionDateParam(undefined)
    const today = new Date()
    expect(result.toDateString()).toBe(today.toDateString())
  })

  it('returns today when given an invalid date string', () => {
    const result = parseNutritionDateParam('not-a-date')
    const today = new Date()
    expect(result.toDateString()).toBe(today.toDateString())
  })

  it('parses a valid past date string as-is', () => {
    const result = parseNutritionDateParam('2026-01-15')
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(0)
    expect(result.getDate()).toBe(15)
  })

  it('clamps a future date to today', () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    const futureParam = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`

    const result = parseNutritionDateParam(futureParam)
    const today = new Date()
    expect(result.toDateString()).toBe(today.toDateString())
  })
})
```

Update the import line to include `parseNutritionDateParam`:

```ts
import { computeAdherence, updateMealGroup, parseNutritionDateParam } from '../nutrition.service'
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/services/__tests__/nutrition.service.test.ts`
Expected: FAIL — `parseNutritionDateParam` is not exported from `../nutrition.service`.

- [ ] **Step 3: Implement `parseNutritionDateParam`**

In `lib/services/nutrition.service.ts`, add near the top, after the `dayRange` helper:

```ts
/**
 * Parses a `?date=YYYY-MM-DD` search param into a Date for the meals-history
 * view. Falls back to today for a missing or invalid value, and clamps any
 * future date to today — the meals table never navigates ahead of the
 * present day.
 */
export function parseNutritionDateParam(raw: string | undefined): Date {
  if (!raw) return new Date();

  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return new Date();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed.getTime() > today.getTime()) return today;

  return parsed;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/services/__tests__/nutrition.service.test.ts`
Expected: PASS (all tests in the file, including the 4 new ones)

- [ ] **Step 5: Build the date navigator component**

Create `components/nutrition/date-navigator.tsx`:

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface DateNavigatorProps {
  date: Date;
}

function toDateParam(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function DateNavigator({ date }: DateNavigatorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const todayParam = toDateParam(new Date());
  const isToday = toDateParam(date) === todayParam;

  function navigate(nextDate: Date) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", toDateParam(nextDate));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => navigate(addDays(date, -1))}
        aria-label="Previous day"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="date"
        value={toDateParam(date)}
        max={todayParam}
        onChange={(e) => {
          if (e.target.value) navigate(new Date(`${e.target.value}T00:00:00`));
        }}
        className="rounded-md bg-transparent px-1.5 py-1 text-xs ring-1 ring-border/50"
      />
      <button
        type="button"
        onClick={() => navigate(addDays(date, 1))}
        disabled={isToday}
        aria-label="Next day"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Make the meals table's empty state date-aware**

In `components/nutrition/meals-table.tsx`, replace:

```tsx
<p className="text-sm text-muted-foreground">No meals logged yet today.</p>
```

with:

```tsx
<p className="text-sm text-muted-foreground">No meals logged for {format(date, "MMM d")}.</p>
```

(`format` and `date` are already imported/in-scope in this file.)

- [ ] **Step 7: Wire date navigation into the client nutrition page**

In `app/(platform)/nutrition/page.tsx`:

1. Add imports:
   ```ts
   import { DateNavigator } from "@/components/nutrition/date-navigator";
   ```
   and add `parseNutritionDateParam` to the existing `import * as nutritionService from "@/lib/services/nutrition.service";` usage (it's accessed as `nutritionService.parseNutritionDateParam`, no separate import needed).

2. Change the default export to accept and forward `searchParams`:

```tsx
export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const user = await getCurrentUser();

  if (user.role === "TRAINER") {
    return <TrainerNutritionView trainerId={user.id} />;
  }

  return <ClientNutritionView clientId={user.id} dateParam={dateParam} />;
}
```

3. Update `ClientNutritionView` to accept `dateParam` and compute a separate `mealsDate` (the macro progress bars / insights tab stay anchored to real "today"; only the meals list and its comments/notes navigate):

```tsx
async function ClientNutritionView({ clientId, dateParam }: { clientId: string; dateParam?: string }) {
  const today = new Date();
  const mealsDate = nutritionService.parseNutritionDateParam(dateParam);

  const [summary, history7, history30, weekly, mealsLogs, mealsComments] = await Promise.all([
    nutritionService.getDailySummary(clientId, today),
    nutritionService.getNutritionHistory(clientId, 7),
    nutritionService.getNutritionHistory(clientId, 30),
    accountabilityService.computeWeeklyAccountabilityScore(clientId, today),
    nutritionService.getNutritionLogsForDate(clientId, mealsDate),
    nutritionService.getNutritionCommentsForDate(clientId, mealsDate),
  ]);
```

4. Replace the two `logs`/`comments` references inside the `"today"` `TabsContent` block with `mealsLogs`/`mealsComments`, and update the meals-header row to include the date navigator:

```tsx
<TabsContent value="today" className="space-y-5 pt-1">
  <div className="flex flex-wrap items-center justify-between gap-2">
    <h3 className="text-sm font-semibold">Meals</h3>
    <div className="flex items-center gap-2">
      <DateNavigator date={mealsDate} />
      <MealLogDialog clientId={clientId} date={today} />
    </div>
  </div>

  <MealsTable clientId={clientId} date={mealsDate} logs={mealsLogs} comments={mealsComments} canDelete canEdit />

  <DayNotesCard clientId={clientId} date={mealsDate} comments={mealsComments} />

  <div className="rounded-xl p-4 ring-1 ring-border/50 shadow-sm">
    <DailySummaryCard clientId={clientId} date={today} />
  </div>
</TabsContent>
```

(`MealLogDialog` keeps logging against `today`, not `mealsDate` — logging a new meal always applies to the present day; only browsing navigates history.)

- [ ] **Step 8: Wire date navigation into the trainer's client-detail page**

In `app/(platform)/nutrition/[clientId]/page.tsx`:

1. Add the import: `import { DateNavigator } from "@/components/nutrition/date-navigator";`
2. Change the function signature to also accept `searchParams`:

```tsx
export default async function ClientNutritionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { clientId } = await params;
  const { date: dateParam } = await searchParams;
  const user = await getCurrentUser();
```

3. After the existing `const today = new Date();` line, add:

```tsx
  const mealsDate = nutritionService.parseNutritionDateParam(dateParam);
```

4. Change `getNutritionLogsForDate`/`getNutritionCommentsForDate` in the `Promise.all` to use `mealsDate` instead of `today` — rename the destructured results (`logs`, `comments`) to `mealsLogs`, `mealsComments` to keep the "today" stats (`summary`, `history7`, `history30`, `weekly`) unambiguously anchored to the real present day:

```tsx
  const [summary, mealsLogs, mealsComments, history7, history30, weekly] = await Promise.all([
    nutritionService.getDailySummary(clientId, today),
    nutritionService.getNutritionLogsForDate(clientId, mealsDate),
    nutritionService.getNutritionCommentsForDate(clientId, mealsDate),
    nutritionService.getNutritionHistory(clientId, 7),
    nutritionService.getNutritionHistory(clientId, 30),
    accountabilityService.computeWeeklyAccountabilityScore(clientId, today),
  ]);
```

5. Update the `"today"` `TabsContent` block to add the header row with the navigator and use `mealsLogs`/`mealsComments`:

```tsx
<TabsContent value="today" className="space-y-5 pt-1">
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-semibold">Meals</h3>
    <DateNavigator date={mealsDate} />
  </div>

  <MealsTable
    clientId={clientId}
    date={mealsDate}
    logs={mealsLogs}
    comments={mealsComments}
    canDelete={false}
    canEdit
  />

  <DayNotesCard clientId={clientId} date={mealsDate} comments={mealsComments} />
</TabsContent>
```

6. Check the other two references to `comments` in this file (the page header's meal count and the "Insights" tab, if any) and update them to use whichever variable is semantically correct — the header's `summary.mealsLogged` count is a "today" stat and needs no change; if `comments` is referenced anywhere outside the "today" tab, rename that usage to `mealsComments` for consistency.

- [ ] **Step 9: Manual QA**

Run `npm run dev`:
- As a client, log a meal today, then navigate to yesterday via the "previous day" arrow — verify yesterday's (likely empty, unless seed data exists) meals show and the empty state reads "No meals logged for [date]" rather than "today".
- Click "next day" repeatedly until back at today — verify the button becomes disabled and does not navigate past today.
- Use the date picker to jump directly to a date from a week ago — verify the URL updates with `?date=...` and the table reflects that day.
- Repeat as a trainer on a client's detail page — verify the same navigation works and the client's actual "today" macro stats (progress bars, adherence) stay unchanged regardless of which day the meals table is showing.

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: all tests PASS, no regressions.

- [ ] **Step 11: Commit**

```bash
git add lib/services/nutrition.service.ts components/nutrition/date-navigator.tsx components/nutrition/meals-table.tsx "app/(platform)/nutrition/page.tsx" "app/(platform)/nutrition/[clientId]/page.tsx" lib/services/__tests__/nutrition.service.test.ts
git commit -m "feat(nutrition): browse previous days' meals with date navigation"
```
