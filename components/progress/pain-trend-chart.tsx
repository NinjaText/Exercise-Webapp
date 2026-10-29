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
// Axis labels are HTML overlaid on the SVG (not SVG <text>), so they stay a
// readable size when the chart scales down to a phone-width card.
const PAD = { top: 8, right: 8, bottom: 8, left: 40 };

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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
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
                "h-9 rounded-md px-3 text-xs font-medium transition-colors sm:h-auto sm:px-2.5 sm:py-1",
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
        <div>
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Pain level over time">
              {[0, 5, 10].map((tick) => (
                <line
                  key={tick}
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
              ))}
              {visible.length > 1 && <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} />}
              {visible.map((p) => (
                <circle key={p.recordedAt.toISOString()} cx={x(p.recordedAt)} cy={y(p.value)} r={3} fill="var(--primary)" />
              ))}
            </svg>
            {[0, 5, 10].map((tick) => (
              <span
                key={tick}
                aria-hidden
                className="absolute left-0 -translate-y-1/2 pr-1 text-right text-[10px] leading-none text-muted-foreground tabular-nums"
                style={{ top: `${(y(tick) / H) * 100}%`, width: `${(PAD.left / W) * 100}%` }}
              >
                {tick}
              </span>
            ))}
          </div>
          {visible.length > 1 && (
            <div
              className="mt-1 flex justify-between text-[10px] text-muted-foreground"
              style={{ paddingLeft: `${(PAD.left / W) * 100}%`, paddingRight: `${(PAD.right / W) * 100}%` }}
            >
              <span>{format(visible[0].recordedAt, "MMM d")}</span>
              <span>{format(visible[visible.length - 1].recordedAt, "MMM d")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
