import { getAllPrograms } from "@/lib/services/admin.service";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Library, Search } from "lucide-react";
import { ProgramActionsMenu } from "@/components/admin/program-actions-menu";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { PageToolbar } from "@/components/shared/page-toolbar";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

interface PageProps {
  searchParams: Promise<{ search?: string; status?: string; visibility?: string; page?: string }>;
}

type ProgramRow = Awaited<ReturnType<typeof getAllPrograms>>["items"][number];

const columns: Column<ProgramRow>[] = [
  {
    key: "program",
    header: "Program",
    render: (prog) => (
      <div>
        <p className="font-medium text-foreground">{prog.name}</p>
        {prog.description && (
          <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{prog.description}</p>
        )}
        {(prog.isPublic || prog.tags.length > 0) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {prog.isPublic && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Universal
              </span>
            )}
            {prog.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (prog) => <StatusBadge status={prog.status} size="sm" />,
  },
  {
    key: "trainer",
    header: "Trainer",
    className: "hidden md:table-cell",
    render: (prog) =>
      prog.trainer ? (
        <>
          <p className="text-xs font-medium text-foreground">{prog.trainer.firstName} {prog.trainer.lastName}</p>
          <p className="text-[10px] text-muted-foreground">{prog.trainer.email}</p>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">Global</span>
      ),
  },
  {
    key: "client",
    header: "Client",
    className: "hidden lg:table-cell",
    render: (prog) =>
      prog.client ? (
        <div>
          <p className="text-xs font-medium text-foreground">{prog.client.firstName} {prog.client.lastName}</p>
          <p className="text-[10px] text-muted-foreground">{prog.client.email}</p>
        </div>
      ) : (
        <StatusBadge status="TEMPLATE" dot={false} size="sm" />
      ),
  },
  {
    key: "duration",
    header: "Duration",
    className: "hidden xl:table-cell",
    render: (prog) => (
      <span className="text-xs text-muted-foreground">
        {prog.durationWeeks ? `${prog.durationWeeks}w` : "—"}
        {prog.daysPerWeek ? ` · ${prog.daysPerWeek}d/wk` : ""}
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
    render: (prog) =>
      prog.trainer ? (
        <div className="relative z-10 flex justify-end">
          <ProgramActionsMenu programId={prog.id} programName={prog.name} isPublic={prog.isPublic} />
        </div>
      ) : null,
  },
];

export default async function AdminProgramsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const status = params.status ?? "ALL";
  const visibility = params.visibility ?? "ALL";
  const page = parseInt(params.page ?? "1", 10);

  const { items: programs, total, totalPages } = await getAllPrograms({ page, pageSize: 25, search, status, visibility });

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Programs" }]}
        title="Programs"
        description={`${total.toLocaleString()} programs created across the platform.`}
      />

      <PageToolbar>
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="search" defaultValue={search} placeholder="Search programs…" className="h-9 w-64 pl-9" />
          </div>
          <Select name="status" defaultValue={status}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select name="visibility" defaultValue={visibility}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="All programs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All programs</SelectItem>
              <SelectItem value="UNIVERSAL">Universal only</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline" className="h-9">
            Filter
          </Button>
        </form>
      </PageToolbar>

      <DataList
        columns={columns}
        data={programs}
        keyExtractor={(prog) => prog.id}
        rowHref={(prog) => `/admin/programs/${prog.id}`}
        emptyState={<EmptyState size="compact" icon={Library} title="No programs found." />}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} programs</p>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`?search=${search}&status=${status}&visibility=${visibility}&page=${page - 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">← Prev</a>
            )}
            {page < totalPages && (
              <a href={`?search=${search}&status=${status}&visibility=${visibility}&page=${page + 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">Next →</a>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
