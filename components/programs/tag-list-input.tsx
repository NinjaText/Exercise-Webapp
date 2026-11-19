"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface Props {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  suggestions?: string[];
  /** Only show the suggestion chips while the input has focus (keeps dense panels calm). */
  suggestionsOnFocus?: boolean;
  /** Accessible name when there's no visible <label> wired to the input. */
  ariaLabel?: string;
}

// Free-text chip input for any repeated short value: the program editor's
// category fields (Body Area, Goal, Activity/Sport, Tags) and a client's
// secondary diagnoses and prior injuries. They all share the same "type and
// press Enter, or pick a suggestion" interaction.
export function TagListInput({ values, onChange, placeholder, suggestions, suggestionsOnFocus, ariaLabel }: Props) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);

  function add(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || values.includes(trimmed)) return;
    onChange([...values, trimmed]);
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
      setInput("");
    }
  }

  const unusedSuggestions = suggestions?.filter((s) => !values.includes(s));

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <Badge key={value} variant="secondary" className="gap-1 pr-1 text-sm">
              {value}
              <button
                type="button"
                onClick={() => remove(value)}
                aria-label={`Remove ${value}`}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        aria-label={ariaLabel}
        onBlur={() => {
          setFocused(false);
          if (input.trim()) {
            add(input);
            setInput("");
          }
        }}
        placeholder={placeholder}
        className="h-9"
      />
      {unusedSuggestions && unusedSuggestions.length > 0 && (!suggestionsOnFocus || focused) && (
        <div className="flex flex-wrap gap-1">
          {unusedSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              // Keep focus in the input so the chips don't vanish mid-click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s)}
              className="rounded-md bg-muted/60 px-1.5 py-0.5 text-caption text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
