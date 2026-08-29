import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ListChecks, CircleCheck } from "lucide-react";
import type { AlertKind, AlertSeverity, PriorityAlert } from "@/lib/services/dashboard-insights.service";

const severityDot: Record<AlertSeverity, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-success",
};

const severityLabel: Record<AlertSeverity, string> = {
  high: "High Priority",
  medium: "Medium Priority",
  low: "On Track",
};

const severityBadge: Record<AlertSeverity, string> = {
  high: "bg-red-500/10 text-red-700",
  medium: "bg-amber-500/10 text-amber-700",
  low: "bg-success/10 text-success",
};

const SEVERITY_ORDER: AlertSeverity[] = ["high", "medium", "low"];

type ActionKey = "view_client" | "message" | "create_next_program";

const ACTIONS_BY_KIND: Record<AlertKind, ActionKey[]> = {
  pain_feedback: ["view_client", "message"],
  no_sessions_started: ["view_client", "message"],
  inactive: ["view_client", "message"],
  discomfort: ["view_client", "message"],
  low_completion: ["view_client", "message"],
  delayed_pattern: ["view_client", "message"],
  program_ending: ["view_client", "create_next_program"],
  fully_completed: ["view_client"],
};

const ACTION_CONFIG: Record<ActionKey, { label: string; href: (alert: PriorityAlert) => string }> = {
  view_client: { label: "View Client", href: (alert) => `/clients/${alert.clientId}` },
  message: { label: "Message", href: (alert) => `/messages/${alert.clientId}` },
  create_next_program: {
    label: "Create Next Program",
    href: (alert) => `/programs/generate?clientId=${alert.clientId}`,
  },
};

export function TodaysPrioritiesCard({ priorities }: { priorities: PriorityAlert[] }) {
  const groups = SEVERITY_ORDER.map((severity) => ({
    severity,
    alerts: priorities.filter((alert) => alert.severity === severity),
  })).filter((group) => group.alerts.length > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4.5 w-4.5 text-primary" />
          <CardTitle className="text-base font-semibold">Today&apos;s Priorities</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {priorities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CircleCheck className="h-10 w-10 text-success/40" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">You&apos;re all caught up</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              No clients need attention right now
            </p>
          </div>
        ) : (
          <Accordion multiple>
            {groups.map(({ severity, alerts }) => (
              <AccordionItem key={severity} value={severity}>
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${severityDot[severity]}`} />
                    {severityLabel[severity]}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${severityBadge[severity]}`}
                    >
                      {alerts.length}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {alerts.map((alert, i) => (
                      <div
                        key={`${alert.clientId}-${i}`}
                        className="rounded-xl border border-border/60 bg-muted/20 p-3"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${severityDot[alert.severity]}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{alert.clientName}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{alert.message}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {ACTIONS_BY_KIND[alert.kind].map((actionKey) => {
                                const action = ACTION_CONFIG[actionKey];
                                return (
                                  <Button
                                    key={actionKey}
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    asChild
                                  >
                                    <Link href={action.href(alert)}>{action.label}</Link>
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
