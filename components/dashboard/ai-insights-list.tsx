"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles, TriangleAlert, Lightbulb, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissInsightAction } from "@/actions/dismiss-insight-action";
import type { InsightKind } from "@/lib/constants/insights";
import {
  ACTIONS_BY_INSIGHT_KIND,
  INSIGHT_ACTION_CONFIG,
  type InsightActionKey,
} from "@/components/dashboard/ai-insight-actions";

/** Mirrors CoachingInsight from lib/services/dashboard-ai-insights.service.ts. */
interface CoachingInsight {
  clientId: string;
  clientName: string;
  kind: InsightKind;
  what: string;
  why: string;
  action: string;
  type: "warning" | "suggestion" | "positive";
  programId: string | null;
}

const typeStyles: Record<CoachingInsight["type"], { icon: typeof Lightbulb; className: string }> = {
  warning: { icon: TriangleAlert, className: "text-red-600" },
  suggestion: { icon: Lightbulb, className: "text-amber-600" },
  positive: { icon: CircleCheck, className: "text-success" },
};

/** Stable local key — insights have no server id, so (client, kind) identifies one. */
function insightKey(insight: CoachingInsight): string {
  return `${insight.clientId}:${insight.kind}`;
}

export function AiInsightsList() {
  const [insights, setInsights] = useState<CoachingInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/ai-insights")
      .then((res) => (res.ok ? res.json() : { insights: [] }))
      .then((data) => {
        if (active) setInsights(Array.isArray(data.insights) ? data.insights : []);
      })
      .catch(() => {
        if (active) setInsights([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function handleDismiss(insight: CoachingInsight) {
    const key = insightKey(insight);
    setDismissingKey(key);
    startTransition(async () => {
      const result = await dismissInsightAction({
        clientId: insight.clientId,
        kind: insight.kind,
      });
      setDismissingKey(null);
      if (result.success) {
        setInsights((prev) => prev.filter((i) => insightKey(i) !== key));
      } else {
        toast.error(result.error ?? "Failed to dismiss insight");
      }
    });
  }

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Sparkles className="h-9 w-9 text-muted-foreground/30" />
        <p className="mt-2.5 text-sm font-medium text-muted-foreground">No insights right now</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Insights appear as your clients log activity
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {insights.map((insight) => {
        const style = typeStyles[insight.type] ?? typeStyles.suggestion;
        const Icon = style.icon;
        const key = insightKey(insight);
        const actionKeys = ACTIONS_BY_INSIGHT_KIND[insight.kind] ?? ["message_client", "dismiss"];

        return (
          <div key={key} className="rounded-xl border border-border/60 p-3">
            <div className="flex items-start gap-2.5">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.className}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{insight.clientName}</p>
                <p className="mt-0.5 text-xs text-foreground/80">{insight.what}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{insight.why}</p>
                <p className="mt-1 text-xs font-medium text-foreground">
                  Next: <span className="font-normal">{insight.action}</span>
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 pl-6.5">
              {actionKeys.map((actionKey: InsightActionKey) => {
                const config = INSIGHT_ACTION_CONFIG[actionKey];

                if (actionKey === "dismiss") {
                  return (
                    <Button
                      key={actionKey}
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      disabled={dismissingKey === key}
                      onClick={() => handleDismiss(insight)}
                    >
                      {config.label}
                    </Button>
                  );
                }

                const href = config.href?.({
                  clientId: insight.clientId,
                  programId: insight.programId,
                });
                if (!href) return null;

                return (
                  <Button key={actionKey} variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <Link href={href}>{config.label}</Link>
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
