"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Camera, X, Sparkles } from "lucide-react";
import {
  analyzeMealPhotoAction,
  estimateMealMacrosBatchAction,
  createNutritionLogsBulkAction,
} from "@/actions/nutrition-actions";
import { useMealPhotoUpload } from "@/hooks/use-meal-photo-upload";
import { cn } from "@/lib/utils";
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

const MEAL_TYPES = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "DINNER", label: "Dinner" },
  { value: "SNACK", label: "Snack" },
] as const;

type MealType = (typeof MEAL_TYPES)[number]["value"];

interface MealLogDialogProps {
  clientId: string;
  date: Date;
  defaultMealType?: MealType;
}

function MealTypePicker({
  mealType,
  onChange,
  disabled,
}: {
  mealType: MealType;
  onChange: (v: MealType) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>Meal</Label>
      <div className="flex gap-2">
        {MEAL_TYPES.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-medium transition-all",
              mealType === opt.value
                ? "bg-primary text-primary-foreground"
                : "ring-1 ring-border/50 hover:ring-border text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MealLogDialog({ clientId, date, defaultMealType }: MealLogDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [mealType, setMealType] = useState<MealType>(defaultMealType ?? "BREAKFAST");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setMode("manual");
      setMealType(defaultMealType ?? "BREAKFAST");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Plus className="h-4 w-4" />
        Log Meal
      </DialogTrigger>

      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a Meal</DialogTitle>
          <DialogDescription>Add food to your daily timeline, manually or from a photo.</DialogDescription>
        </DialogHeader>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-semibold transition-all",
              mode === "manual" ? "bg-primary text-primary-foreground" : "ring-1 ring-border/50 text-muted-foreground"
            )}
          >
            Manual Entry
          </button>
          <button
            type="button"
            onClick={() => setMode("ai")}
            className={cn(
              "flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all inline-flex",
              mode === "ai" ? "bg-primary text-primary-foreground" : "ring-1 ring-border/50 text-muted-foreground"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Photo
          </button>
        </div>

        <MealTypePicker mealType={mealType} onChange={setMealType} disabled={false} />

        {mode === "manual" ? (
          <ManualMealForm
            clientId={clientId}
            date={date}
            mealType={mealType}
            onSaved={() => handleOpenChange(false)}
            onCancel={() => handleOpenChange(false)}
          />
        ) : (
          <AiPhotoMealForm
            clientId={clientId}
            date={date}
            mealType={mealType}
            onSaved={() => handleOpenChange(false)}
            onCancel={() => handleOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Manual Entry ────────────────────────────────────────────────────────────

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

// ─── AI Photo Entry ──────────────────────────────────────────────────────────

function AiPhotoMealForm({
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload } = useMealPhotoUpload();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<FoodItemDraft[] | null>(null);

  const busy = isAnalyzing || isSaving;

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setDrafts(null);
    try {
      const uploadedUrl = await upload(file);
      if (!uploadedUrl) {
        toast.error("Photo upload failed");
        return;
      }
      setPhotoUrl(uploadedUrl);

      const result = await analyzeMealPhotoAction({ photoUrl: uploadedUrl });
      if (!result.success) {
        toast.error(result.error ?? "Failed to analyze photo");
        return;
      }

      setDrafts(
        result.data.foods.map((f) => ({
          description: f.name,
          quantity: f.quantity,
          calories: String(f.calories),
          proteinG: String(f.proteinG),
          carbsG: String(f.carbsG),
          fatG: String(f.fatG),
        }))
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function updateDraft(index: number, field: keyof FoodItemDraft, value: string) {
    setDrafts((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function removeDraft(index: number) {
    setDrafts((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  function handleSave() {
    if (!drafts || drafts.length === 0) return;

    startSaving(async () => {
      const result = await createNutritionLogsBulkAction({
        clientId,
        date,
        mealType,
        logs: drafts.map((d) => ({
          description: d.description.trim() || "Food item",
          quantity: d.quantity.trim() || undefined,
          calories: d.calories ? parseInt(d.calories, 10) : undefined,
          proteinG: d.proteinG ? parseFloat(d.proteinG) : undefined,
          carbsG: d.carbsG ? parseFloat(d.carbsG) : undefined,
          fatG: d.fatG ? parseFloat(d.fatG) : undefined,
          photoUrl,
        })),
      });

      if (result.success) {
        toast.success(`Logged ${drafts.length} item${drafts.length !== 1 ? "s" : ""}`);
        onSaved();
      } else {
        toast.error(result.error ?? "Failed to save meals");
      }
    });
  }

  return (
    <div className="mt-4 space-y-4">
      {!drafts && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg ring-1 ring-dashed ring-border/70 text-muted-foreground hover:ring-border disabled:opacity-60"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Analyzing photo…</span>
            </>
          ) : (
            <>
              <Camera className="h-6 w-6" />
              <span className="text-xs">Take or upload a meal photo</span>
            </>
          )}
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

      {drafts && (
        <div className="space-y-3">
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="Meal" className="h-20 w-20 rounded-lg object-cover" />
          )}
          <p className="text-xs text-muted-foreground">
            Review and edit the detected items before saving.
          </p>
          <FoodItemRowList
            items={drafts}
            onChange={(i, field, value) => updateDraft(i, field, value)}
            onRemove={removeDraft}
            disabled={busy}
          />
        </div>
      )}

      <DialogFooter className="mt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={busy || !drafts || drafts.length === 0}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save {drafts?.length ?? 0} Item{drafts?.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </div>
  );
}
