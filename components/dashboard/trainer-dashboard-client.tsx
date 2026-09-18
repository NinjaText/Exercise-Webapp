"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarDays, Inbox, MessageSquareText, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
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

  return (
    <>
      <Suspense fallback={null}>
        <FocusParamReader onFocus={handleFocus} />
      </Suspense>

      <PageHeader
        title={`${greeting} 👋`}
        breadcrumb={[{ label: "Dashboard" }]}
        description="Here's what's happening with your clients today."
        primaryAction={
          <GenerateProgramEntryDialog trigger={<Button />}>
            <Sparkles className="size-4" />
            Generate Program
          </GenerateProgramEntryDialog>
        }
        secondaryActions={<AddClientDialog triggerVariant="outline" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          size="compact"
          label="Clients needing attention"
          value={clientsNeedingAttention}
          icon={AlertTriangle}
          role={clientsNeedingAttention > 0 ? "warning" : "success"}
          href="/dashboard?focus=priorities"
          scroll={false}
        />
        <StatCard
          size="compact"
          label="Sessions due today"
          value={sessionsDueToday}
          icon={CalendarDays}
          role="info"
          href="/dashboard?focus=sessions-today"
          scroll={false}
        />
        <StatCard
          size="compact"
          label="Pending feedback"
          value={pendingFeedback}
          icon={MessageSquareText}
          role="brand"
          onClick={() => setFeedbackSheetOpen(true)}
        />
        <StatCard
          size="compact"
          label="Unread messages"
          value={unreadMessages}
          icon={Inbox}
          role={unreadMessages > 0 ? "info" : "neutral"}
          href={unreadMessages > 0 ? "/messages?filter=unread" : "/messages"}
        />
      </div>

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
    </>
  );
}
