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
  // An item that already has an `id` is a real, previously-logged row — if its
  // description gets blanked out (as opposed to removed via the trash
  // button), silently excluding it from the submitted set would make
  // `updateMealGroup` treat it as removed and delete it, cascading to delete
  // any trainer comments attached to it. Rows without an `id` are fresh
  // "+ Add another item" rows the user never filled in, and are still
  // silently dropped — that's expected, existing behavior.
  const hasBlankedExistingItem = items.some((i) => i.id && i.description.trim().length === 0);

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
    if (hasBlankedExistingItem) {
      toast.error(
        "Item name can't be empty — use the remove (trash) button to delete an item instead of clearing its name."
      );
      return;
    }
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

      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
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
