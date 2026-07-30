"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BODY_REGIONS, DIFFICULTY_LEVELS, MUSCLE_GROUPS } from "@/lib/utils/constants";
import { Search, SlidersHorizontal, X } from "lucide-react";

const EXERCISE_PHASES = [
  { value: "WARMUP", label: "Warm-up" },
  { value: "ACTIVATION", label: "Activation" },
  { value: "STRENGTHENING", label: "Strengthening" },
  { value: "MOBILITY", label: "Mobility" },
  { value: "COOLDOWN", label: "Cool-down" },
] as const;

type FilterGroup = {
  key: "bodyRegion" | "exercisePhase" | "muscleGroup";
  title: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
};

function toggleValue(current: string[], value: string, checked: boolean): string[] {
  return checked ? [...current, value] : current.filter((v) => v !== value);
}

export function ExerciseFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get("search") || "";
  const currentDifficulty = searchParams.get("difficultyLevel") || "";
  const currentRegions = (searchParams.get("bodyRegion") || "").split(",").filter(Boolean);
  const currentPhases = (searchParams.get("exercisePhase") || "").split(",").filter(Boolean);
  const currentMuscles = (searchParams.get("muscleGroup") || "").split(",").filter(Boolean);

  const [searchValue, setSearchValue] = useState(currentSearch);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      const nextQuery = params.toString();
      router.push(nextQuery ? `/exercises?${nextQuery}` : "/exercises");
    },
    [router, searchParams]
  );

  const clearAllGroups = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("bodyRegion");
    params.delete("exercisePhase");
    params.delete("muscleGroup");
    const nextQuery = params.toString();
    router.push(nextQuery ? `/exercises?${nextQuery}` : "/exercises");
  }, [router, searchParams]);

  useEffect(() => {
    setSearchValue(currentSearch);
  }, [currentSearch]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchValue !== currentSearch) {
        updateParam("search", searchValue);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchValue, currentSearch, updateParam]);

  const groups: FilterGroup[] = [
    { key: "bodyRegion", title: "Body Region", options: BODY_REGIONS, selected: currentRegions },
    { key: "exercisePhase", title: "Category", options: EXERCISE_PHASES, selected: currentPhases },
    { key: "muscleGroup", title: "Muscle Group", options: MUSCLE_GROUPS, selected: currentMuscles },
  ];

  const activeCount = currentRegions.length + currentPhases.length + currentMuscles.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9"
          />
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Difficulty</p>
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={currentDifficulty}
            onChange={(e) => updateParam("difficultyLevel", e.target.value)}
          >
            <option value="">All Levels</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-2 px-1.5">
              {activeCount}
            </Badge>
          )}
        </Button>
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {groups.flatMap((group) =>
            group.selected.map((value) => {
              const label = group.options.find((o) => o.value === value)?.label ?? value;
              return (
                <button
                  key={`${group.key}-${value}`}
                  type="button"
                  onClick={() =>
                    updateParam(group.key, group.selected.filter((v) => v !== value).join(","))
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {label}
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              );
            })
          )}
          <button
            type="button"
            onClick={clearAllGroups}
            className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b p-6">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-6 p-6">
              {groups.map((group) => (
                <div key={group.key} className="space-y-3">
                  <p className="text-sm font-semibold">{group.title}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    {group.options.map((option) => {
                      const id = `${group.key}-${option.value}`;
                      const checked = group.selected.includes(option.value);
                      return (
                        <div key={option.value} className="flex items-center gap-2">
                          <Checkbox
                            id={id}
                            checked={checked}
                            onCheckedChange={(next) =>
                              updateParam(
                                group.key,
                                toggleValue(group.selected, option.value, next === true).join(",")
                              )
                            }
                          />
                          <Label htmlFor={id} className="font-normal">
                            {option.label}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {activeCount > 0 && (
            <SheetFooter className="border-t p-6">
              <Button variant="ghost" size="sm" onClick={clearAllGroups}>
                <X className="mr-1 h-4 w-4" />
                Clear all filters
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
