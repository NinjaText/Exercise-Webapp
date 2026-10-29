"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface ShareableDay {
  dayNumber: number;
  /** A short hint beside the day, e.g. the reflection's opening words. */
  hint: string;
}

export interface ImageShareValue {
  enabled: boolean;
  scope: "all" | "selected";
  days: number[];
}

export const NO_IMAGE_SHARE: ImageShareValue = { enabled: false, scope: "all", days: [] };

/** The other day numbers an ImageShareValue resolves to. */
export function resolveSharedDays(value: ImageShareValue, days: ShareableDay[]): number[] {
  if (!value.enabled) return [];
  return value.scope === "all" ? days.map((d) => d.dayNumber) : value.days;
}

/**
 * "Use this image on other days" for a program plan: off keeps the image on
 * this day only; on applies it to every planned day or to the days picked.
 */
export function ImageShareField({
  days,
  value,
  onChange,
}: {
  /** The plan's other days that already have a reflection. */
  days: ShareableDay[];
  value: ImageShareValue;
  onChange: (next: ImageShareValue) => void;
}) {
  const id = useId();
  const selected = new Set(value.days);

  return (
    <div className="flex flex-col rounded-lg border border-border">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <Label htmlFor={`${id}-share`}>Use this image on other days</Label>
          <p className="text-caption text-muted-foreground">
            {value.enabled ? "Replaces the image on the days you choose." : "Off — the image appears on this day only."}
          </p>
        </div>
        <Switch id={`${id}-share`} checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} />
      </div>

      {value.enabled && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which days">
            {(
              [
                { scope: "all", label: `All planned days (${days.length})` },
                { scope: "selected", label: "Only selected days" },
              ] as const
            ).map((option) => (
              <button
                key={option.scope}
                type="button"
                role="radio"
                aria-checked={value.scope === option.scope}
                onClick={() => onChange({ ...value, scope: option.scope })}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-label text-muted-foreground transition-colors outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-brand-border aria-checked:bg-brand-soft aria-checked:text-brand motion-reduce:transition-none"
              >
                {option.label}
              </button>
            ))}
          </div>

          {value.scope === "selected" && (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto" aria-label="Days">
              {days.map((day) => {
                const isOn = selected.has(day.dayNumber);
                return (
                  <li key={day.dayNumber}>
                    <button
                      type="button"
                      aria-pressed={isOn}
                      onClick={() =>
                        onChange({
                          ...value,
                          days: isOn ? value.days.filter((d) => d !== day.dayNumber) : [...value.days, day.dayNumber],
                        })
                      }
                      className={cn(
                        "flex min-h-10 w-full items-center gap-3 rounded-md border px-3 py-1.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                        isOn ? "border-brand-border bg-brand-soft" : "border-border bg-surface hover:border-border-strong"
                      )}
                    >
                      <span className={cn("shrink-0 text-label tabular-nums", isOn ? "text-brand" : "text-foreground")}>
                        Day {day.dayNumber}
                      </span>
                      <span className="truncate text-caption text-muted-foreground">{day.hint}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-caption text-muted-foreground" aria-live="polite">
            {value.scope === "all"
              ? `The image will also show on ${days.length} other day${days.length === 1 ? "" : "s"}.`
              : `${value.days.length} other day${value.days.length === 1 ? "" : "s"} selected.`}{" "}
            Days without a reflection aren&apos;t listed.
          </p>
        </div>
      )}
    </div>
  );
}
