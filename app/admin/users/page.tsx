import { getAllUsers, getTrainersForOrgFilter, getTrainersWithClients } from "@/lib/services/admin.service";
import { format } from "date-fns";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Users } from "lucide-react";
import { UserActionsMenu } from "@/components/admin/user-actions-menu";
import { TrainersWithClientsTable } from "@/components/admin/trainers-with-clients-table";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { PageToolbar } from "@/components/shared/page-toolbar";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    role?: string;
    page?: string;
    view?: string;
    archived?: string;
    org?: string;
  }>;
}

type UserRow = Awaited<ReturnType<typeof getAllUsers>>["items"][number];

const userColumns: Column<UserRow>[] = [
  {
    key: "user",
    header: "User",
    render: (u) => (
      <div className="flex items-center gap-3">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
          {u.imageUrl ? (
            <Image src={u.imageUrl} alt="" fill className="object-cover" />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">
              {u.firstName[0]}{u.lastName[0]}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className={`font-medium truncate ${u.isActive === false ? "italic text-muted-foreground" : "text-foreground"}`}>
            {u.firstName} {u.lastName}
          </p>
          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
        </div>
      </div>
    ),
  },
  {
    key: "role",
    header: "Role",
    render: (u) => <StatusBadge status={u.role} size="sm" />,
  },
  {
    key: "organization",
    header: "Organization",
    className: "hidden md:table-cell",
    render: (u) => u.orgName ?? <span className="italic text-xs text-muted-foreground">—</span>,
  },
  {
    key: "connections",
    header: "Connections",
    className: "hidden md:table-cell",
    render: (u) => (
      <span className="text-muted-foreground text-xs">
        {u.role === "TRAINER"
          ? `${u.connectionCount} client${u.connectionCount !== 1 ? "s" : ""}`
          : `${u.connectionCount} trainer${u.connectionCount !== 1 ? "s" : ""}`}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "hidden lg:table-cell",
    render: (u) => (
      <StatusBadge status={u.isActive === false ? "ARCHIVED" : u.onboarded ? "ACTIVE" : "ONBOARDING"} size="sm" />
    ),
  },
  {
    key: "joined",
    header: "Joined",
    align: "right",
    render: (u) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {format(new Date(u.createdAt), "MMM d, yyyy")}
      </span>
    ),
  },
  {
    key: "actions",
    header: "",
    className: "w-10",
    render: (u) => (
      <div className="relative z-10 flex justify-end">
        <UserActionsMenu
          userId={u.id}
          isActive={u.isActive}
          userName={`${u.firstName} ${u.lastName}`}
        />
      </div>
    ),
  },
];

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const role = (params.role as "TRAINER" | "CLIENT" | "ALL") ?? "ALL";
  const page = parseInt(params.page ?? "1", 10);
  const view = params.view === "orgs" ? "orgs" : "all";
  const archivedOnly = params.archived === "1";
  const orgId = params.org && params.org !== "ALL" ? params.org : "";

  const [allUsersData, trainersData, trainersForFilter] = await Promise.all([
    view === "all"
      ? getAllUsers({ page, pageSize: 25, search, role, archivedOnly, orgId: orgId || undefined })
      : Promise.resolve(null),
    view === "orgs" ? getTrainersWithClients() : Promise.resolve(null),
    view === "all" ? getTrainersForOrgFilter() : Promise.resolve([]),
  ]);

  const users = allUsersData?.items ?? [];
  const total = allUsersData?.total ?? 0;
  const totalPages = allUsersData?.totalPages ?? 0;

  const selectedOrgTrainer = orgId
    ? (trainersForFilter ?? []).find((t) => t.clerkOrgId === orgId)
    : undefined;
  const selectedOrgLabel = selectedOrgTrainer
    ? `${selectedOrgTrainer.firstName} ${selectedOrgTrainer.lastName}`
    : "All organizations";

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Users" }]}
        title="Users"
        description="Manage trainers and clients on the platform."
      />

      {/* View tabs */}
      <div className="flex gap-1 rounded-xl border bg-muted/40 p-1 w-fit">
        <a
          href={`?view=all`}
          className={[
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            view === "all"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          All Users
        </a>
        <a
          href={`?view=orgs`}
          className={[
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            view === "orgs"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          By Organization
        </a>
      </div>

      {/* All Users view */}
      {view === "all" && (
        <>
          <PageToolbar
            end={
              <a
                href={archivedOnly ? `?view=all&search=${search}&role=${role}&org=${orgId}` : `?view=all&search=${search}&role=${role}&org=${orgId}&archived=1`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              >
                {archivedOnly ? "Hide archived" : "Show archived"}
              </a>
            }
          >
            <form method="GET" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="view" value="all" />
              <div className="relative min-w-[200px] max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="search"
                  defaultValue={search}
                  placeholder="Search name or email…"
                  className="h-9 pl-9"
                />
              </div>
              <Select name="role" defaultValue={role}>
                <SelectTrigger className="h-9 w-36">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All roles</SelectItem>
                  <SelectItem value="TRAINER">Trainer</SelectItem>
                  <SelectItem value="CLIENT">Client</SelectItem>
                </SelectContent>
              </Select>
              <Select name="org" defaultValue={orgId || "ALL"}>
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="All organizations">
                    {selectedOrgLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All organizations</SelectItem>
                  {(trainersForFilter ?? []).map(t => (
                    <SelectItem key={t.clerkOrgId!} value={t.clerkOrgId!}>
                      {t.firstName} {t.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" variant="outline" className="h-9">
                Filter
              </Button>
            </form>
          </PageToolbar>

          <DataList
            columns={userColumns}
            data={users}
            keyExtractor={(u) => u.id}
            density="compact"
            emptyState={<EmptyState size="compact" icon={Users} title="No users found" />}
          />

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages} · {total.toLocaleString()} users
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <a href={`?view=all&search=${search}&role=${role}&org=${orgId}&page=${page - 1}${archivedOnly ? "&archived=1" : ""}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">
                    ← Prev
                  </a>
                )}
                {page < totalPages && (
                  <a href={`?view=all&search=${search}&role=${role}&org=${orgId}&page=${page + 1}${archivedOnly ? "&archived=1" : ""}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">
                    Next →
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* By Organization view */}
      {view === "orgs" && trainersData && (
        <TrainersWithClientsTable trainers={trainersData} />
      )}
    </PageShell>
  );
}
