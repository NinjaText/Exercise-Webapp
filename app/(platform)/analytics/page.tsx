import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getBusinessMetrics } from "@/lib/services/business-metrics.service";
import {
  NewClientsTrendChart,
  AttendanceTrendChart,
} from "@/components/analytics/business-metrics-charts";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, UserPlus, Repeat, CalendarCheck, Package } from "lucide-react";

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
    },
    {
      label: "New Clients",
      value: metrics.newClientsThisMonth.toString(),
      icon: UserPlus,
    },
    {
      label: "Retention",
      value: metrics.retentionRate === null ? "—" : `${metrics.retentionRate}%`,
      icon: Repeat,
    },
    {
      label: "Average Attendance",
      value: `${metrics.averageAttendanceRate}%`,
      icon: CalendarCheck,
    },
    {
      label: "Programs Sold",
      value: metrics.programsSold.toString(),
      icon: Package,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="Business performance for your organization this month."
      />

      {!metrics.hasOrganization && (
        <div className="rounded-2xl border border-dashed border-border p-4 sm:p-6 text-sm text-muted-foreground">
          Your account isn&apos;t linked to an organization yet, so there&apos;s no data to
          report. Metrics will populate once your organization is set up.
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 lg:grid-cols-5">
        {statCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New Clients per Month</CardTitle>
          </CardHeader>
          <CardContent>
            <NewClientsTrendChart data={metrics.newClientsTrend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average Attendance per Month</CardTitle>
          </CardHeader>
          <CardContent>
            <AttendanceTrendChart data={metrics.attendanceTrend} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
