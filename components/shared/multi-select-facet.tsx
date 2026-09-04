"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface MultiSelectFacetProps {
  label: string;
  icon?: React.ReactNode;
  allLabel: string;
  values: string[];
  options: readonly { value: string; label: string }[];
  onChange: (values: string[]) => void;
  searchPlaceholder?: string;
}

/** A searchable, multi-select filter dropdown — checked items stay visible as removable chips below. */
export function MultiSelectFacet({
  label,
  icon,
  allLabel,
  values,
  options,
  onChange,
  searchPlaceholder = "Search...",
}: MultiSelectFacetProps) {
  const [open, setOpen] = useState(false);

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  const triggerLabel =
    values.length === 0
      ? allLabel
      : values.length === 1
        ? (options.find((o) => o.value === values[0])?.label ?? values[0])
        : `${values.length} selected`;

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {label}
      </p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal" />
          }
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem key={opt.value} value={opt.label} onSelect={() => toggle(opt.value)}>
                    <Check className={cn("mr-2 h-4 w-4", values.includes(opt.value) ? "opacity-100" : "opacity-0")} />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-xs font-medium"
            >
              {options.find((o) => o.value === v)?.label ?? v}
              <button type="button" onClick={() => toggle(v)} className="text-muted-foreground hover:text-foreground">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
