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
    <div className="space-y-3">
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
