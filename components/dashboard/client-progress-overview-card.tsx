import { TrendingUp, Users } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ROLE_CLASSES } from "@/lib/ui/status";
import type { ClientProgressBreakdown } from "@/lib/services/dashboard-insights.service";

const SEGMENTS: { key: keyof Omit<ClientProgressBreakdown, "total">; label: string; color: string; dot: string }[] = [
  { key: "onTrack", label: "On Track", color: "var(--success)", dot: ROLE_CLASSES.success.dot },
  { key: "atRisk", label: "At Risk", color: "var(--warning)", dot: ROLE_CLASSES.warning.dot },
  { key: "offTrack", label: "Off Track", color: "var(--danger)", dot: ROLE_CLASSES.danger.dot },
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
    <SectionCard
      title="Client Progress Overview"
      icon={TrendingUp}
      action={{ label: "View report", href: "/clients" }}
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
    </SectionCard>
  );
}
