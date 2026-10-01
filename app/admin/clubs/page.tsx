import Link from "next/link";
import { CreditCard, Flag, Plus, Users } from "lucide-react";
import type { StatusRole } from "@/lib/ui/status";
import { listClubsWithStats } from "@/lib/services/club.service";
import { describeClubPrice, type ClubPriceView } from "@/lib/services/club-pricing.service";
import { priceSummary } from "./[orgId]/price-fields";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { DataList, type Column } from "@/components/shared/data-list";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";

type ClubRow = Awaited<ReturnType<typeof listClubsWithStats>>[number] & {
  membershipPrice: ClubPriceView;
  coachingPrice: ClubPriceView;
};

const TRAINER_BADGE: Record<ClubRow["trainer"]["status"], { label: string; role: StatusRole }> = {
  active: { label: "Active", role: "success" },
  pending: { label: "Awaiting trainer", role: "warning" },
  none: { label: "No trainer", role: "danger" },
  unknown: { label: "Unknown", role: "neutral" },
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
    key: "trainer",
    header: "Trainer",
    className: "hidden md:table-cell",
    render: ({ trainer }) => (
      <div className="flex flex-col gap-1">
        <StatusBadge
          status={trainer.status}
          label={TRAINER_BADGE[trainer.status].label}
          role={TRAINER_BADGE[trainer.status].role}
          size="sm"
        />
        {trainer.status === "active" && <span className="text-caption">{trainer.name}</span>}
        {trainer.status === "pending" && <span className="text-caption">{trainer.email}</span>}
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
];

export default async function AdminClubsPage() {
  const stats = await listClubsWithStats();
  const clubs: ClubRow[] = await Promise.all(
    stats.map(async (row) => {
      const [membershipPrice, coachingPrice] = await Promise.all([
        describeClubPrice(row.org.stripePriceId ?? null),
        describeClubPrice(row.org.coachingStripePriceId ?? null),
      ]);
      return { ...row, membershipPrice, coachingPrice };
    })
  );

  const totals = clubs.reduce(
    (t, r) => ({ members: t.members + r.members, paying: t.paying + r.paying, open: t.open + (r.trainer.status === "active" ? 1 : 0) }),
    { members: 0, paying: 0, open: 0 }
  );

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Clubs" }]}
        title="Clubs"
        description="Member-paid organizations with their own join link and free trial."
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
