"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";
import { BODY_REGIONS } from "@/lib/utils/constants";

interface Props {
  search: string;
  selected: string[];
}

/**
 * Owns BOTH the search input and the body-region checkboxes for the admin
 * exercises page, writing both into the same URLSearchParams-based URL.
 *
 * This is intentionally a single component (rather than a search form +
 * a separate filter component) so that typing in the search box and
 * toggling a region checkbox can never silently clobber each other's
 * state — both mutations always read the current URL, merge in their
 * own change, and push the combined result. See exercise-filters.tsx
 * for the pattern this mirrors.
 */
export function AdminExerciseFilters({ search, selected }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState(search);

  // Keep local input state in sync when navigation (e.g. back/forward,
  // or a region toggle) changes the committed `search` param externally.
  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  // Memoized on [router, searchParams] (matching exercise-filters.tsx) so that
  // whenever the committed URL changes for ANY reason — including a region
  // checkbox toggle firing while a search debounce is still pending — this
  // function's identity changes too. The debounce effect below lists it as a
  // dependency, so a region toggle reschedules the pending search-commit with
  // a fresh closure over the new searchParams instead of firing a stale one
  // that would silently drop the just-toggled region filter.
  const updateSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      params.delete("page");
      const query = params.toString();
      router.push(query ? `/admin/exercises?${query}` : "/admin/exercises");
    },
    [router, searchParams]
  );

  // Debounce search-as-you-type so we don't push a new URL on every keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchValue !== search) {
        updateSearch(searchValue);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchValue, search, updateSearch]);

  function toggleRegion(value: string, checked: boolean) {
    const next = checked ? [...selected, value] : selected.filter((v) => v !== value);
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) {
      params.set("bodyRegion", next.join(","));
    } else {
      params.delete("bodyRegion");
    }
    params.delete("page");
    const query = params.toString();
    router.push(query ? `/admin/exercises?${query}` : "/admin/exercises");
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Search exercises…"
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-input bg-background px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground shrink-0">Body region</span>
        {BODY_REGIONS.map((r) => {
          const id = `admin-region-${r.value}`;
          return (
            <div key={r.value} className="flex items-center gap-1.5">
              <Checkbox
                id={id}
                checked={selected.includes(r.value)}
                onCheckedChange={(next) => toggleRegion(r.value, next === true)}
              />
              <Label htmlFor={id} className="text-xs font-normal">{r.label}</Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
