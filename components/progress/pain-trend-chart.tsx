"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { filterPainPointsByWeeks, type PainPoint } from "@/lib/services/client-progress.service";

const WEEK_OPTIONS = [4, 8, 12] as const;

// Pain is always a 0–10 scale, so the axis is fixed. Auto-scaling would
// exaggerate a one-point change into a dramatic slope.
const Y_MAX = 10;
const W = 640;
const H = 180;
const PAD = { top: 8, right: 8, bottom: 24, left: 28 };

export function PainTrendChart({
  points,
  weeks,
  onWeeksChange,
  now = new Date(),
}: {
  points: PainPoint[];
  weeks: number;
  onWeeksChange: (weeks: number) => void;
  now?: Date;
}) {
  const visible = filterPainPointsByWeeks(points, weeks, now).sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
  );

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const first = visible[0]?.recordedAt.getTime() ?? 0;
  const last = visible[visible.length - 1]?.recordedAt.getTime() ?? 1;
  const span = Math.max(last - first, 1);

  const x = (d: Date) => PAD.left + ((d.getTime() - first) / span) * plotW;
  const y = (v: number) => PAD.top + (1 - v / Y_MAX) * plotH;

  const path = visible.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.recordedAt)} ${y(p.value)}`).join(" ");

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold">Pain Level Trend</p>
          <p className="text-xs text-muted-foreground">Self-reported pain (0–10)</p>
        </div>
        <div className="flex gap-1">
          {WEEK_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onWeeksChange(w)}
              aria-pressed={weeks === w}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                weeks === w
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {w}W
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">No pain scores logged yet</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground/70">
            Pain scores appear here once the client records a pain assessment from their
            Assessments page.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label="Pain level over time">
            {[0, 5, 10].map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
                <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
                  {tick}
                </text>
              </g>
            ))}
            {visible.length > 1 && <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} />}
            {visible.map((p) => (
              <circle key={p.recordedAt.toISOString()} cx={x(p.recordedAt)} cy={y(p.value)} r={3} fill="var(--primary)" />
            ))}
            {visible.length > 1 && (
              <>
                <text x={PAD.left} y={H - 6} className="fill-muted-foreground text-[9px]">
                  {format(visible[0].recordedAt, "MMM d")}
                </text>
                <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-muted-foreground text-[9px]">
                  {format(visible[visible.length - 1].recordedAt, "MMM d")}
                </text>
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
