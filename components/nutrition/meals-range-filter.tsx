"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NutritionRangePreset } from "@/lib/services/nutrition.service";
import { toDateParam, utcToday } from "./nutrition-date-utils";

interface MealsRangeFilterProps {
  preset: NutritionRangePreset;
  start: Date;
  end: Date;
}

const PRESET_LABELS: Record<NutritionRangePreset, string> = {
  TODAY: "Today",
  THIS_WEEK: "This week",
  LAST_WEEK: "Last week",
  THIS_MONTH: "This month",
  LAST_MONTH: "Last month",
  CUSTOM: "Custom range",
};

export function MealsRangeFilter({ preset, start, end }: MealsRangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(next: { range: string; start?: string; end?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", next.range);
    if (next.start) params.set("start", next.start);
    else params.delete("start");
    if (next.end) params.set("end", next.end);
    else params.delete("end");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handlePresetChange(value: NutritionRangePreset | null) {
    if (!value) return;
    if (value === "CUSTOM") {
      navigate({ range: "custom", start: toDateParam(start), end: toDateParam(end) });
    } else {
      navigate({ range: value.toLowerCase() });
    }
  }

  const todayParam = toDateParam(utcToday());

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-[150px]">
          <SelectValue>{(value: NutritionRangePreset) => PRESET_LABELS[value]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TODAY">Today</SelectItem>
          <SelectItem value="THIS_WEEK">This week</SelectItem>
          <SelectItem value="LAST_WEEK">Last week</SelectItem>
          <SelectItem value="THIS_MONTH">This month</SelectItem>
          <SelectItem value="LAST_MONTH">Last month</SelectItem>
          <SelectItem value="CUSTOM">Custom range</SelectItem>
        </SelectContent>
      </Select>

      {preset === "CUSTOM" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={toDateParam(start)}
            max={todayParam}
            onChange={(e) => {
              if (e.target.value) navigate({ range: "custom", start: e.target.value, end: toDateParam(end) });
            }}
            className="rounded-md bg-transparent px-1.5 py-1 text-xs ring-1 ring-border/50"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={toDateParam(end)}
            max={todayParam}
            onChange={(e) => {
              if (e.target.value) navigate({ range: "custom", start: toDateParam(start), end: e.target.value });
            }}
            className="rounded-md bg-transparent px-1.5 py-1 text-xs ring-1 ring-border/50"
          />
        </div>
      )}
    </div>
  );
}
