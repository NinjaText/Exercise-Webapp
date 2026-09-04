import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import type { ClientProgressBreakdown } from "@/lib/services/dashboard-insights.service";

const SEGMENTS: { key: keyof Omit<ClientProgressBreakdown, "total">; label: string; color: string; dot: string }[] = [
  { key: "onTrack", label: "On Track", color: "var(--success)", dot: "bg-success" },
  { key: "atRisk", label: "At Risk", color: "oklch(0.75 0.17 70)", dot: "bg-amber-500" },
  { key: "offTrack", label: "Off Track", color: "oklch(0.63 0.22 25)", dot: "bg-red-500" },
];

const RADIUS = 52;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ClientProgressOverviewCard({ breakdown }: { breakdown: ClientProgressBreakdown }) {
  const { total } = breakdown;

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4.5 w-4.5 text-primary" />
          <CardTitle className="text-base font-semibold">Client Progress Overview</CardTitle>
        </div>
        <Link href="/clients" className="text-xs font-medium text-primary hover:underline">
          View report
        </Link>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No active clients yet</p>
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

            <div className="min-w-0 flex-1 space-y-2.5">
              {arcs.map((arc) => (
                <div key={arc.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${arc.dot}`} />
                    {arc.label}
                  </span>
                  <span className="font-medium text-foreground">
                    {arc.value} ({Math.round(arc.fraction * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-4 text-[11px] text-muted-foreground/60">
          Based on workout completion and feedback
        </p>
      </CardContent>
    </Card>
  );
}
