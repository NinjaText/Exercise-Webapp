import { getPlatformStats, getRecentUsers, getTopTrainers } from "@/lib/services/admin.service";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { Users, UserCheck, User, Dumbbell, Library, Activity, TrendingUp, Zap } from "lucide-react";
import { format } from "date-fns";
import Image from "next/image";
import { StatusBadge } from "@/components/shared/status-badge";

export default async function AdminOverviewPage() {
  const [stats, recentUsers, topTrainers] = await Promise.all([
    getPlatformStats(),
    getRecentUsers(8),
    getTopTrainers(5),
  ]);

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }]}
        title="Platform Overview"
        description="Real-time snapshot of all activity across the INMOTUS RX platform."
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Total Users"
          value={stats.totalUsers.toLocaleString()}
          description={`+${stats.newUsersThisMonth} this month`}
          icon={Users}
          role="info"
        />
        <StatCard label="Trainers" value={stats.trainers.toLocaleString()} icon={UserCheck} role="brand" />
        <StatCard label="Clients" value={stats.clients.toLocaleString()} icon={User} role="success" />
        <StatCard
          label="Active Programs"
          value={stats.activePrograms.toLocaleString()}
          description={`${stats.totalPrograms.toLocaleString()} total`}
          icon={TrendingUp}
          role="success"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Exercises"
          value={stats.totalExercises.toLocaleString()}
          description="In library"
          icon={Dumbbell}
          role="neutral"
        />
        <StatCard label="Total Programs" value={stats.totalPrograms.toLocaleString()} icon={Library} role="neutral" />
        <StatCard label="Sessions Completed" value={stats.totalSessions.toLocaleString()} icon={Activity} role="neutral" />
        <StatCard
          label="New This Month"
          value={stats.newUsersThisMonth.toLocaleString()}
          description="Signups"
          icon={Zap}
          role="neutral"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Recent Sign-ups" action={{ label: "View all", href: "/admin/users" }} contentClassName="px-0 pb-0">
          <div className="divide-y divide-border">
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
                  {u.imageUrl ? (
                    <Image src={u.imageUrl} alt="" fill className="object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">
                      {u.firstName[0]}{u.lastName[0]}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {u.firstName} {u.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={u.role} size="sm" />
                  <span className="text-[10px] text-muted-foreground/60">
                    {format(new Date(u.createdAt), "MMM d")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Top Trainers"
          action={<span className="text-xs text-muted-foreground">by client count</span>}
          contentClassName="px-0 pb-0"
        >
          <div className="divide-y divide-border">
            {topTrainers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
                  {c.imageUrl ? (
                    <Image src={c.imageUrl} alt="" fill className="object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">{c.name.charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <p className="text-sm font-bold tabular-nums text-foreground">{c.clientCount}</p>
                    <p className="text-[10px] text-muted-foreground/60">clients</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold tabular-nums text-foreground">{c.programCount}</p>
                    <p className="text-[10px] text-muted-foreground/60">programs</p>
                  </div>
                </div>
              </div>
            ))}
            {topTrainers.length === 0 && (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">No trainers yet.</p>
            )}
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
