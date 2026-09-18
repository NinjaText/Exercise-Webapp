"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ListChecks, CircleCheck } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ROLE_CLASSES, statusRole } from "@/lib/ui/status";
import { cn } from "@/lib/utils";
import type { AlertKind, AlertSeverity, PriorityAlert } from "@/lib/services/dashboard-insights.service";

const severityLabel: Record<AlertSeverity, string> = {
  high: "High Priority",
  medium: "Medium Priority",
  low: "On Track",
};

/** High → Medium → Low. Also the order the "expand all" affordance reveals groups in. */
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

interface TodaysPrioritiesCardProps {
  priorities: PriorityAlert[];
  /**
   * Bumped by the dashboard wrapper (e.g. when arriving at `?focus=priorities`)
   * to force every severity group open. A counter rather than a boolean so
   * repeated triggers still re-expand after the trainer has collapsed a group.
   */
  expandSignal?: number;
}

export function TodaysPrioritiesCard({ priorities, expandSignal = 0 }: TodaysPrioritiesCardProps) {
  const groups = useMemo(
    () =>
      SEVERITY_ORDER.map((severity) => ({
        severity,
        alerts: priorities.filter((alert) => alert.severity === severity),
      })).filter((group) => group.alerts.length > 0),
    [priorities]
  );

  // Controlled so an external "expand all" can force every group open. Starts
  // fully collapsed, matching the card's original uncontrolled behaviour.
  const [openGroups, setOpenGroups] = useState<AlertSeverity[]>([]);
  const [handledSignal, setHandledSignal] = useState(expandSignal);

  // Adjusting state during render (rather than in an effect) is React's
  // recommended way to react to a changed prop: it re-renders before the
  // browser paints, so the groups never flash closed on arrival.
  if (expandSignal !== handledSignal) {
    setHandledSignal(expandSignal);
    if (expandSignal > 0) {
      setOpenGroups(groups.map((group) => group.severity));
    }
  }

  return (
    <SectionCard
      title="Today's Priorities"
      icon={ListChecks}
      count={priorities.length}
      className="h-full"
    >
      {priorities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <CircleCheck className="h-9 w-9 text-success/40" />
          <p className="mt-2.5 text-sm font-medium text-muted-foreground">
            You&apos;re all caught up
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            No clients need attention right now
          </p>
        </div>
      ) : (
        <Accordion
          multiple
          value={openGroups}
          onValueChange={(value) => setOpenGroups(value as AlertSeverity[])}
        >
          {groups.map(({ severity, alerts }) => (
            <AccordionItem key={severity} value={severity}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <StatusBadge status={severity} label={severityLabel[severity]} size="sm" />
                  <span className="text-xs font-medium text-muted-foreground">{alerts.length}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {alerts.map((alert, i) => (
                    <div
                      key={`${alert.clientId}-${i}`}
                      className="rounded-xl border border-border/60 bg-muted/20 p-2.5"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                            ROLE_CLASSES[statusRole(alert.severity)].dot
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{alert.clientName}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">{alert.message}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{alert.reason}</p>
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
    </SectionCard>
  );
}
