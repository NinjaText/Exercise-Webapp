"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addBodyMetricAction } from "@/actions/progress-actions";

interface MetricOption {
  label: string;
  type: string;
  defaultUnit: string;
}

const METRIC_OPTIONS: MetricOption[] = [
  { label: "Weight", type: "Weight", defaultUnit: "kg" },
  { label: "Pain Score (0–10)", type: "Pain Score", defaultUnit: "0-10" },
  { label: "Range of Motion", type: "Range of Motion", defaultUnit: "degrees" },
  { label: "Blood Pressure (Systolic)", type: "Blood Pressure", defaultUnit: "mmHg" },
  { label: "Heart Rate", type: "Heart Rate", defaultUnit: "bpm" },
  { label: "Walk Distance", type: "Walk Distance", defaultUnit: "m" },
  { label: "Step Count", type: "Step Count", defaultUnit: "steps" },
  { label: "Sleep Hours", type: "Sleep Hours", defaultUnit: "hours" },
];

interface AddBodyMetricDialogProps {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddBodyMetricDialog({
  clientId,
  open,
  onOpenChange,
  onSuccess,
}: AddBodyMetricDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [metricType, setMetricType] = useState<string>("");
  const [unit, setUnit] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  function handleMetricTypeChange(type: string) {
    setMetricType(type);
    const option = METRIC_OPTIONS.find((o) => o.type === type);
    if (option) setUnit(option.defaultUnit);
  }

  function handleSubmit() {
    setError(null);

    if (!metricType) {
      setError("Please select a metric type.");
      return;
    }
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      setError("Please enter a valid numeric value.");
      return;
    }
    if (!unit.trim()) {
      setError("Unit is required.");
      return;
    }

    startTransition(async () => {
      const result = await addBodyMetricAction(
        clientId,
        metricType,
        numericValue,
        unit.trim(),
        notes.trim() || undefined
      );

      if (result.success) {
        // Reset form
        setMetricType("");
        setUnit("");
        setValue("");
        setNotes("");
        setDate(format(new Date(), "yyyy-MM-dd"));
        onOpenChange(false);
        onSuccess?.();
      } else {
        setError(result.error ?? "Failed to save metric.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Measurement</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Metric type */}
          <div className="space-y-1.5">
            <Label>Metric Type</Label>
            <Select value={metricType} onValueChange={(v) => handleMetricTypeChange(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select metric..." />
              </SelectTrigger>
              <SelectContent>
                {METRIC_OPTIONS.map((opt) => (
                  <SelectItem key={opt.type} value={opt.type}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Value + Unit */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="metric-value">Value</Label>
              <Input
                id="metric-value"
                type="number"
                step="any"
                placeholder="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="metric-unit">Unit</Label>
              <Input
                id="metric-unit"
                placeholder="kg"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="metric-date">Date</Label>
            <Input
              id="metric-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="metric-notes">Notes (optional)</Label>
            <Textarea
              id="metric-notes"
              placeholder="Any additional context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving..." : "Save Measurement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
