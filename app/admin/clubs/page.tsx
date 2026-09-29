import Link from "next/link";
import { Flag, Plus } from "lucide-react";
import { listClubsWithStats } from "@/lib/services/club.service";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { DataList, type Column } from "@/components/shared/data-list";
import { EmptyState } from "@/components/shared/empty-state";

type ClubRow = Awaited<ReturnType<typeof listClubsWithStats>>[number];

const columns: Column<ClubRow>[] = [
  {
    key: "club",
    header: "Club",
    render: ({ org }) => (
      <Link href={`/admin/clubs/${org.clerkOrgId}`} className="font-medium text-foreground hover:underline">
        {org.name}
      </Link>
    ),
  },
  {
    key: "join",
    header: "Join link",
    className: "hidden md:table-cell",
    render: ({ org }) => <span className="text-xs text-muted-foreground">/join/{org.joinSlug}</span>,
  },
  { key: "members", header: "Members", align: "right", render: (r) => <span className="text-sm">{r.members}</span> },
  { key: "trialing", header: "Trialing", align: "right", render: (r) => <span className="text-sm">{r.trialing}</span> },
  {
    key: "expired",
    header: "Trial ended",
    align: "right",
    className: "hidden md:table-cell",
    render: (r) => <span className="text-sm">{r.expired}</span>,
  },
  { key: "paying", header: "Paying", align: "right", render: (r) => <span className="text-sm">{r.paying}</span> },
  {
    key: "conversion",
    header: "Conversion",
    align: "right",
    render: (r) => (
      <span className="text-sm">{r.conversionRate === null ? "—" : `${Math.round(r.conversionRate * 100)}%`}</span>
    ),
  },
];

export default async function AdminClubsPage() {
  const clubs = await listClubsWithStats();

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
