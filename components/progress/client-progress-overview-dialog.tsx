"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PainTrendChart } from "./pain-trend-chart";
import type { ClientProgressReport } from "@/lib/services/client-progress.service";

const RADIUS = 52;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const RANGE_OPTIONS = [4, 8, 12] as const;
const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Directional stat line. `goodDirection` differs per metric: rising completion
 * is good, rising pain is not — so the arrow colour is driven by intent, not
 * by the sign of the number.
 */
function Delta({ value, goodDirection }: { value: number | null; goodDirection: "up" | "down" }) {
  if (value === null) return null;
  if (value === 0) {
    return (
      <span className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
        0%
      </span>
    );
  }
  const rising = value > 0;
  const good = goodDirection === "up" ? rising : !rising;
  const Icon = rising ? ArrowUp : ArrowDown;
  return (
    <span className={cn("flex items-center gap-1 text-sm font-semibold", good ? "text-success" : "text-danger")}>
      <Icon className="h-4 w-4" />
      {Math.abs(value)}%
    </span>
  );
}

/**
 * Last 4 / 8 / 12 weeks picker for the header. `to` is always "now"; only
 * the window length varies. The active pill is inferred from the span of
 * the current range rather than tracked as separate state, since `range`
 * is the single source of truth passed down from the caller.
 */
function RangePicker({
  range,
  onChange,
}: {
  range: { from: Date; to: Date };
  onChange: (range: { from: Date; to: Date }) => void;
}) {
  const spanWeeks = Math.round((range.to.getTime() - range.from.getTime()) / (7 * DAY_MS));

  const handleSelect = (weeks: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - weeks * 7 * DAY_MS);
    onChange({ from, to });
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex gap-1">
        {RANGE_OPTIONS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => handleSelect(w)}
            aria-pressed={spanWeeks === w}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              spanWeeks === w
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            Last {w} weeks
          </button>
        ))}
      </div>
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        {format(range.from, "MMM d, yyyy")} – {format(range.to, "MMM d, yyyy")}
      </span>
    </div>
  );
}

export function ClientProgressOverviewDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  report,
  range,
  onRangeChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  report: ClientProgressReport | null;
  range: { from: Date; to: Date };
  onRangeChange: (range: { from: Date; to: Date }) => void;
}) {
  const [weeks, setWeeks] = useState(4);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle className="text-xl font-bold">Client Progress Overview</DialogTitle>
              <p className="text-sm text-muted-foreground">{clientName}</p>
            </div>
            <RangePicker range={range} onChange={onRangeChange} />
          </div>
        </DialogHeader>

        {!report ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <CompletionCard completion={report.completion} />
              <PainCard pain={report.pain} />
            </div>

            <Card>
              <CardContent className="p-4 sm:p-5">
                <PainTrendChart points={report.painPoints} weeks={weeks} onWeeksChange={setWeeks} />
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <RecentActivityCard activity={report.recentActivity} clientId={clientId} />
              <ClientNotesCard notes={report.notes} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompletionCard({ completion }: { completion: ClientProgressReport["completion"] }) {
  const { completed, scheduled, percent, changeVsPrevious } = completion;
  const length = (percent / 100) * CIRCUMFERENCE;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <p className="mb-4 text-base font-semibold">Workout Completion</p>
        {scheduled === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No workouts scheduled in this period
          </p>
        ) : (
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <svg width={128} height={128} viewBox="0 0 128 128" className="-rotate-90">
                <circle cx={64} cy={64} r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
                <circle
                  cx={64}
                  cy={64}
                  r={RADIUS}
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth={STROKE}
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold tabular-nums">{percent}%</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums">
                {completed} of {scheduled}
              </p>
              <p className="text-sm text-muted-foreground">workouts completed</p>
              <div className="mt-2">
                <Delta value={changeVsPrevious} goodDirection="up" />
                {changeVsPrevious !== null && (
                  <p className="text-xs text-muted-foreground">vs. previous period</p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PainCard({ pain }: { pain: ClientProgressReport["pain"] }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <p className="mb-4 text-base font-semibold">Pain Level</p>
        {pain.latest === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No pain scores logged in this period
          </p>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-4xl font-bold tabular-nums">
                {pain.latest}
                <span className="text-xl font-normal text-muted-foreground"> / 10</span>
              </p>
              <div className="mt-2">
                {/* Falling pain is improvement, so "down" is the good direction. */}
                <Delta value={pain.percentChange} goodDirection="down" />
                {pain.percentChange !== null && (
                  <p className="text-xs text-muted-foreground">vs. start ({pain.baseline}/10)</p>
                )}
              </div>
            </div>
            <div className="shrink-0 space-y-1 text-sm">
              <p className="text-muted-foreground">
                Start: <span className="font-semibold text-foreground">{pain.baseline}/10</span>
              </p>
              <p className="text-muted-foreground">
                Latest: <span className="font-semibold text-foreground">{pain.latest}/10</span>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivityCard({
  activity,
  clientId,
}: {
  activity: ClientProgressReport["recentActivity"];
  clientId: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-semibold">Recent Activity</p>
          <Link href={`/clients/${clientId}/adherence`} className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No activity in this period</p>
        ) : (
          <div className="space-y-2">
            {activity.map((s) => {
              const done = s.status === "COMPLETED";
              return (
                <div key={`${s.scheduledDate.toISOString()}-${s.workoutName}`} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      done ? "bg-success" : "bg-danger"
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5 text-white" /> : <X className="h-3.5 w-3.5 text-white" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{done ? "Completed workout" : "Missed workout"}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.workoutName ?? "Workout"}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(s.scheduledDate, "MMM d, yyyy")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClientNotesCard({
  notes,
}: {
  notes: ClientProgressReport["notes"];
}) {
  // Client Notes shows client-authored text only (ClinicalNote — the trainer's SOAP
  // note — must never appear here); there is no page that lists the full merged set,
  // so no "View all" link here. Show up to 3 of the already-fetched merged notes.
  const shown = notes.slice(0, 3);
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-semibold">Client Notes</p>
        </div>
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No client notes in this period</p>
        ) : (
          <div className="space-y-2">
            {shown.map((note, i) => (
              <blockquote key={`${note.createdAt.toISOString()}-${i}`} className="rounded-xl border border-border/60 p-3">
                {note.context && (
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{note.context}</p>
                )}
                <p className="text-sm">&ldquo;{note.text}&rdquo;</p>
                <footer className="mt-2 text-xs text-muted-foreground">
                  — {note.author}, {format(note.createdAt, "MMM d, yyyy")}
                </footer>
              </blockquote>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
