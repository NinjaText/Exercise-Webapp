import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatResetDate } from "@/lib/ai/usage/errors";
import { formatTokens, usagePercent } from "@/lib/ai/usage/format";
import type { AiUsageSummary } from "@/lib/ai/usage/service";

/** Small trainer-dashboard meter: AI tokens used this billing cycle vs. allowance. */
export function AiUsageMeterCard({ summary }: { summary: AiUsageSummary }) {
  const unlimited = summary.allowance === null;
  const pct = usagePercent(summary.used, summary.allowance);
  const exhausted = !unlimited && summary.remaining === 0;
  const tone = exhausted ? "danger" : pct >= 80 ? "warning" : "brand";

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 items-center gap-3 sm:w-64 sm:shrink-0">
          <span
            aria-hidden
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              tone === "danger" ? "bg-danger-soft text-danger-foreground" : tone === "warning" ? "bg-warning-soft text-warning-foreground" : "bg-brand-soft text-brand-foreground"
            )}
          >
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">AI usage</p>
            <p className="text-caption">
              {unlimited ? "Unlimited on your account" : `Resets ${formatResetDate(summary.resetsAt)}`}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-body tabular-nums">
              <span className="font-semibold text-foreground">{formatTokens(summary.used)}</span>
              {unlimited ? " tokens used this month" : ` of ${formatTokens(summary.allowance!)} tokens`}
            </p>
            {!unlimited && <p className="text-caption tabular-nums">{pct}%</p>}
          </div>
          {!unlimited && (
            <div
              role="progressbar"
              aria-label="AI allowance used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn("h-full rounded-full transition-all", tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-primary")}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          {exhausted && (
            <p className="text-caption text-danger-foreground">
              AI features are paused until {formatResetDate(summary.resetsAt)}. Upgrade your plan for a larger allowance.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
