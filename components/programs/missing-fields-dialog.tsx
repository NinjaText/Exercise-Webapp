"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface MissingFieldsValues {
  programTitle: string;
  daysPerWeek: number;
  preferredWeekdays: string[];
}

interface Props {
  open: boolean;
  missingFields: string[];
  initialValues: MissingFieldsValues;
  onConfirm: (values: MissingFieldsValues) => void;
}

export function MissingFieldsDialog({ open, missingFields, initialValues, onConfirm }: Props) {
  const [title, setTitle] = useState(initialValues.programTitle);
  const [weekdays, setWeekdays] = useState<string[]>(initialValues.preferredWeekdays);

  useEffect(() => {
    if (open) {
      setTitle(initialValues.programTitle);
      setWeekdays(initialValues.preferredWeekdays);
    }
  }, [open, initialValues]);

  const needsTitle = missingFields.includes("programTitle");
  const needsSchedule =
    missingFields.includes("estimatedDaysPerWeek") || missingFields.includes("preferredWeekdays");

  function toggleDay(day: string) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  const canConfirm = (!needsTitle || title.trim().length > 0) && (!needsSchedule || weekdays.length > 0);

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>A few details we couldn&apos;t find</DialogTitle>
          <DialogDescription>
            This document didn&apos;t state everything needed to build the program. Fill these in
            before we generate it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {needsTitle && (
            <div className="space-y-2">
              <Label>Program Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Offseason Strength Block"
              />
            </div>
          )}
          {needsSchedule && (
            <div className="space-y-2">
              <Label>Which days does training happen on?</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const active = weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/60"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {weekdays.length} day{weekdays.length === 1 ? "" : "s"} per week
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                programTitle: title.trim(),
                daysPerWeek: weekdays.length || 1,
                preferredWeekdays: weekdays,
              })
            }
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
