import {
  getUserGrowthData,
  getProgramCreationData,
  getSessionActivityData,
  getPlatformStats,
} from "@/lib/services/admin.service";
import {
  UserGrowthChart,
  ProgramCreationChart,
  SessionActivityChart,
  RoleDistributionChart,
} from "@/components/admin/analytics-charts";

export default async function AdminAnalyticsPage() {
  const [userGrowth, programData, sessionData, stats] = await Promise.all([
    getUserGrowthData(6),
    getProgramCreationData(6),
    getSessionActivityData(6),
    getPlatformStats(),
  ]);

  const roleDistribution = [
    { name: "Trainers", value: stats.trainers, color: "#3b82f6" },
    { name: "Clients",   value: stats.clients,   color: "#06b6d4" },
  ];

  const totalNewUsers    = userGrowth.reduce((s, d) => s + d.users, 0);
  const totalNewPrograms = programData.reduce((s, d) => s + d.programs, 0);
  const totalNewSessions = sessionData.reduce((s, d) => s + d.sessions, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Growth and activity trends over the last 6 months.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">New Users (6 mo)</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground">{totalNewUsers}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Programs Created (6 mo)</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground">{totalNewPrograms}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Sessions Completed (6 mo)</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground">{totalNewSessions}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">New User Registrations</h2>
          <UserGrowthChart data={userGrowth} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">User Role Distribution</h2>
          <RoleDistributionChart data={roleDistribution} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Programs Created per Month</h2>
          <ProgramCreationChart data={programData} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Completed Sessions per Month</h2>
          <SessionActivityChart data={sessionData} />
        </div>
      </div>
    </div>
  );
}
