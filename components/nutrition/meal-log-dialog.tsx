"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Camera, X, Sparkles, RefreshCw } from "lucide-react";
import {
  analyzeMealPhotoAction,
  reestimateMealPhotoItemAction,
  estimateMealMacrosBatchAction,
  createNutritionLogsBulkAction,
} from "@/actions/nutrition-actions";
import { useMealPhotoUpload } from "@/hooks/use-meal-photo-upload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  FoodItemRowList,
  emptyFoodItemDraft,
  foodEstimateKey,
  type FoodItemDraft,
  type EditableFoodField,
} from "./food-item-row-list";

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
      <DialogTrigger render={<Button />}>
        <Plus className="h-4 w-4" />
        Log meal
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

  function updateItem(index: number, field: EditableFoodField, value: string) {
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
  const [note, setNote] = useState("");
  const [reestimatingIndex, setReestimatingIndex] = useState<number | null>(null);

  const busy = isAnalyzing || isSaving || reestimatingIndex !== null;

  async function runAnalysis(url: string, analysisNote?: string) {
    setIsAnalyzing(true);
    try {
      const result = await analyzeMealPhotoAction({ photoUrl: url, note: analysisNote });
      if (!result.success) {
        toast.error(result.error ?? "Failed to analyze photo");
        return;
      }

      setDrafts(
        result.data.foods.map((f) => {
          const draft: FoodItemDraft = {
            description: f.name,
            quantity: f.quantity,
            calories: String(f.calories),
            proteinG: String(f.proteinG),
            carbsG: String(f.carbsG),
            fatG: String(f.fatG),
            components: f.components,
          };
          return { ...draft, estimatedFor: foodEstimateKey(draft) };
        })
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setDrafts(null);
    setNote("");
    try {
      const uploadedUrl = await upload(file);
      if (!uploadedUrl) {
        toast.error("Photo upload failed");
        return;
      }
      setPhotoUrl(uploadedUrl);
      await runAnalysis(uploadedUrl);
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleReanalyze() {
    if (!photoUrl) return;
    void runAnalysis(photoUrl, note.trim() || undefined);
  }

  async function handleReestimate(index: number) {
    const item = drafts?.[index];
    if (!photoUrl || !item || item.description.trim().length === 0) return;

    setReestimatingIndex(index);
    try {
      const result = await reestimateMealPhotoItemAction({
        photoUrl,
        name: item.description.trim(),
        quantity: item.quantity.trim() || undefined,
        components: item.components,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to re-estimate item");
        return;
      }

      const { estimate } = result.data;
      setDrafts((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        // Key off the values that were sent, so edits made while the request ran still show as unestimated.
        next[index] = {
          ...next[index],
          calories: String(estimate.calories),
          proteinG: String(estimate.proteinG),
          carbsG: String(estimate.carbsG),
          fatG: String(estimate.fatG),
          estimatedFor: foodEstimateKey(item),
        };
        return next;
      });
    } finally {
      setReestimatingIndex(null);
    }
  }

  function updateDraft(index: number, field: EditableFoodField, value: string) {
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
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <Sparkles className="h-3 w-3" />
              AI estimate
            </span>
            <span className="text-[11px] text-muted-foreground">Based on the photo only, so check it</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Each item&apos;s numbers are added to your day, so dishes like sandwiches are logged once with
            their ingredients included. Ate less than what&apos;s shown? Change the serving (e.g. &quot;1
            slice&quot;) and tap Re-estimate, or edit the numbers directly.
          </p>
          <FoodItemRowList
            items={drafts}
            onChange={(i, field, value) => updateDraft(i, field, value)}
            onRemove={removeDraft}
            disabled={busy}
            onReestimate={handleReestimate}
            reestimatingIndex={reestimatingIndex}
          />
          <div className="space-y-1.5 rounded-lg p-3 ring-1 ring-border/50">
            <Label htmlFor="meal-photo-note" className="text-xs text-muted-foreground">
              Something wrong with the whole result? Add a note and re-analyze
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="meal-photo-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                maxLength={300}
                placeholder="e.g. I only ate 2 slices, it's a thin crust"
                className="h-8 flex-1 text-xs"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleReanalyze} disabled={busy}>
                {isAnalyzing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                Re-analyze
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Re-analyzing replaces the items above.</p>
          </div>
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
