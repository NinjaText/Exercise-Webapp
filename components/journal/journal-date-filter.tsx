"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { format, subDays } from "date-fns";
import { CalendarRange, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDateKey } from "@/lib/reflections/dates";

export interface JournalRangeKeys {
  /** Inclusive "YYYY-MM-DD" bounds, or null for an open end. */
  from: string | null;
  to: string | null;
}

const PRESETS = [
  { value: "all", label: "All time", days: null },
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "custom", label: "Custom range", days: null },
] as const;
type Preset = (typeof PRESETS)[number]["value"];

function localKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** "Last N days" ends today and includes it, so it starts N-1 days back. */
function presetFrom(days: number): string {
  return localKey(subDays(new Date(), days - 1));
}

function presetOf(range: JournalRangeKeys): Preset {
  if (!range.from && !range.to) return "all";
  if (!range.to) {
    const match = PRESETS.find((p) => p.days !== null && presetFrom(p.days) === range.from);
    if (match) return match.value;
  }
  return "custom";
}

function formatKey(key: string): string {
  const day = parseDateKey(key);
  return day ? format(new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()), "MMM d, yyyy") : key;
}

/** A human summary of the active range, e.g. "Oct 1, 2026 – Oct 15, 2026". */
export function describeRange(range: JournalRangeKeys): string | null {
  if (range.from && range.to) return range.from === range.to ? formatKey(range.from) : `${formatKey(range.from)} – ${formatKey(range.to)}`;
  if (range.from) return `Since ${formatKey(range.from)}`;
  if (range.to) return `Up to ${formatKey(range.to)}`;
  return null;
}

/**
 * Date-range filter for the journal. The range lives in the URL (`from` /
 * `to`), so the server only loads matching entries and older ones stay
 * reachable past the page-size cap.
 */
export function JournalDateFilter({ range }: { range: JournalRangeKeys }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [preset, setPreset] = useState<Preset>(() => presetOf(range));
  const [from, setFrom] = useState(range.from ?? "");
  const [to, setTo] = useState(range.to ?? "");
  const today = localKey(new Date());

  function navigate(next: JournalRangeKeys) {
    const params = new URLSearchParams();
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function choosePreset(next: Preset) {
    setPreset(next);
    if (next === "custom") return;
    const days = PRESETS.find((p) => p.value === next)?.days ?? null;
    navigate(days === null ? { from: null, to: null } : { from: presetFrom(days), to: null });
  }

  function clear() {
    setPreset("all");
    setFrom("");
    setTo("");
    navigate({ from: null, to: null });
  }

  const customInvalid = Boolean(from && to && from > to);
  const customUnchanged = (from || null) === range.from && (to || null) === range.to;
  const active = Boolean(range.from || range.to);

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-xs ring-1 ring-border sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col gap-2 sm:w-48">
        <Label htmlFor="journal-range">Show entries from</Label>
        <Select value={preset} onValueChange={(next) => choosePreset((next as Preset) ?? "all")}>
          <SelectTrigger id="journal-range">
            <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
            <SelectValue>{(value: string | null) => PRESETS.find((p) => p.value === value)?.label ?? "All time"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preset === "custom" && (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (!customInvalid) navigate({ from: from || null, to: to || null });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="journal-from">From</Label>
              <Input id="journal-from" type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="journal-to">To</Label>
              <Input id="journal-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <Button type="submit" variant="outline" disabled={isPending || customInvalid || (!from && !to) || customUnchanged}>
            Apply
          </Button>
        </form>
      )}

      <div className="flex items-center gap-2 empty:hidden sm:ml-auto">
        {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading entries" />}
        {active && (
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={isPending}>
            <X className="size-4" />
            Clear
          </Button>
        )}
      </div>

      {customInvalid && (
        <p className="text-caption text-danger sm:basis-full" role="alert">
          The start date must be on or before the end date.
        </p>
      )}
    </div>
  );
}
