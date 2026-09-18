import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getBusinessMetrics } from "@/lib/services/business-metrics.service";
import {
  NewClientsTrendChart,
  AttendanceTrendChart,
} from "@/components/analytics/business-metrics-charts";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { DollarSign, UserPlus, Repeat, CalendarCheck, Package, Users, Building2 } from "lucide-react";

/**
 * Trainer-facing, organization-scoped business analytics.
 *
 * Distinct from the platform-wide super-admin analytics at /admin/analytics:
 * every figure here is scoped to the viewing trainer's Clerk organization.
 */
export default async function AnalyticsPage() {
  const [user, { orgId: sessionOrgId }] = await Promise.all([
    requireRole("TRAINER"),
    auth(),
  ]);

  // Prefer the live session orgId; fall back to the DB record for accounts
  // created before Clerk Organizations were configured (mirrors the exercises page).
  const organizationOrgId = sessionOrgId ?? user.clerkOrgId ?? undefined;

  const metrics = await getBusinessMetrics({ orgId: organizationOrgId });

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  const statCards = [
    {
      label: "Revenue This Month",
      value: currencyFormatter.format(metrics.revenueThisMonthCents / 100),
      icon: DollarSign,
      role: "brand" as const,
    },
    {
      label: "New Clients",
      value: metrics.newClientsThisMonth.toString(),
      icon: UserPlus,
      role: "info" as const,
    },
    {
      label: "Retention",
      value: metrics.retentionRate === null ? "—" : `${metrics.retentionRate}%`,
      icon: Repeat,
      role: "success" as const,
    },
    {
      label: "Average Attendance",
      value: `${metrics.averageAttendanceRate}%`,
      icon: CalendarCheck,
      role: "info" as const,
    },
    {
      label: "Programs Sold",
      value: metrics.programsSold.toString(),
      icon: Package,
      role: "neutral" as const,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Analytics"
        description="Business performance for your organization this month."
      />

      {!metrics.hasOrganization && (
        <EmptyState
          size="compact"
          icon={Building2}
          title="No organization yet"
          description="Your account isn't linked to an organization yet, so there's no data to report. Metrics will populate once your organization is set up."
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5 lg:gap-6">
        {statCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            role={card.role}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="New clients per month" icon={Users}>
          <NewClientsTrendChart data={metrics.newClientsTrend} />
        </SectionCard>
        <SectionCard title="Average attendance per month" icon={CalendarCheck}>
          <AttendanceTrendChart data={metrics.attendanceTrend} />
        </SectionCard>
      </div>
    </PageShell>
  );
}
