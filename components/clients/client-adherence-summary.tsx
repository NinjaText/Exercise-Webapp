import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";

interface ClientAdherenceSummaryProps {
  clientId: string;
  completionRate: number;
  completed: number;
  missedOrSkipped: number;
  avgRPE: number | null;
  total: number;
}

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
    { label: "Completion Rate", value: `${completionRate}%`, className: "" },
    { label: "Completed", value: String(completed), className: "text-success" },
    { label: "Missed / Skipped", value: String(missedOrSkipped), className: "text-destructive" },
    { label: "Avg RPE", value: avgRPE != null ? `${avgRPE}/10` : "—", className: "" },
  ];

  return (
    <Card className="shadow-sm ring-1 ring-border/50">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-base font-semibold">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Adherence
          </p>
          <Link
            href={`/clients/${clientId}/adherence`}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            View all sessions
          </Link>
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className={`text-3xl font-bold tabular-nums ${stat.className}`}>
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
