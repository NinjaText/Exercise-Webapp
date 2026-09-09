import { TrainerDashboardClient } from "@/components/dashboard/trainer-dashboard-client";
import type { ClientMetrics, ClientProgressBreakdown, PriorityAlert } from "@/lib/services/dashboard-insights.service";
import type { getInboxThreads } from "@/lib/services/message.service";

interface TrainerDashboardProps {
  clientCount: number;
  activePlans: number;
  pendingFeedback: number;
  unreadMessages: number;
  activePrograms?: number;
  upcomingSessions?: {
    id: string;
    scheduledDate: Date;
    status: string;
    client?: { id: string; firstName: string; lastName: string; email: string } | null;
    workout?: {
      program?: { id: string; name: string } | null;
    } | null;
  }[];
  priorities?: PriorityAlert[];
  clientsNeedingAttention?: number;
  sessionsDueToday?: number;
  clientMetrics?: Record<string, ClientMetrics>;
  recentMessages?: Awaited<ReturnType<typeof getInboxThreads>>;
  clientProgress: ClientProgressBreakdown;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Server-side entry point for the trainer dashboard.
 *
 * Data fetching stays in the page/server layer; everything interactive (which
 * card is expanded, which filters are applied, which slide-over is open) lives
 * in `TrainerDashboardClient`.
 */
export function TrainerDashboard({
  pendingFeedback,
  unreadMessages,
  upcomingSessions = [],
  priorities = [],
  clientsNeedingAttention = 0,
  sessionsDueToday = 0,
  clientMetrics = {},
  recentMessages = [],
  clientProgress,
}: TrainerDashboardProps) {
  return (
    <TrainerDashboardClient
      greeting={getGreeting()}
      pendingFeedback={pendingFeedback}
      unreadMessages={unreadMessages}
      clientsNeedingAttention={clientsNeedingAttention}
      sessionsDueToday={sessionsDueToday}
      upcomingSessions={upcomingSessions}
      priorities={priorities}
      clientMetrics={clientMetrics}
      recentMessages={recentMessages}
      clientProgress={clientProgress}
    />
  );
}
