"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Camera, X, Sparkles, Trash2 } from "lucide-react";
import {
  createNutritionLogAction,
  analyzeMealPhotoAction,
  estimateMealMacrosAction,
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

const MEAL_TYPES = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "DINNER", label: "Dinner" },
  { value: "SNACK", label: "Snack" },
] as const;

type MealType = (typeof MEAL_TYPES)[number]["value"];

interface DraftFood {
  description: string;
  quantity: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

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

      <DialogContent className="sm:max-w-md">
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

  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [calories, setCalories] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const isUploadingPhoto = uploadState === "uploading" || uploadState === "confirming";
  const busy = isPending || isUploadingPhoto || isEstimating;

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleEstimate() {
    if (!description.trim()) {
      toast.error("Enter what you ate first");
      return;
    }

    setIsEstimating(true);
    try {
      const result = await estimateMealMacrosAction({
        description: description.trim(),
        quantity: quantity.trim() || undefined,
      });

      if (result.success) {
        setCalories(String(result.data.calories));
        setProteinG(String(result.data.proteinG));
        setCarbsG(String(result.data.carbsG));
        setFatG(String(result.data.fatG));
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

    if (!description.trim()) {
      toast.error("Please enter what you ate");
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

      const result = await createNutritionLogAction({
        clientId,
        date,
        mealType,
        description: description.trim(),
        quantity: quantity.trim() || undefined,
        calories: calories ? parseInt(calories, 10) : undefined,
        proteinG: proteinG ? parseFloat(proteinG) : undefined,
        carbsG: carbsG ? parseFloat(carbsG) : undefined,
        fatG: fatG ? parseFloat(fatG) : undefined,
        photoUrl,
      });

      if (result.success) {
        toast.success("Meal logged");
        onSaved();
      } else {
        toast.error(result.error ?? "Failed to log meal");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="meal-description">Food</Label>
          <Input
            id="meal-description"
            placeholder="e.g. Grilled chicken breast"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            autoFocus
            disabled={busy}
            maxLength={200}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="meal-quantity">Serving size (optional)</Label>
          <Input
            id="meal-quantity"
            placeholder="e.g. 6 oz, 1 cup"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={busy}
            maxLength={100}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Macros</Label>
          <button
            type="button"
            onClick={handleEstimate}
            disabled={busy || !description.trim()}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {isEstimating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Estimate with AI
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="meal-calories">Calories</Label>
            <Input
              id="meal-calories"
              type="number"
              min={0}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meal-protein">Protein (g)</Label>
            <Input
              id="meal-protein"
              type="number"
              min={0}
              step="any"
              value={proteinG}
              onChange={(e) => setProteinG(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meal-carbs">Carbs (g)</Label>
            <Input
              id="meal-carbs"
              type="number"
              min={0}
              step="any"
              value={carbsG}
              onChange={(e) => setCarbsG(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meal-fat">Fat (g)</Label>
            <Input
              id="meal-fat"
              type="number"
              min={0}
              step="any"
              value={fatG}
              onChange={(e) => setFatG(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

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
        <Button type="submit" disabled={busy || !description.trim()}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Meal
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
  const [drafts, setDrafts] = useState<DraftFood[] | null>(null);

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

  function updateDraft(index: number, field: keyof DraftFood, value: string) {
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
          <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
            {drafts.map((draft, i) => (
              <div key={i} className="space-y-2 rounded-lg p-3 ring-1 ring-border/50">
                <div className="flex items-center gap-2">
                  <Input
                    value={draft.description}
                    onChange={(e) => updateDraft(i, "description", e.target.value)}
                    disabled={busy}
                    className="h-8 flex-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeDraft(i)}
                    disabled={busy}
                    aria-label="Remove item"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input
                  value={draft.quantity}
                  onChange={(e) => updateDraft(i, "quantity", e.target.value)}
                  disabled={busy}
                  placeholder="Serving size"
                  className="h-7 text-xs"
                />
                <div className="grid grid-cols-4 gap-1.5">
                  <Input
                    type="number"
                    value={draft.calories}
                    onChange={(e) => updateDraft(i, "calories", e.target.value)}
                    disabled={busy}
                    placeholder="kcal"
                    className="h-7 text-xs"
                  />
                  <Input
                    type="number"
                    value={draft.proteinG}
                    onChange={(e) => updateDraft(i, "proteinG", e.target.value)}
                    disabled={busy}
                    placeholder="protein"
                    className="h-7 text-xs"
                  />
                  <Input
                    type="number"
                    value={draft.carbsG}
                    onChange={(e) => updateDraft(i, "carbsG", e.target.value)}
                    disabled={busy}
                    placeholder="carbs"
                    className="h-7 text-xs"
                  />
                  <Input
                    type="number"
                    value={draft.fatG}
                    onChange={(e) => updateDraft(i, "fatG", e.target.value)}
                    disabled={busy}
                    placeholder="fat"
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            ))}
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
