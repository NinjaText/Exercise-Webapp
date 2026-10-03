"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera, Keyboard, Loader2, PackageSearch, ScanBarcode, Sparkles, Trash2 } from "lucide-react";
import { createNutritionLogsBulkAction, lookupFoodBarcodeAction } from "@/actions/nutrition-actions";
import {
  formatNumber,
  macrosForPortion,
  normalizeBarcode,
  portionAmount,
  portionQuantityLabel,
  scannedFoodDescription,
  type PortionMode,
  type ScannedFood,
} from "@/lib/nutrition/food-barcode";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { BarcodeCamera, type CameraFailure } from "./barcode-camera";

type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

interface ScannedItem {
  key: string;
  food: ScannedFood;
  mode: PortionMode;
  quantity: string;
}

type Phase = "camera" | "typing" | "looking" | "review";

/** Upper bounds keep a typo from producing values the log validator rejects. */
const MAX_QUANTITY: Record<PortionMode, number> = { serving: 50, package: 50, amount: 5000 };
const MAX_ITEMS = 20;

function defaultMode(food: ScannedFood): PortionMode {
  if (food.serving) return "serving";
  if (food.packageAmount) return "package";
  return "amount";
}

function defaultQuantity(food: ScannedFood, mode: PortionMode): string {
  return mode === "amount" ? formatNumber(food.serving?.amount ?? food.packageAmount ?? 100) : "1";
}

function parseQuantity(item: ScannedItem): number | null {
  const value = Number(item.quantity.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0 || value > MAX_QUANTITY[item.mode]) return null;
  return value;
}

export function BarcodeScanForm({
  clientId,
  date,
  mealType,
  onSaved,
  onCancel,
  onEnterManually,
  onUsePhoto,
}: {
  clientId: string;
  date: Date;
  mealType: MealType;
  onSaved: () => void;
  onCancel: () => void;
  /** Switch the dialog to manual entry, pre-filling the product name when the lookup knew it. */
  onEnterManually: (name: string | null) => void;
  onUsePhoto: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("camera");
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [typedCode, setTypedCode] = useState("");
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<{ barcode: string; name: string | null } | null>(null);
  const [cameraNote, setCameraNote] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const allValid = items.every((item) => parseQuantity(item) !== null);

  async function lookup(barcode: string) {
    if (items.some((item) => item.food.barcode === barcode)) {
      toast.info("Already added — change its amount below");
      setPhase("review");
      return;
    }

    setNotFound(null);
    setLookingUp(barcode);
    setPhase("looking");
    try {
      const result = await lookupFoodBarcodeAction({ barcode });
      if (!result.success) {
        toast.error(result.error);
        setPhase(items.length > 0 ? "review" : "typing");
        setTypedCode(barcode);
        return;
      }
      if (result.data.status === "not_found") {
        setNotFound({ barcode, name: result.data.name });
        setPhase("review");
        return;
      }
      const { food } = result.data;
      const mode = defaultMode(food);
      setItems((prev) => [
        ...prev,
        { key: `${food.barcode}-${Date.now()}`, food, mode, quantity: defaultQuantity(food, mode) },
      ]);
      setTypedCode("");
      setPhase("review");
    } finally {
      setLookingUp(null);
    }
  }

  function handleDetected(code: { rawValue: string; format: string }): boolean {
    const barcode = normalizeBarcode(code.rawValue, code.format);
    if (!barcode) return false;
    void lookup(barcode);
    return true;
  }

  function handleCameraFailure(reason: CameraFailure) {
    setCameraNote(
      reason === "denied"
        ? "Camera access is blocked. Allow it in your settings, or type the number under the barcode."
        : "The camera isn't available. Type the number printed under the barcode instead."
    );
    setPhase("typing");
  }

  function handleTypedSubmit(e: React.FormEvent) {
    e.preventDefault();
    const barcode = normalizeBarcode(typedCode);
    if (!barcode) {
      toast.error("Check the number — it should be the 8–14 digits under the barcode");
      return;
    }
    void lookup(barcode);
  }

  function scanAnother() {
    if (items.length >= MAX_ITEMS) {
      toast.error(`You can add up to ${MAX_ITEMS} items per meal`);
      return;
    }
    setNotFound(null);
    setPhase(cameraNote ? "typing" : "camera");
  }

  function updateItem(key: string, patch: Partial<ScannedItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function changeMode(item: ScannedItem, mode: PortionMode) {
    if (mode === item.mode) return;
    // Carry the current amount over when switching to grams so the numbers don't jump.
    const current = parseQuantity(item);
    const amount = current !== null ? portionAmount(item.food, item.mode, current) : null;
    const quantity = mode === "amount" && amount !== null ? formatNumber(amount) : defaultQuantity(item.food, mode);
    updateItem(item.key, { mode, quantity });
  }

  function handleSave() {
    if (items.length === 0 || !allValid) return;
    startSaving(async () => {
      const logs = items.map((item) => {
        const quantity = parseQuantity(item) ?? 0;
        const amount = portionAmount(item.food, item.mode, quantity) ?? 0;
        const macros = macrosForPortion(item.food.per100, amount);
        return {
          description: scannedFoodDescription(item.food).slice(0, 200),
          quantity: portionQuantityLabel(item.food, item.mode, quantity).slice(0, 100),
          calories: macros.calories,
          proteinG: macros.proteinG,
          carbsG: macros.carbsG,
          fatG: macros.fatG,
        };
      });
      const result = await createNutritionLogsBulkAction({ clientId, date, mealType, logs });
      if (result.success) {
        toast.success(`Logged ${logs.length} item${logs.length !== 1 ? "s" : ""}`);
        onSaved();
      } else {
        toast.error(result.error ?? "Failed to log meal");
      }
    });
  }

  const busy = isSaving || lookingUp !== null;

  return (
    <div className="mt-4 space-y-4">
      {phase === "camera" && (
        <div className="space-y-2">
          <BarcodeCamera onDetected={handleDetected} onFailure={handleCameraFailure} />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPhase("typing")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <Keyboard className="h-3.5 w-3.5" />
              Type the number instead
            </button>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => setPhase("review")}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Done scanning
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "typing" && (
        <form onSubmit={handleTypedSubmit} className="space-y-2 rounded-lg p-3 ring-1 ring-border/50">
          {cameraNote && <p className="text-xs text-muted-foreground">{cameraNote}</p>}
          <Label htmlFor="barcode-number" className="text-xs text-muted-foreground">
            Barcode number
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="barcode-number"
              value={typedCode}
              onChange={(e) => setTypedCode(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 5000159407236"
              maxLength={20}
              className="h-9 flex-1"
              autoFocus
            />
            <Button type="submit" size="sm" disabled={typedCode.trim().length === 0}>
              Look up
            </Button>
          </div>
          <div className="flex items-center justify-between">
            {!cameraNote && (
              <button
                type="button"
                onClick={() => setPhase("camera")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Camera className="h-3.5 w-3.5" />
                Use the camera
              </button>
            )}
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => setPhase("review")}
                className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Back to items
              </button>
            )}
          </div>
        </form>
      )}

      {phase === "looking" && (
        <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-lg ring-1 ring-border/50 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-xs">Looking up {lookingUp}…</span>
        </div>
      )}

      {phase === "review" && notFound && (
        <div className="space-y-3 rounded-lg p-3 ring-1 ring-border/50">
          <div className="flex items-start gap-2">
            <PackageSearch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">
                {notFound.name ? `No nutrition info for ${notFound.name}` : "We couldn't find this product"}
              </p>
              <p className="text-xs text-muted-foreground">
                Barcode {notFound.barcode}. Some local and store brands aren&apos;t in the database yet.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onEnterManually(notFound.name)}>
              Enter manually
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onUsePhoto}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Use AI photo
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={scanAnother}>
              Scan again
            </Button>
          </div>
        </div>
      )}

      {items.length > 0 && phase !== "looking" && (
        <div className="space-y-3">
          {items.map((item) => (
            <ScannedItemCard
              key={item.key}
              item={item}
              disabled={busy}
              onModeChange={(mode) => changeMode(item, mode)}
              onQuantityChange={(quantity) => updateItem(item.key, { quantity })}
              onRemove={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
            />
          ))}
        </div>
      )}

      {phase === "review" && (
        <button
          type="button"
          onClick={scanAnother}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
        >
          <ScanBarcode className="h-3.5 w-3.5" />
          {items.length > 0 ? "Scan another item" : "Scan a product"}
        </button>
      )}

      <DialogFooter className="mt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={busy || items.length === 0 || !allValid}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save {items.length} Item{items.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ScannedItemCard({
  item,
  disabled,
  onModeChange,
  onQuantityChange,
  onRemove,
}: {
  item: ScannedItem;
  disabled: boolean;
  onModeChange: (mode: PortionMode) => void;
  onQuantityChange: (quantity: string) => void;
  onRemove: () => void;
}) {
  const { food } = item;
  const quantity = parseQuantity(item);
  const amount = quantity !== null ? portionAmount(food, item.mode, quantity) : null;
  const macros = amount !== null ? macrosForPortion(food.per100, amount) : null;

  const modes: { value: PortionMode; label: string }[] = [
    ...(food.serving ? [{ value: "serving" as const, label: "Servings" }] : []),
    { value: "amount", label: food.unit === "ml" ? "ml" : "Grams" },
    ...(food.packageAmount ? [{ value: "package" as const, label: "Package" }] : []),
  ];

  const basisHint =
    item.mode === "serving" && food.serving
      ? `1 serving = ${food.serving.label}`
      : item.mode === "package" && food.packageAmount
        ? `1 package = ${formatNumber(food.packageAmount)} ${food.unit}`
        : `Label: ${formatNumber(food.per100.calories)} kcal per 100 ${food.unit}`;

  return (
    <div className="space-y-3 rounded-lg p-3 ring-1 ring-border/50">
      <div className="flex items-start gap-3">
        {food.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={food.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-md bg-muted object-contain" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
            <ScanBarcode className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{food.name}</p>
          {food.brand && <p className="truncate text-xs text-muted-foreground">{food.brand}</p>}
          <p className="text-[11px] text-muted-foreground">
            From the label · {food.source === "usda" ? "USDA" : "Open Food Facts"}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${food.name}`}
          className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          {modes.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => onModeChange(m.value)}
              disabled={disabled}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-all",
                item.mode === m.value
                  ? "bg-primary text-primary-foreground"
                  : "ring-1 ring-border/50 text-muted-foreground hover:text-foreground"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={item.quantity}
            onChange={(e) => onQuantityChange(e.target.value)}
            disabled={disabled}
            inputMode="decimal"
            aria-label="Amount eaten"
            aria-invalid={quantity === null}
            className="h-9 w-24"
          />
          <span className="text-xs text-muted-foreground">
            {item.mode === "amount" ? food.unit : item.mode === "package" ? "package(s)" : "serving(s)"}
            {amount !== null && item.mode !== "amount" && ` · ${formatNumber(amount)} ${food.unit}`}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">{basisHint}</p>
      </div>

      {macros ? (
        <div className="grid grid-cols-4 gap-1 rounded-md bg-muted/60 p-2 text-center">
          <MacroCell label="kcal" value={String(macros.calories)} />
          <MacroCell label="Protein" value={macros.proteinG === null ? "—" : `${formatNumber(macros.proteinG)}g`} />
          <MacroCell label="Carbs" value={macros.carbsG === null ? "—" : `${formatNumber(macros.carbsG)}g`} />
          <MacroCell label="Fat" value={macros.fatG === null ? "—" : `${formatNumber(macros.fatG)}g`} />
        </div>
      ) : (
        <p className="text-xs text-destructive">
          Enter an amount between 0 and {MAX_QUANTITY[item.mode]}.
        </p>
      )}
    </div>
  );
}

function MacroCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
