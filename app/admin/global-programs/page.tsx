import { requireSuperAdmin } from "@/lib/current-user";
import { getAdminGlobalPrograms, listClerkOrganizations } from "@/lib/services/admin.service";
import { format } from "date-fns";
import { Globe, Plus, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GlobalProgramActions } from "./global-program-actions";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { PageToolbar } from "@/components/shared/page-toolbar";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

interface PageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

type GlobalProgramRow = Awaited<ReturnType<typeof getAdminGlobalPrograms>>["items"][number];
type Clinic = Awaited<ReturnType<typeof listClerkOrganizations>>;

function buildColumns(clinics: Clinic): Column<GlobalProgramRow>[] {
  return [
    {
      key: "program",
      header: "Program",
      render: (prog) => (
        <div>
          <p className="font-medium text-foreground">{prog.name}</p>
          {prog.description && (
            <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{prog.description}</p>
          )}
          {prog.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {prog.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "visibility",
      header: "Visibility",
      render: (prog) => (
        <StatusBadge
          status={prog.organizationIds.length === 0 ? "PUBLIC" : "PRIVATE"}
          dot={false}
          size="sm"
        />
      ),
    },
    {
      key: "workouts",
      header: "Workouts",
      align: "right",
      className: "hidden md:table-cell",
      render: (prog) => <span className="text-xs text-muted-foreground">{prog._count.workouts}</span>,
    },
    {
      key: "lastPushed",
      header: "Last Pushed",
      className: "hidden lg:table-cell",
      render: (prog) => (
        <span className="text-xs text-muted-foreground">
          {prog.globalUpdatedAt ? format(new Date(prog.globalUpdatedAt), "MMM d, yyyy") : "—"}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      render: (prog) => (
        <span className="text-xs text-muted-foreground">{format(new Date(prog.createdAt), "MMM d, yyyy")}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (prog) => (
        <div className="relative z-10 flex justify-end">
          <GlobalProgramActions
            programId={prog.id}
            programName={prog.name}
            clinics={clinics}
            currentOrganizationIds={prog.organizationIds}
          />
        </div>
      ),
    },
  ];
}

export default async function AdminGlobalProgramsPage({ searchParams }: PageProps) {
  await requireSuperAdmin();
  const params = await searchParams;
  const search = params.search ?? "";
  const page = parseInt(params.page ?? "1", 10);

  const [{ items: programs, total, totalPages }, clinics] = await Promise.all([
    getAdminGlobalPrograms({ page, pageSize: 25, search }),
    listClerkOrganizations(),
  ]);

  const columns = buildColumns(clinics);

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Global Programs" }]}
        title="Global Programs"
        description={`${total.toLocaleString()} master program${total !== 1 ? "s" : ""} available to all organizations.`}
        primaryAction={
          <Button asChild>
            <Link href="/admin/global-programs/new">
              <Plus className="h-4 w-4" />
              New Program
            </Link>
          </Button>
        }
        secondaryActions={
          <Button asChild variant="outline">
            <Link href="/admin/global-programs/generate">
              <Sparkles className="h-4 w-4" />
              Generate with AI
            </Link>
          </Button>
        }
      />

      <PageToolbar>
        <form method="GET" className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="search" defaultValue={search} placeholder="Search global programs…" className="h-9 w-64 pl-9" />
          </div>
          <Button type="submit" variant="outline" className="h-9">
            Search
          </Button>
        </form>
      </PageToolbar>

      <DataList
        columns={columns}
        data={programs}
        keyExtractor={(prog) => prog.id}
        rowHref={(prog) => `/admin/global-programs/${prog.id}/edit`}
        emptyState={
          <EmptyState
            size="compact"
            icon={Globe}
            title="No global programs yet."
            actionLabel="Create the first one"
            actionHref="/admin/global-programs/new"
          />
        }
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} programs</p>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`?search=${search}&page=${page - 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">← Prev</a>
            )}
            {page < totalPages && (
              <a href={`?search=${search}&page=${page + 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">Next →</a>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
