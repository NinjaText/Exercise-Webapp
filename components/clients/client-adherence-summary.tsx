import Link from "next/link";

interface ClientAdherenceSummaryProps {
  clientId: string;
  completionRate: number;
  completed: number;
  missedOrSkipped: number;
  avgRPE: number | null;
  total: number;
}

/**
 * Adherence at a glance, rendered as a strip inside the client's identity card
 * rather than its own card — "who is this" and "how are they doing" are one
 * question on this page, and answering them in two stacked cards pushed the
 * actual work (calendar, programs, messages) below the fold.
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

  const stats = [
    { label: "Completion", value: `${completionRate}%`, className: "" },
    { label: "Completed", value: String(completed), className: "text-success" },
    { label: "Missed", value: String(missedOrSkipped), className: "text-destructive" },
    { label: "Avg RPE", value: avgRPE != null ? `${avgRPE}/10` : "—", className: "" },
  ];

  return (
    <div className="border-t border-border/60 bg-muted/25 px-4 py-3.5 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-9 gap-y-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-baseline gap-2">
            <span className={`text-xl font-semibold tabular-nums ${stat.className}`}>
              {stat.value}
            </span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
        <Link
          href={`/clients/${clientId}/adherence`}
          className="ml-auto rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all sessions
        </Link>
      </div>
    </div>
  );
}
