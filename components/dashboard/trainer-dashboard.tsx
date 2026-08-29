import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { TodaysPrioritiesCard } from "@/components/dashboard/todays-priorities-card";
import { WeekWorkoutsCard } from "@/components/dashboard/week-workouts-card";
import { DashboardActivityCard } from "@/components/dashboard/dashboard-activity-card";
import { CreateProgramMenu } from "@/components/programs/create-program-menu";
import { AddClientDialog } from "@/components/clients/add-client-dialog";
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
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <CreateProgramMenu
                  trigger={<Button className="bg-white text-primary hover:bg-white/90 [a]:hover:bg-white/90" />}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Program
                </CreateProgramMenu>
                <AddClientDialog triggerClassName="bg-transparent text-white border border-white/40 hover:bg-white/10" />
              </div>
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

      {/* This Week's Workouts – full width, densest widget */}
      <WeekWorkoutsCard sessions={upcomingSessions} clientMetrics={clientMetrics} />

      {/* Feedback / Messages / AI Insights – one tabbed card */}
      <DashboardActivityCard recentFeedback={recentFeedback} recentMessages={recentMessages} />
    </div>
  );
}
