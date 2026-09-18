import { Target, CheckCircle2, XCircle, Gauge } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";

interface ClientAdherenceSummaryProps {
  clientId: string;
  completionRate: number;
  completed: number;
  missedOrSkipped: number;
  avgRPE: number | null;
  total: number;
}

/**
 * Adherence at a glance, rendered as a 4-up compact stat strip directly under
 * the page header rather than nested inside the identity card — "who is this"
 * and "how are they doing" are one question on this page, and answering them
 * in two stacked cards pushed the actual work (calendar, programs, messages)
 * below the fold.
 */
export function ClientAdherenceSummary({
  clientId,
  completionRate,
  completed,
  missedOrSkipped,
  avgRPE,
  total,
}: ClientAdherenceSummaryProps) {
  if (total === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        size="compact"
        label="Completion"
        value={`${completionRate}%`}
        icon={Target}
        role={completionRate >= 70 ? "success" : completionRate >= 40 ? "warning" : "danger"}
        href={`/clients/${clientId}/adherence`}
      />
      <StatCard size="compact" label="Completed" value={completed} icon={CheckCircle2} role="success" />
      <StatCard
        size="compact"
        label="Missed"
        value={missedOrSkipped}
        icon={XCircle}
        role={missedOrSkipped > 0 ? "warning" : "neutral"}
      />
      <StatCard size="compact" label="Avg RPE" value={avgRPE != null ? `${avgRPE}/10` : "—"} icon={Gauge} />
    </div>
  );
}
