"use client";

import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PickerClient } from "./create-reflection-flow";

/**
 * An explicit, always-visible recipient checklist. Unlike a filter dropdown,
 * an empty selection here means "nobody yet" — never "everyone".
 */
export function ClientRecipientPicker({
  clients,
  value,
  onChange,
}: {
  clients: PickerClient[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
  }, [clients, query]);
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));

  function toggle(clientId: string, checked: boolean) {
    onChange(checked ? [...value, clientId] : value.filter((v) => v !== clientId));
  }

  function toggleVisible() {
    const ids = new Set(value);
    for (const c of visible) {
      if (allVisibleSelected) ids.delete(c.id);
      else ids.add(c.id);
    }
    onChange([...ids]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={`${id}-search`}>Recipients</Label>
        <span className="text-caption text-muted-foreground tabular-nums" aria-live="polite">
          {value.length} of {clients.length} selected
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-surface-muted/50 px-3 py-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id={`${id}-search`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients…"
              className="pl-8"
            />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={toggleVisible} disabled={visible.length === 0}>
            {allVisibleSelected ? "Clear" : query ? "Select matches" : "Select all"}
          </Button>
        </div>
        {visible.length === 0 ? (
          <p className="px-3 py-4 text-center text-body text-muted-foreground">No clients match “{query}”.</p>
        ) : (
          <ul className="max-h-64 divide-y divide-border overflow-y-auto" aria-label="Clients">
            {visible.map((client) => {
              const checkboxId = `${id}-${client.id}`;
              return (
                <li key={client.id}>
                  <label
                    htmlFor={checkboxId}
                    className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-muted motion-reduce:transition-none"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={selected.has(client.id)}
                      onCheckedChange={(checked) => toggle(client.id, checked === true)}
                    />
                    <span className="truncate text-body text-foreground">{client.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** "Ana, Ben and 3 others" — for summaries and the preview step. */
export function recipientSummary(names: string[], max = 3): string {
  if (names.length <= max) {
    return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  const rest = names.length - max;
  return `${names.slice(0, max).join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}
