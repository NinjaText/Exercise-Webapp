"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelectFacet } from "@/components/shared/multi-select-facet";
import { BODY_REGIONS, DIFFICULTY_LEVELS } from "@/lib/utils/constants";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

const EXERCISE_PHASES = [
  { value: "WARMUP", label: "Warm-up" },
  { value: "ACTIVATION", label: "Activation" },
  { value: "STRENGTHENING", label: "Strengthening" },
  { value: "MOBILITY", label: "Mobility" },
  { value: "COOLDOWN", label: "Cool-down" },
] as const;

const FILTER_KEYS = ["exercisePhase", "bodyRegion", "equipment", "difficultyLevel", "hasVideo", "favorite"] as const;

function toList(value: string): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

function BooleanFacet({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {label}
      </p>
      <label
        className={cn(
          "flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm transition-colors",
          checked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"
        )}
      >
        <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
        {checked ? "Enabled" : "Any"}
      </label>
    </div>
  );
}

export function ExerciseFilters({ equipmentOptions }: { equipmentOptions: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("search") || "");
  const [panelOpen, setPanelOpen] = useState(false);

  const current = {
    search: searchParams.get("search") || "",
    exercisePhase: searchParams.get("exercisePhase") || "",
    bodyRegion: searchParams.get("bodyRegion") || "",
    equipment: searchParams.get("equipment") || "",
    difficultyLevel: searchParams.get("difficultyLevel") || "",
    hasVideo: searchParams.get("hasVideo") || "",
    favorite: searchParams.get("favorite") || "",
  };

  const activeCount = FILTER_KEYS.filter((k) => current[k]).length;

  const pushParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete("page"); // any filter change resets to page 1
      const query = params.toString();
      router.push(query ? `/exercises?${query}` : "/exercises");
    },
    [router, searchParams]
  );

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") pushParams({ search: searchValue });
  }

  function clearAll() {
    pushParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])));
  }

  const equipmentFacetOptions = equipmentOptions.map((eq) => ({ value: eq, label: eq }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onBlur={() => searchValue !== current.search && pushParams({ search: searchValue })}
            className="pl-9"
          />
        </div>

        <Button variant="outline" size="sm" onClick={() => setPanelOpen((v) => !v)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-2 px-1.5">
              {activeCount}
            </Badge>
          )}
        </Button>
      </div>

      {panelOpen && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-semibold">Filters</p>
            <div className="flex items-center gap-3">
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close filters"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MultiSelectFacet
              label="Category"
              icon={<SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />}
              allLabel="All Categories"
              values={toList(current.exercisePhase)}
              options={EXERCISE_PHASES}
              onChange={(vals) => pushParams({ exercisePhase: vals.join(",") })}
              searchPlaceholder="Search categories..."
            />
            <MultiSelectFacet
              label="Body Area"
              icon={<SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />}
              allLabel="All Body Areas"
              values={toList(current.bodyRegion)}
              options={BODY_REGIONS}
              onChange={(vals) => pushParams({ bodyRegion: vals.join(",") })}
              searchPlaceholder="Search body areas..."
            />
            <MultiSelectFacet
              label="Equipment"
              icon={<SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />}
              allLabel="All Equipment"
              values={toList(current.equipment)}
              options={equipmentFacetOptions}
              onChange={(vals) => pushParams({ equipment: vals.join(",") })}
              searchPlaceholder="Search equipment..."
            />
            <MultiSelectFacet
              label="Difficulty"
              icon={<SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />}
              allLabel="All Levels"
              values={toList(current.difficultyLevel)}
              options={DIFFICULTY_LEVELS}
              onChange={(vals) => pushParams({ difficultyLevel: vals.join(",") })}
              searchPlaceholder="Search levels..."
            />
            <BooleanFacet
              label="Has Video"
              icon={<SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />}
              checked={current.hasVideo === "true"}
              onChange={(checked) => pushParams({ hasVideo: checked ? "true" : "" })}
            />
            <BooleanFacet
              label="Favorites Only"
              icon={<SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />}
              checked={current.favorite === "true"}
              onChange={(checked) => pushParams({ favorite: checked ? "true" : "" })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
