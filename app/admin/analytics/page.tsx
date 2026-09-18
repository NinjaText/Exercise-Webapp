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
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { Users, Library, Activity } from "lucide-react";

export default async function AdminAnalyticsPage() {
  const [userGrowth, programData, sessionData, stats] = await Promise.all([
    getUserGrowthData(6),
    getProgramCreationData(6),
    getSessionActivityData(6),
    getPlatformStats(),
  ]);

  const roleDistribution = [
    { name: "Trainers", value: stats.trainers, color: "var(--chart-2)" },
    { name: "Clients", value: stats.clients, color: "var(--chart-1)" },
  ];

  const totalNewUsers    = userGrowth.reduce((s, d) => s + d.users, 0);
  const totalNewPrograms = programData.reduce((s, d) => s + d.programs, 0);
  const totalNewSessions = sessionData.reduce((s, d) => s + d.sessions, 0);

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Analytics" }]}
        title="Platform Analytics"
        description="Growth and activity trends over the last 6 months."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="New Users (6 mo)" value={totalNewUsers} icon={Users} role="info" />
        <StatCard label="Programs Created (6 mo)" value={totalNewPrograms} icon={Library} role="success" />
        <StatCard label="Sessions Completed (6 mo)" value={totalNewSessions} icon={Activity} role="brand" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="New User Registrations">
          <UserGrowthChart data={userGrowth} />
        </SectionCard>
        <SectionCard title="User Role Distribution">
          <RoleDistributionChart data={roleDistribution} />
        </SectionCard>
        <SectionCard title="Programs Created per Month">
          <ProgramCreationChart data={programData} />
        </SectionCard>
        <SectionCard title="Completed Sessions per Month">
          <SessionActivityChart data={sessionData} />
        </SectionCard>
      </div>
    </PageShell>
  );
}
