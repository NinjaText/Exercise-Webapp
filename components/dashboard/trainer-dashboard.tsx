import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  ChevronRight,
  CalendarDays,
  Flame,
} from "lucide-react";
import { formatRelativeTime, formatSessionStatus } from "@/lib/utils/formatting";
import { format } from "date-fns";
import { TodaysPrioritiesCard } from "@/components/dashboard/todays-priorities-card";
import { DashboardActivityCard } from "@/components/dashboard/dashboard-activity-card";
import type { ClientMetrics, PriorityAlert } from "@/lib/services/dashboard-insights.service";
import type { getInboxThreads } from "@/lib/services/message.service";

interface TrainerDashboardProps {
  clientCount: number;
  activePlans: number;
  pendingFeedback: number;
  unreadMessages: number;
  recentFeedback: {
    id: string;
    rating: string;
    comment: string | null;
    createdAt: Date;
    client: { firstName: string; lastName: string };
    planExercise: { exercise: { name: string } };
  }[];
  lowAdherenceClients: {
    id: string;
    firstName: string;
    lastName: string;
    complianceRate: number;
  }[];
  activePrograms?: number;
  upcomingSessions?: {
    id: string;
    scheduledDate: Date;
    status: string;
    client?: { id: string; firstName: string; lastName: string } | null;
    workout?: {
      program?: { id: string; name: string } | null;
    } | null;
  }[];
  priorities?: PriorityAlert[];
  clientsNeedingAttention?: number;
  sessionsDueToday?: number;
  clientMetrics?: Record<string, ClientMetrics>;
  recentMessages?: Awaited<ReturnType<typeof getInboxThreads>>;
}

const heroStats = (
  clientsNeedingAttention: number,
  sessionsDueToday: number,
  pendingFeedback: number,
  unreadMessages: number,
) => [
  { label: "Clients Needing Attention", value: clientsNeedingAttention, href: "/clients" },
  { label: "Sessions Due Today", value: sessionsDueToday, href: "/programs" },
  { label: "Pending Feedback", value: pendingFeedback, href: "/clients" },
  { label: "Unread Messages", value: unreadMessages, href: "/messages" },
];

const sessionStatusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-success/15 text-success",
  MISSED: "bg-red-100 text-red-700",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function TrainerDashboard({
  pendingFeedback,
  unreadMessages,
  recentFeedback,
  upcomingSessions = [],
  priorities = [],
  clientsNeedingAttention = 0,
  sessionsDueToday = 0,
  clientMetrics = {},
  recentMessages = [],
}: TrainerDashboardProps) {
  const stats = heroStats(clientsNeedingAttention, sessionsDueToday, pendingFeedback, unreadMessages);

  return (
    <div className="space-y-8">
      {/* Hero – greeting + compact stats over a gradient */}
      <Card
        className="border-0 text-white shadow-sm"
        style={{
          background: "linear-gradient(135deg, var(--primary), oklch(0.36 0.19 264))",
        }}
      >
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">{getGreeting()} 👋</h1>
              <p className="mt-1 text-sm text-white/80">
                Here&apos;s what&apos;s happening with your clients today.
              </p>
              <Button className="mt-4 bg-white text-primary hover:bg-white/90 [a]:hover:bg-white/90" asChild>
                <Link href="/programs/generate">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Program
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-4 lg:justify-end">
              {stats.map((stat) => (
                <Link key={stat.label} href={stat.href} className="group min-w-24">
                  <p className="text-3xl font-bold tabular-nums leading-none">{stat.value}</p>
                  <p className="mt-1.5 max-w-32 text-xs font-medium text-white/70 transition-colors group-hover:text-white">
                    {stat.label}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Priorities – most prominent */}
      <TodaysPrioritiesCard priorities={priorities} />

      {/* This Week's Sessions – full width, densest widget */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4.5 w-4.5 text-primary" />
            <CardTitle className="text-base font-semibold">This Week&apos;s Sessions</CardTitle>
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground" asChild>
            <Link href="/programs">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {upcomingSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No sessions this week</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Assign programs to your clients to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingSessions.slice(0, 8).map((session) => {
                const metrics = session.client ? clientMetrics[session.client.id] : undefined;
                const detailParts: string[] = [];
                if (metrics?.programWeek) {
                  detailParts.push(`Week ${metrics.programWeek.current} of ${metrics.programWeek.total}`);
                }
                if (metrics?.lastCompletedAt) {
                  detailParts.push(`Last ${formatRelativeTime(metrics.lastCompletedAt)}`);
                }
                return (
                  <div
                    key={session.id}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  >
                    {/* Client avatar */}
                    {session.client && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-medium text-xs">
                        {session.client.firstName[0]}{session.client.lastName[0]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {session.workout?.program?.name || "Workout"}
                      </p>
                      {session.client && (
                        <p className="text-xs text-muted-foreground">
                          {session.client.firstName} {session.client.lastName}
                        </p>
                      )}
                      {detailParts.length > 0 && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                          {detailParts.join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(session.scheduledDate), "EEE, MMM d")}
                        </span>
                        <Badge
                          className={`text-xs font-medium border-0 ${sessionStatusColors[session.status] || "bg-muted text-muted-foreground"}`}
                        >
                          {formatSessionStatus(session.status)}
                        </Badge>
                      </div>
                      {metrics && metrics.streak > 1 && (
                        <span className="flex items-center gap-0.5 text-[11px] font-medium text-amber-600">
                          <Flame className="h-3 w-3" />
                          {metrics.streak} streak
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feedback / Messages / AI Insights – one tabbed card */}
      <DashboardActivityCard recentFeedback={recentFeedback} recentMessages={recentMessages} />
    </div>
  );
}
