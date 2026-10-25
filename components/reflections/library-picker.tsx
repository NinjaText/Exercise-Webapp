"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import {
  REFLECTION_KINDS,
  REFLECTION_KIND_LABELS,
  REFLECTION_THEMES,
} from "@/lib/reflections/constants";
import { REFLECTION_LIBRARY, type LibraryReflection } from "@/lib/reflections/library";

const ALL = "ALL";

/** The built-in prompt library with theme / type filters and a text search. */
export function LibraryPicker({
  selectedId,
  onPick,
}: {
  selectedId?: string | null;
  onPick: (entry: LibraryReflection) => void;
}) {
  const [theme, setTheme] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return REFLECTION_LIBRARY.filter(
      (entry) =>
        (theme === ALL || entry.theme === theme) &&
        (kind === ALL || entry.kind === kind) &&
        (!needle ||
          entry.text.toLowerCase().includes(needle) ||
          (entry.author?.toLowerCase().includes(needle) ?? false))
    );
  }, [theme, kind, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the library"
            aria-label="Search the library"
            className="pl-9"
          />
        </div>
        <Select value={theme} onValueChange={(next) => setTheme(next ?? ALL)}>
          <SelectTrigger aria-label="Theme">
            <SelectValue>{(value: string | null) => (value && value !== ALL ? value : "All themes")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All themes</SelectItem>
            {REFLECTION_THEMES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(next) => setKind(next ?? ALL)}>
          <SelectTrigger aria-label="Type">
            <SelectValue>
              {(value: string | null) =>
                value && value !== ALL ? REFLECTION_KIND_LABELS[value as keyof typeof REFLECTION_KIND_LABELS] : "All types"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {REFLECTION_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {REFLECTION_KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {results.length === 0 ? (
        <EmptyState size="compact" icon={Search} title="No matches" description="Try another theme, type or search." />
      ) : (
        <ul className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2" aria-label="Library reflections">
          {results.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-pressed={selectedId === entry.id}
                onClick={() => onPick(entry)}
                className="flex h-full w-full flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left transition-colors outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-brand-border aria-pressed:bg-brand-soft motion-reduce:transition-none"
              >
                <span className="text-caption font-medium text-muted-foreground">
                  {REFLECTION_KIND_LABELS[entry.kind]} · {entry.theme}
                </span>
                <span className="text-body text-foreground">{entry.text}</span>
                {entry.author && <span className="text-caption text-muted-foreground">— {entry.author}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
