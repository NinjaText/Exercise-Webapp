"use client";

import { Loader2, RefreshCw, Trash2 } from "lucide-react";
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
  /** Read-only ingredients of a combined dish (from photo analysis) — already included in its macros. */
  components?: string[];
  /** The name + serving the AI numbers were produced for — see `foodEstimateKey`. */
  estimatedFor?: string;
}

/** The draft fields a user edits as text in a food row. */
export type EditableFoodField = Exclude<keyof FoodItemDraft, "id" | "components" | "estimatedFor">;

/** Identifies what an AI estimate was for, so edits to the name or serving can be detected. */
export function foodEstimateKey(item: Pick<FoodItemDraft, "description" | "quantity">): string {
  return `${item.description.trim().toLowerCase()}|${item.quantity.trim().toLowerCase()}`;
}

export function emptyFoodItemDraft(): FoodItemDraft {
  return { description: "", quantity: "", calories: "", proteinG: "", carbsG: "", fatG: "" };
}

interface FoodItemRowListProps {
  items: FoodItemDraft[];
  onChange: (index: number, field: EditableFoodField, value: string) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
  descriptionPlaceholder?: string;
  /** When set, each row gets a "Re-estimate" button that re-runs the AI for that row. */
  onReestimate?: (index: number) => void;
  reestimatingIndex?: number | null;
}

export function FoodItemRowList({
  items,
  onChange,
  onRemove,
  disabled = false,
  descriptionPlaceholder = "e.g. Grilled chicken breast",
  onReestimate,
  reestimatingIndex = null,
}: FoodItemRowListProps) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isReestimating = reestimatingIndex === i;
        const isStale = item.estimatedFor !== undefined && item.estimatedFor !== foodEstimateKey(item);
        return (
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
          <div className="flex items-center gap-2">
            <Input
              value={item.quantity}
              onChange={(e) => onChange(i, "quantity", e.target.value)}
              disabled={disabled}
              placeholder="Serving size (e.g. 1 cup)"
              className="h-7 flex-1 text-xs"
            />
            {onReestimate && (
              <button
                type="button"
                onClick={() => onReestimate(i)}
                disabled={disabled || item.description.trim().length === 0}
                className={
                  isStale
                    ? "inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    : "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                }
              >
                {isReestimating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Re-estimate
              </button>
            )}
          </div>
          {onReestimate && isStale && (
            <p className="text-[11px] leading-snug text-primary">
              Food or amount changed. Re-estimate to update the numbers, or edit them yourself.
            </p>
          )}
          {item.components && item.components.length > 0 && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Includes {item.components.join(", ")} (already counted in this item&apos;s totals)
            </p>
          )}
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
        );
      })}
    </div>
  );
}
