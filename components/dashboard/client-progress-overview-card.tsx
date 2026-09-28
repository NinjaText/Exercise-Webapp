"use client";

import { useState } from "react";
import { ArrowRight, ChevronRight, TrendingUp, Users } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ROLE_CLASSES } from "@/lib/ui/status";
import {
  ClientProgressPickerDialog,
  type ProgressFilter,
} from "@/components/progress/client-progress-picker-dialog";
import { ClientProgressOverviewDialog } from "@/components/progress/client-progress-overview-dialog";
import { useClientProgressReport } from "@/components/progress/use-client-progress-report";
import type {
  ClientProgressBreakdown,
  ClientProgressEntry,
  ClientProgressStatus,
} from "@/lib/services/dashboard-insights.service";

const SEGMENTS: { key: ClientProgressStatus; label: string; color: string; dot: string }[] = [
  { key: "onTrack", label: "On Track", color: "var(--success)", dot: ROLE_CLASSES.success.dot },
  { key: "atRisk", label: "At Risk", color: "var(--warning)", dot: ROLE_CLASSES.warning.dot },
  { key: "offTrack", label: "Off Track", color: "var(--danger)", dot: ROLE_CLASSES.danger.dot },
];

const RADIUS = 52;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Dashboard donut of client progress. "View report" (or a status row) opens a
 * client picker; choosing a client opens their Client Progress Overview, with
 * a back control to return to the list.
 */
export function ClientProgressOverviewCard({ breakdown }: { breakdown: ClientProgressBreakdown }) {
  const { total } = breakdown;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState<ProgressFilter>("all");
  const [selected, setSelected] = useState<ClientProgressEntry | null>(null);
  // Separate from `selected` so the report keeps its content while animating closed.
  const [reportOpen, setReportOpen] = useState(false);
  const { range, report, load, changeRange, cancel } = useClientProgressReport({
    onError: () => {
      setReportOpen(false);
      setPickerOpen(true);
    },
  });

  const openPicker = (nextFilter: ProgressFilter) => {
    setFilter(nextFilter);
    setPickerOpen(true);
  };

  const openReport = (client: ClientProgressEntry) => {
    setPickerOpen(false);
    setSelected(client);
    setReportOpen(true);
    void load(client.clientId, range);
  };

  const closeReport = () => {
    cancel();
    setReportOpen(false);
  };

  const backToPicker = () => {
    closeReport();
    setPickerOpen(true);
  };

  const { arcs } = SEGMENTS.reduce<{ arcs: Array<(typeof SEGMENTS)[number] & { value: number; fraction: number; dashArray: string; dashOffset: number }>; cursor: number }>(
    (acc, seg) => {
      const value = breakdown[seg.key];
      const fraction = total > 0 ? value / total : 0;
      const length = fraction * CIRCUMFERENCE;
      acc.arcs.push({ ...seg, value, fraction, dashArray: `${length} ${CIRCUMFERENCE - length}`, dashOffset: -acc.cursor });
      return { arcs: acc.arcs, cursor: acc.cursor + length };
    },
    { arcs: [], cursor: 0 }
  );

  return (
    <SectionCard
      title="Client Progress Overview"
      icon={TrendingUp}
      action={
        total > 0 ? (
          <button
            type="button"
            onClick={() => openPicker("all")}
            className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            View report
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        ) : undefined
      }
    >
      {total === 0 ? (
        <EmptyState size="compact" icon={Users} title="No active clients yet" />
      ) : (
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            <svg width={128} height={128} viewBox="0 0 128 128" className="-rotate-90">
              <circle cx={64} cy={64} r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
              {arcs.map((arc) =>
                arc.value > 0 ? (
                  <circle
                    key={arc.key}
                    cx={64}
                    cy={64}
                    r={RADIUS}
                    fill="none"
                    stroke={arc.color}
                    strokeWidth={STROKE}
                    strokeDasharray={arc.dashArray}
                    strokeDashoffset={arc.dashOffset}
                    strokeLinecap="butt"
                  />
                ) : null
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">{total}</span>
              <span className="text-[10px] text-muted-foreground">Clients</span>
            </div>
          </div>

          <div className="-mx-2 min-w-0 flex-1 space-y-0.5">
            {arcs.map((arc) => (
              <button
                key={arc.key}
                type="button"
                onClick={() => openPicker(arc.key)}
                aria-label={`View ${arc.label.toLowerCase()} clients`}
                className="group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${arc.dot}`} />
                  {arc.label}
                </span>
                <span className="flex items-center gap-1 font-medium text-foreground">
                  {arc.value} ({Math.round(arc.fraction * 100)}%)
                  <ChevronRight
                    className="size-3.5 text-muted-foreground/50 transition-colors group-hover:text-foreground"
                    aria-hidden
                  />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-4 text-[11px] text-muted-foreground/60">
        Based on workout completion and feedback
      </p>

      <ClientProgressPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        clients={breakdown.clients}
        filter={filter}
        onFilterChange={setFilter}
        onSelect={openReport}
      />
      {selected && (
        <ClientProgressOverviewDialog
          open={reportOpen}
          onOpenChange={(open) => {
            if (!open) closeReport();
          }}
          clientId={selected.clientId}
          clientName={selected.clientName}
          report={report}
          range={range}
          onRangeChange={(nextRange) => changeRange(selected.clientId, nextRange)}
          onBack={backToPicker}
          showProfileLink
        />
      )}
    </SectionCard>
  );
}
