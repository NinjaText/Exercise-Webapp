"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { upsertNutritionTargetAction } from "@/actions/nutrition-actions";
import { NUTRITION_TARGET_FIELDS, type NutritionTargetField } from "@/lib/validators/nutrition";

const FIELD_META: Record<NutritionTargetField, { label: string; unit: string }> = {
  calories: { label: "Calories", unit: "kcal" },
  proteinG: { label: "Protein", unit: "g" },
  carbsG: { label: "Carbs", unit: "g" },
  fatG: { label: "Fat", unit: "g" },
  fiberG: { label: "Fiber", unit: "g" },
  waterMl: { label: "Water", unit: "ml" },
  mealsPerDayTarget: { label: "Meals / day", unit: "" },
};

interface NutritionTargetFormProps {
  clientId: string;
  role: "TRAINER" | "CLIENT";
  target: {
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
    waterMl: number | null;
    mealsPerDayTarget: number | null;
    clientEditableFields: string[];
  };
  onSaved?: () => void;
}

export function NutritionTargetForm({ clientId, role, target, onSaved }: NutritionTargetFormProps) {
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<NutritionTargetField, string>>({
    calories: target.calories?.toString() ?? "",
    proteinG: target.proteinG?.toString() ?? "",
    carbsG: target.carbsG?.toString() ?? "",
    fatG: target.fatG?.toString() ?? "",
    fiberG: target.fiberG?.toString() ?? "",
    waterMl: target.waterMl?.toString() ?? "",
    mealsPerDayTarget: target.mealsPerDayTarget?.toString() ?? "",
  });
  const [editableFields, setEditableFields] = useState<string[]>(target.clientEditableFields);

  const isTrainer = role === "TRAINER";

  function fieldEditableByMe(field: NutritionTargetField) {
    return isTrainer || editableFields.includes(field);
  }

  function toggleEditable(field: NutritionTargetField) {
    setEditableFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    startTransition(async () => {
      const payload: Record<string, number | null | string[]> = {};
      for (const field of NUTRITION_TARGET_FIELDS) {
        if (!fieldEditableByMe(field)) continue;
        const raw = values[field];
        payload[field] = raw.trim() === "" ? null : Number(raw);
      }
      if (isTrainer) {
        payload.clientEditableFields = editableFields;
      }

      const result = await upsertNutritionTargetAction({ clientId, ...payload });

      if (result.success) {
        toast.success("Nutrition goals updated");
        onSaved?.();
      } else {
        toast.error(result.error ?? "Failed to update goals");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {NUTRITION_TARGET_FIELDS.map((field) => {
          const meta = FIELD_META[field];
          const editable = fieldEditableByMe(field);

          return (
            <div key={field} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`target-${field}`} className="text-xs">
                  {meta.label} {meta.unit && `(${meta.unit})`}
                </Label>
                {isTrainer && (
                  <button
                    type="button"
                    onClick={() => toggleEditable(field)}
                    disabled={isPending}
                    aria-label={
                      editableFields.includes(field)
                        ? `Make ${meta.label} coach-only`
                        : `Allow client to edit ${meta.label}`
                    }
                    className={cn(
                      "rounded p-0.5",
                      editableFields.includes(field) ? "text-emerald-500" : "text-muted-foreground/50"
                    )}
                    title={editableFields.includes(field) ? "Client can edit" : "Coach only"}
                  >
                    {editableFields.includes(field) ? (
                      <Unlock className="h-3 w-3" />
                    ) : (
                      <Lock className="h-3 w-3" />
                    )}
                  </button>
                )}
              </div>
              <Input
                id={`target-${field}`}
                type="number"
                min={0}
                value={values[field]}
                onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
                disabled={isPending || !editable}
                placeholder="—"
              />
            </div>
          );
        })}
      </div>

      <Button type="submit" disabled={isPending} size="sm">
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Goals
      </Button>
    </form>
  );
}
