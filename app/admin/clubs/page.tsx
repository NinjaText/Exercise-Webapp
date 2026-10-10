import Link from "next/link";
import { CreditCard, Flag, Plus, Users } from "lucide-react";
import type { StatusRole } from "@/lib/ui/status";
import { listClubsWithStats } from "@/lib/services/club.service";
import { describeClubPrice, type ClubPriceView } from "@/lib/services/club-pricing.service";
import { priceSummary } from "./[orgId]/price-fields";
import { ManageClubButton } from "./[orgId]/manage-club-button";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { DataList, type Column } from "@/components/shared/data-list";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireSuperAdmin } from "@/lib/current-user";
import { getClubAttentionCounts, isClubAlertsMuted } from "@/lib/services/club-alerts.service";
import { AlertsToggle } from "./alerts-toggle";

type ClubRow = Awaited<ReturnType<typeof listClubsWithStats>>[number] & {
  membershipPrice: ClubPriceView;
  coachingPrice: ClubPriceView;
  attention: number;
};

const HOUSE_COACH_BADGE: Record<ClubRow["houseCoach"]["status"], { label: string; role: StatusRole }> = {
  active: { label: "Active", role: "success" },
  none: { label: "No house coach", role: "danger" },
};

const columns: Column<ClubRow>[] = [
  {
    key: "club",
    header: "Club",
    render: ({ org }) => (
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-xs font-semibold text-brand-foreground"
        >
          {org.name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{org.name}</p>
          <p className="truncate text-caption">/join/{org.joinSlug}</p>
        </div>
      </div>
    ),
  },
  {
    key: "houseCoach",
    header: "House coach",
    className: "hidden md:table-cell",
    render: ({ houseCoach }) => (
      <div className="flex flex-col gap-1">
        <StatusBadge
          status={houseCoach.status}
          label={HOUSE_COACH_BADGE[houseCoach.status].label}
          role={HOUSE_COACH_BADGE[houseCoach.status].role}
          size="sm"
        />
        {houseCoach.status === "active" && <span className="text-caption">{houseCoach.name}</span>}
      </div>
    ),
  },
  {
    key: "price",
    header: "Pricing",
    className: "hidden md:table-cell",
    render: (r) => (
      <div className="flex flex-col">
        <span className="text-body text-foreground tabular-nums">{priceSummary(r.membershipPrice)}</span>
        <span className="text-caption">
          {r.coachingPrice.status === "none" ? "No coaching" : `Coaching ${priceSummary(r.coachingPrice)}`}
        </span>
      </div>
    ),
  },
  {
    key: "attention",
    header: "Needs attention",
    align: "right",
    render: (r) =>
      r.attention > 0 ? (
        <StatusBadge status="attention" label={String(r.attention)} role="danger" size="sm" />
      ) : (
        <span className="text-caption">—</span>
      ),
  },
  { key: "members", header: "Members", align: "right", render: (r) => <span className="text-body">{r.members}</span> },
  { key: "trialing", header: "On trial", align: "right", render: (r) => <span className="text-body">{r.trialing}</span> },
  {
    key: "expired",
    header: "Trial ended",
    align: "right",
    className: "hidden lg:table-cell",
    render: (r) => <span className="text-body">{r.expired}</span>,
  },
  { key: "paying", header: "Paying", align: "right", render: (r) => <span className="text-body">{r.paying}</span> },
  {
    key: "coached",
    header: "Coached",
    align: "right",
    className: "hidden lg:table-cell",
    render: (r) => <span className="text-body">{r.coached}</span>,
  },
  {
    key: "conversion",
    header: "Conversion",
    align: "right",
    className: "hidden sm:table-cell",
    render: (r) => (
      <span className="text-body font-medium text-foreground">
        {r.conversionRate === null ? "—" : `${Math.round(r.conversionRate * 100)}%`}
      </span>
    ),
  },
  {
    key: "manage",
    header: "",
    align: "right",
    render: (r) => <ManageClubButton clerkOrgId={r.org.clerkOrgId} compact />,
  },
];

export default async function AdminClubsPage() {
  const admin = await requireSuperAdmin();
  const [stats, attention, muted] = await Promise.all([
    listClubsWithStats(),
    getClubAttentionCounts(),
    isClubAlertsMuted(admin.id),
  ]);
  const clubs: ClubRow[] = await Promise.all(
    stats.map(async (row) => {
      const [membershipPrice, coachingPrice] = await Promise.all([
        describeClubPrice(row.org.stripePriceId ?? null),
        describeClubPrice(row.org.coachingStripePriceId ?? null),
      ]);
      return { ...row, membershipPrice, coachingPrice, attention: attention.get(row.org.clerkOrgId) ?? 0 };
    })
  );

  const totals = clubs.reduce(
    (t, r) => ({ members: t.members + r.members, paying: t.paying + r.paying, open: t.open + (r.houseCoach.status === "active" ? 1 : 0) }),
    { members: 0, paying: 0, open: 0 }
  );

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Clubs" }]}
        title="Clubs"
        description="Member-paid organizations with their own join link and free trial."
        meta={<AlertsToggle initialMuted={muted} />}
        primaryAction={
          <Button asChild>
            <Link href="/admin/clubs/new">
              <Plus className="h-4 w-4" />
              New club
            </Link>
          </Button>
        }
      />
      {clubs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard size="compact" label="Active clubs" value={`${totals.open} of ${clubs.length}`} icon={Flag} />
          <StatCard size="compact" label="Members" value={totals.members} icon={Users} />
          <StatCard size="compact" label="Paying members" value={totals.paying} icon={CreditCard} role="success" />
        </div>
      )}
      <DataList
        columns={columns}
        data={clubs}
        keyExtractor={(r) => r.org.clerkOrgId}
        rowHref={(r) => `/admin/clubs/${r.org.clerkOrgId}`}
        emptyState={
          <EmptyState size="compact" icon={Flag} title="No clubs yet. Create one to get a join link." />
        }
      />
    </PageShell>
  );
}
