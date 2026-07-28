"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Droplet, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { addWaterLogAction } from "@/actions/nutrition-actions";

const ML_PER_OZ = 29.5735;
const WATER_COLOR = "#0ea5e9";

interface WaterTrackerProps {
  clientId: string;
  date: Date;
  consumedMl: number;
  targetMl: number | null;
  readOnly?: boolean;
}

export function WaterTracker({ clientId, date, consumedMl, targetMl, readOnly = false }: WaterTrackerProps) {
  const [isPending, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(false);
  const [customOz, setCustomOz] = useState("");

  const pct = targetMl ? Math.round((consumedMl / targetMl) * 100) : null;
  const exceeded = pct !== null && pct > 100;

  function addOz(oz: number) {
    startTransition(async () => {
      const result = await addWaterLogAction({
        clientId,
        date,
        amountMl: Math.round(oz * ML_PER_OZ),
      });

      if (result.success) {
        toast.success(`Added ${oz} oz of water`);
        setShowCustom(false);
        setCustomOz("");
      } else {
        toast.error(result.error ?? "Failed to log water");
      }
    });
  }

  function handleCustomAdd() {
    const oz = parseFloat(customOz);
    if (!oz || oz <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    addOz(oz);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${WATER_COLOR}1a` }}
        >
          <Droplet className="h-4 w-4" style={{ color: WATER_COLOR }} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-foreground/80">Water</span>
            <span className="text-muted-foreground tabular-nums">
              {Math.round(consumedMl / ML_PER_OZ)}
              {targetMl ? `/${Math.round(targetMl / ML_PER_OZ)}` : ""} oz
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-300", exceeded && "!bg-sky-700")}
              style={{
                width: pct === null ? "0%" : `${Math.min(pct, 100)}%`,
                backgroundColor: exceeded ? undefined : WATER_COLOR,
              }}
            />
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1.5 sm:pl-2">
          <button
            type="button"
            onClick={() => addOz(8)}
            disabled={isPending}
            className="rounded-md bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-500/20 disabled:opacity-50"
          >
            +8oz
          </button>
          <button
            type="button"
            onClick={() => addOz(16)}
            disabled={isPending}
            className="rounded-md bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-500/20 disabled:opacity-50"
          >
            +16oz
          </button>
          {showCustom ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="oz"
                autoFocus
                value={customOz}
                onChange={(e) => setCustomOz(e.target.value)}
                disabled={isPending}
                className="h-6 w-14 px-1.5 text-[11px]"
              />
              <button
                type="button"
                onClick={handleCustomAdd}
                disabled={isPending || !customOz}
                className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold hover:bg-muted/70 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              aria-label="Add custom water amount"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
