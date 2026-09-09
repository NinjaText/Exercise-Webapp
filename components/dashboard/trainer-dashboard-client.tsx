"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { TodaysPrioritiesCard } from "@/components/dashboard/todays-priorities-card";
import {
  WeekWorkoutsCard,
  type DateScope,
  type StatusFilter,
} from "@/components/dashboard/week-workouts-card";
import { DashboardInboxCard } from "@/components/dashboard/dashboard-inbox-card";
import { AiInsightsCard } from "@/components/dashboard/ai-insights-card";
import { ClientProgressOverviewCard } from "@/components/dashboard/client-progress-overview-card";
import { PendingFeedbackSheet } from "@/components/dashboard/pending-feedback-sheet";
import { GenerateProgramEntryDialog } from "@/components/programs/generate-program-entry-dialog";
import { AddClientDialog } from "@/components/clients/add-client-dialog";
import type {
  ClientMetrics,
  ClientProgressBreakdown,
  PriorityAlert,
} from "@/lib/services/dashboard-insights.service";
import type { getInboxThreads } from "@/lib/services/message.service";

/** The `?focus=` values the hero tiles use to drive same-page behaviour. */
type FocusTarget = "priorities" | "sessions-today";

export interface TrainerDashboardClientProps {
  /** Computed server-side so the greeting matches the server's clock, as it always has. */
  greeting: string;
  pendingFeedback: number;
  unreadMessages: number;
  clientsNeedingAttention: number;
  sessionsDueToday: number;
  upcomingSessions: {
    id: string;
    scheduledDate: Date;
    status: string;
    client?: { id: string; firstName: string; lastName: string; email: string } | null;
    workout?: { program?: { id: string; name: string } | null } | null;
  }[];
  priorities: PriorityAlert[];
  clientMetrics: Record<string, ClientMetrics>;
  recentMessages: Awaited<ReturnType<typeof getInboxThreads>>;
  clientProgress: ClientProgressBreakdown;
}

/**
 * Reads `?focus=` and hands it to the dashboard once.
 *
 * Isolated behind its own Suspense boundary because `useSearchParams` opts the
 * whole subtree it lives in out of static rendering.
 */
function FocusParamReader({ onFocus }: { onFocus: (focus: FocusTarget) => void }) {
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus");

  useEffect(() => {
    if (focus === "priorities" || focus === "sessions-today") {
      onFocus(focus);
    }
  }, [focus, onFocus]);

  return null;
}

/**
 * Owns the dashboard's shared interaction state.
 *
 * All data still comes from the server component above — this layer only
 * decides what is expanded, filtered or open, so that the two hero tiles that
 * used to navigate away (Clients Needing Attention, Sessions Due Today) can
 * instead re-focus the cards already on the page.
 */
export function TrainerDashboardClient({
  greeting,
  pendingFeedback,
  unreadMessages,
  clientsNeedingAttention,
  sessionsDueToday,
  upcomingSessions,
  priorities,
  clientMetrics,
  recentMessages,
  clientProgress,
}: TrainerDashboardClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  const prioritiesRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<HTMLDivElement>(null);

  const [prioritiesExpandSignal, setPrioritiesExpandSignal] = useState(0);
  const [sessionsFilter, setSessionsFilter] = useState<{
    status: StatusFilter;
    dateScope: DateScope;
  }>({ status: "all", dateScope: "week" });
  const [feedbackSheetOpen, setFeedbackSheetOpen] = useState(false);

  const handleFocus = useCallback(
    (focus: FocusTarget) => {
      if (focus === "priorities") {
        setPrioritiesExpandSignal((n) => n + 1);
        prioritiesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        setSessionsFilter({ status: "due", dateScope: "today" });
        sessionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      // Clear the param so a refresh (or a second click on the same tile)
      // doesn't silently re-apply a focus the trainer has since moved on from.
      router.replace(pathname, { scroll: false });
    },
    [pathname, router]
  );

  const heroStats: { label: string; value: number; href?: string; onClick?: () => void }[] = [
    {
      label: "Clients Needing Attention",
      value: clientsNeedingAttention,
      href: "/dashboard?focus=priorities",
    },
    {
      label: "Sessions Due Today",
      value: sessionsDueToday,
      href: "/dashboard?focus=sessions-today",
    },
    {
      label: "Pending Feedback",
      value: pendingFeedback,
      onClick: () => setFeedbackSheetOpen(true),
    },
    {
      label: "Unread Messages",
      value: unreadMessages,
      href: unreadMessages > 0 ? "/messages?filter=unread" : "/messages",
    },
  ];

  const statValueClassName = "text-2xl font-bold leading-none tabular-nums";
  const statLabelClassName =
    "mt-1 max-w-32 text-xs font-medium text-white/70 transition-colors group-hover:text-white";

  return (
    <div className="space-y-5">
      <Suspense fallback={null}>
        <FocusParamReader onFocus={handleFocus} />
      </Suspense>

      {/* Hero – greeting + compact stats over a gradient */}
      <Card
        className="border-0 text-white shadow-sm"
        style={{
          background: "linear-gradient(135deg, var(--primary), oklch(0.36 0.19 264))",
        }}
      >
        <CardContent className="p-3.5 sm:p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                {greeting} 👋
              </h1>
              <p className="mt-0.5 text-xs text-white/80">
                Here&apos;s what&apos;s happening with your clients today.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <GenerateProgramEntryDialog
                  trigger={
                    <Button
                      size="sm"
                      className="bg-white text-primary hover:bg-white/90 [a]:hover:bg-white/90"
                    />
                  }
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Program
                </GenerateProgramEntryDialog>
                <AddClientDialog triggerClassName="bg-transparent text-white border border-white/40 hover:bg-white/10" />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-7 gap-y-3 lg:justify-end">
              {heroStats.map((stat) =>
                stat.href ? (
                  <Link key={stat.label} href={stat.href} scroll={false} className="group min-w-24">
                    <p className={statValueClassName}>{stat.value}</p>
                    <p className={statLabelClassName}>{stat.label}</p>
                  </Link>
                ) : (
                  <button
                    key={stat.label}
                    type="button"
                    onClick={stat.onClick}
                    className="group min-w-24 text-left outline-none focus-visible:ring-3 focus-visible:ring-white/40"
                  >
                    <p className={statValueClassName}>{stat.value}</p>
                    <p className={statLabelClassName}>{stat.label}</p>
                  </button>
                )
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Priorities + This Week's Workouts – side by side, and always
          the same height as each other regardless of how much either has to
          show, so the row doesn't end with one card taller than the other. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <div ref={prioritiesRef} className="h-full scroll-mt-20">
          <TodaysPrioritiesCard priorities={priorities} expandSignal={prioritiesExpandSignal} />
        </div>
        <div ref={sessionsRef} className="h-full scroll-mt-20">
          <WeekWorkoutsCard
            sessions={upcomingSessions}
            clientMetrics={clientMetrics}
            statusFilter={sessionsFilter.status}
            onStatusFilterChange={(status) => setSessionsFilter((prev) => ({ ...prev, status }))}
            dateScope={sessionsFilter.dateScope}
          />
        </div>
      </div>

      {/* Inbox / AI Insights / Client Progress – one glance at everything else */}
      <div className="grid gap-4 lg:grid-cols-3">
        <DashboardInboxCard threads={recentMessages} />
        <AiInsightsCard />
        <ClientProgressOverviewCard breakdown={clientProgress} />
      </div>

      <PendingFeedbackSheet
        open={feedbackSheetOpen}
        onOpenChange={setFeedbackSheetOpen}
        pendingCount={pendingFeedback}
      />
    </div>
  );
}
