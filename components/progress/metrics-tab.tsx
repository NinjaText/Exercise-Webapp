"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataList, type Column } from "@/components/shared/data-list";
import { Activity, Plus } from "lucide-react";
import { BodyMetricChart } from "@/components/progress/body-metric-chart";
import { AddBodyMetricDialog } from "@/components/progress/add-body-metric-dialog";

interface BodyMetric {
  id: string;
  metricType: string;
  value: number;
  unit: string;
  notes?: string | null;
  recordedAt: Date | string;
}

const READING_COLUMNS: Column<BodyMetric>[] = [
  { key: "date", header: "Date", render: (m) => format(new Date(m.recordedAt), "MMM d, yyyy") },
  { key: "value", header: "Value", className: "font-medium", render: (m) => m.value },
  { key: "unit", header: "Unit", className: "text-muted-foreground", render: (m) => m.unit },
  {
    key: "notes",
    header: "Notes",
    className: "max-w-xs text-muted-foreground sm:truncate max-sm:col-span-2 max-sm:max-w-none",
    render: (m) => m.notes ?? "—",
  },
];

interface MetricsTabProps {
  metrics: BodyMetric[];
  metricTypes: string[];
  clientId: string;
}

export function MetricsTab({
  metrics,
  metricTypes,
  clientId,
}: MetricsTabProps) {
  const [selectedType, setSelectedType] = useState<string>(
    metricTypes[0] ?? ""
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const filteredMetrics = selectedType
    ? metrics.filter((m) => m.metricType === selectedType)
    : [];

  const allTypes = Array.from(
    new Set([...metricTypes, ...metrics.map((m) => m.metricType)])
  ).sort();

  if (allTypes.length === 0 && !dialogOpen) {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="rounded-full bg-muted p-4">
            <Activity className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-base font-medium text-muted-foreground">
            No measurements recorded yet
          </p>
          <p className="text-sm text-muted-foreground/70">
            Track weight, pain score, range of motion, and more.
          </p>
          <Button size="sm" className="mt-2" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add First Measurement
          </Button>
        </div>

        <AddBodyMetricDialog
          clientId={clientId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={selectedType}
          onValueChange={(v) => setSelectedType(v ?? "")}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Select metric type..." />
          </SelectTrigger>
          <SelectContent>
            {allTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" className="h-10 w-full sm:h-8 sm:w-auto" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Measurement
        </Button>
      </div>

      {/* Chart */}
      <BodyMetricChart data={filteredMetrics} metricType={selectedType} />

      {/* Table of readings */}
      {filteredMetrics.length > 0 && (
        <DataList
          columns={READING_COLUMNS}
          data={[...filteredMetrics].sort(
            (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
          )}
          keyExtractor={(m) => m.id}
        />
      )}

      <AddBodyMetricDialog
        clientId={clientId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
