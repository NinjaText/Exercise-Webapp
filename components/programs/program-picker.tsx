"use client";

import { useMemo } from "react";
import { CalendarDays, ChevronRight, Play, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";

/**
 * The two things a trainer can hand a client, and the distinction this picker
 * exists to make legible: a SCHEDULED program lands dated sessions on their
 * calendar and counts toward adherence, while an ON_DEMAND one ("Resource")
 * has no schedule and is simply available to them whenever they want it.
 */
export type AssignKind = "SCHEDULED" | "ON_DEMAND";

export type PickerSort = "recent" | "name" | "duration";

/**
 * A program as the picker needs it. Everything past id/name is optional so the
 * picker degrades gracefully against callers that only have the narrow
 * id/name/schedulingType shape — a row simply shows fewer lines.
 */
export interface PickerProgram {
  id: string;
  name: string;
  /** null on programs written before the field existed — read via getProgramSchedulingType. */
  schedulingType?: string | null;
  durationWeeks?: number | null;
  daysPerWeek?: number | null;
  bodyAreas?: string[] | null;
  goals?: string[] | null;
  activities?: string[] | null;
  level?: string | null;
  updatedAt?: string | Date | null;
}

/** Chips beyond this many wrap into a third row and push the list out of view. */
const MAX_FACET_CHIPS = 8;

/** Facets shown inline on a row; the rest stay discoverable through the chips. */
const MAX_ROW_FACETS = 3;

export const ASSIGN_KIND_COPY: Record<
  AssignKind,
  { title: string; blurb: string; pill: string; listLabel: string; searchPlaceholder: string }
> = {
  SCHEDULED: {
    title: "Scheduled Program",
    blurb: "A multi-week program with a set schedule on their calendar.",
    pill: "SCHEDULED",
    listLabel: "Select a Scheduled Program",
    searchPlaceholder: "Search scheduled programs...",
  },
  ON_DEMAND: {
    title: "On-Demand Resource",
    blurb: "Available anytime, with no schedule and no effect on adherence.",
    pill: "ON-DEMAND",
    listLabel: "Select an On-Demand Resource",
    searchPlaceholder: "Search on-demand resources...",
  },
};

const SORT_OPTIONS: { value: PickerSort; label: string }[] = [
  { value: "recent", label: "Recently updated" },
  { value: "name", label: "Name A–Z" },
  { value: "duration", label: "Duration" },
];

/**
 * The structured categorization facets, flattened into the one list a row and
 * the chip filter both read. `tags` is deliberately excluded: it is free-form
 * and would drown the structured facets in noise.
 */
export function programFacets(program: PickerProgram): string[] {
  const all = [
    ...(program.goals ?? []),
    ...(program.bodyAreas ?? []),
    ...(program.activities ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of all) {
    const value = raw?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * The chip row, derived from the programs actually in the current tab, ordered
 * by how many of them carry each facet. Deriving rather than hardcoding means a
 * chip can never come up empty and the row follows the trainer's own library.
 */
export function deriveFacetChips(programs: PickerProgram[]): string[] {
  const counts = new Map<string, number>();
  for (const program of programs) {
    for (const facet of programFacets(program)) {
      counts.set(facet, (counts.get(facet) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([aName, aCount], [bName, bCount]) =>
      bCount === aCount ? aName.localeCompare(bName) : bCount - aCount
    )
    .slice(0, MAX_FACET_CHIPS)
    .map(([name]) => name);
}

export function filterPickerPrograms(
  programs: PickerProgram[],
  { kind, search, facet }: { kind: AssignKind; search: string; facet: string | null }
): PickerProgram[] {
  const term = search.trim().toLowerCase();

  return programs.filter((program) => {
    if (getProgramSchedulingType(program) !== kind) return false;

    const facets = programFacets(program);
    if (facet && !facets.includes(facet)) return false;

    if (!term) return true;
    return (
      program.name.toLowerCase().includes(term) ||
      facets.some((f) => f.toLowerCase().includes(term))
    );
  });
}

export function sortPickerPrograms(
  programs: PickerProgram[],
  sort: PickerSort
): PickerProgram[] {
  const rows = [...programs];

  if (sort === "name") {
    return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  if (sort === "duration") {
    // A program with no duration on file sorts last rather than as week zero.
    return rows.sort(
      (a, b) => (a.durationWeeks ?? Infinity) - (b.durationWeeks ?? Infinity)
    );
  }

  return rows.sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));
}

function toTime(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** "4 weeks · 3 days/week", or whichever half is known, or null for neither. */
export function formatProgramCadence(program: PickerProgram): string | null {
  const parts: string[] = [];
  if (program.durationWeeks) {
    parts.push(`${program.durationWeeks} ${program.durationWeeks === 1 ? "week" : "weeks"}`);
  }
  if (program.daysPerWeek) {
    parts.push(`${program.daysPerWeek} ${program.daysPerWeek === 1 ? "day" : "days"}/week`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** The square icon tile that stands in for a cover image. */
export function ProgramTile({ kind, className }: { kind: AssignKind; className?: string }) {
  const Icon = kind === "ON_DEMAND" ? Play : CalendarDays;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-14 w-14 shrink-0 items-center justify-center rounded-md",
        kind === "ON_DEMAND"
          ? "bg-success-soft text-success-foreground"
          : "bg-primary/10 text-primary",
        className
      )}
    >
      <Icon className="h-6 w-6" />
    </span>
  );
}

export function SchedulingPill({ kind }: { kind: AssignKind }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "tracking-wide",
        kind === "ON_DEMAND"
          ? "bg-success-soft text-success-foreground"
          : "bg-primary/10 text-primary"
      )}
    >
      {ASSIGN_KIND_COPY[kind].pill}
    </Badge>
  );
}

/**
 * The "What would you like to assign?" pair. Counts come from the caller's full
 * program list so a trainer can see at a glance that they have, say, no
 * resources yet rather than picking the tab and finding it empty.
 */
export function AssignKindSelector({
  value,
  onChange,
  counts,
}: {
  value: AssignKind;
  onChange: (kind: AssignKind) => void;
  counts?: Record<AssignKind, number>;
}) {
  return (
    <div role="radiogroup" aria-label="What would you like to assign?" className="grid gap-3 sm:grid-cols-2">
      {(["SCHEDULED", "ON_DEMAND"] as const).map((kind) => {
        const copy = ASSIGN_KIND_COPY[kind];
        const selected = value === kind;
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(kind)}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              selected
                ? "border-primary bg-primary/5"
                : "border-border hover:border-border hover:bg-muted/50"
            )}
          >
            <ProgramTile kind={kind} className="h-9 w-9 rounded-full [&>svg]:h-4 [&>svg]:w-4" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {copy.title}
                {counts ? (
                  <span className="ml-1.5 font-normal text-muted-foreground">({counts[kind]})</span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                {copy.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Search + derived chips + sort over a scrolling list of program rows. Purely
 * presentational: it owns no selection state, so a dialog can reset it however
 * its own flow requires.
 */
export function ProgramPicker({
  programs,
  kind,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  facet,
  onFacetChange,
  sort,
  onSortChange,
}: {
  programs: PickerProgram[];
  kind: AssignKind;
  selectedId: string;
  onSelect: (programId: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  facet: string | null;
  onFacetChange: (facet: string | null) => void;
  sort: PickerSort;
  onSortChange: (sort: PickerSort) => void;
}) {
  const copy = ASSIGN_KIND_COPY[kind];

  // Chips describe the whole tab, not the current search — otherwise typing a
  // term dissolves the chips you were about to use to narrow it further.
  const inTab = useMemo(
    () => filterPickerPrograms(programs, { kind, search: "", facet: null }),
    [programs, kind]
  );
  const chips = useMemo(() => deriveFacetChips(inTab), [inTab]);

  const rows = useMemo(
    () => sortPickerPrograms(filterPickerPrograms(programs, { kind, search, facet }), sort),
    [programs, kind, search, facet, sort]
  );

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm font-medium">{copy.listLabel}</p>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={copy.searchPlaceholder}
          aria-label={copy.searchPlaceholder}
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <FacetChip label="All" selected={facet === null} onClick={() => onFacetChange(null)} />
          {chips.map((chip) => (
            <FacetChip
              key={chip}
              label={chip}
              selected={facet === chip}
              onClick={() => onFacetChange(facet === chip ? null : chip)}
            />
          ))}
        </div>
        <Select value={sort} onValueChange={(v) => onSortChange((v as PickerSort) ?? "recent")}>
          <SelectTrigger className="w-40 shrink-0" aria-label="Sort programs">
            <SelectValue>
              {(v: string | null) =>
                SORT_OPTIONS.find((o) => o.value === v)?.label ?? "Recently updated"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          {inTab.length === 0
            ? kind === "ON_DEMAND"
              ? "You don't have any on-demand resources yet."
              : "You don't have any scheduled programs yet."
            : "Nothing matches that search."}
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label={copy.listLabel}
          className="max-h-[300px] overflow-y-auto rounded-md border border-border"
        >
          {rows.map((program, index) => (
            <ProgramRow
              key={program.id}
              program={program}
              selected={program.id === selectedId}
              first={index === 0}
              onSelect={() => onSelect(program.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FacetChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

export function ProgramRow({
  program,
  selected,
  first,
  onSelect,
}: {
  program: PickerProgram;
  selected: boolean;
  first?: boolean;
  onSelect: () => void;
}) {
  const kind = getProgramSchedulingType(program);
  const cadence = formatProgramCadence(program);
  const facets = programFacets(program).slice(0, MAX_ROW_FACETS);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
        !first && "border-t border-border",
        selected ? "bg-primary/5" : "hover:bg-muted/50"
      )}
    >
      <ProgramTile kind={kind} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{program.name}</span>
        {cadence && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{cadence}</span>
        )}
        {facets.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {facets.map((facet) => (
              <Badge key={facet} variant="outline" className="font-normal">
                {facet}
              </Badge>
            ))}
          </span>
        )}
      </span>

      <SchedulingPill kind={kind} />
      <ChevronRight
        className={cn("h-4 w-4 shrink-0", selected ? "text-primary" : "text-muted-foreground/50")}
        aria-hidden="true"
      />
    </button>
  );
}
