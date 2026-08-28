import { getAllPrograms } from "@/lib/services/admin.service";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Library, Search } from "lucide-react";
import Link from "next/link";
import { ProgramActionsMenu } from "@/components/admin/program-actions-menu";

interface PageProps {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}

const statusColors: Record<string, string> = {
  DRAFT:     "border-border bg-muted/60 text-muted-foreground",
  ACTIVE:    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  PAUSED:    "border-amber-500/30 bg-amber-500/10 text-amber-700",
  COMPLETED: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  ARCHIVED:  "border-border bg-muted/40 text-muted-foreground/60",
};

export default async function AdminProgramsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const status = params.status ?? "ALL";
  const page = parseInt(params.page ?? "1", 10);

  const { items: programs, total, totalPages } = await getAllPrograms({ page, pageSize: 25, search, status });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Programs</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{total.toLocaleString()} programs created across the platform.</p>
      </div>

      <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="search" defaultValue={search} placeholder="Search programs…" className="pl-9" />
        </div>
        <Select name="status" defaultValue={status}>
          <SelectTrigger className="w-36">
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
        <button type="submit" className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">
          Filter
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Program</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Trainer</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Client</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden xl:table-cell">Duration</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Created</th>
                <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {programs.map((prog) => (
                <tr key={prog.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/admin/programs/${prog.id}`} className="group block">
                      <p className="font-medium text-foreground group-hover:underline">{prog.name}</p>
                      {prog.description && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{prog.description}</p>
                      )}
                      {prog.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {prog.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                          ))}
                        </div>
                      )}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className={`text-[10px] ${statusColors[prog.status] ?? ""}`}>
                      {prog.status.charAt(0) + prog.status.slice(1).toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    {prog.trainer ? (
                      <>
                        <p className="text-xs font-medium text-foreground">{prog.trainer.firstName} {prog.trainer.lastName}</p>
                        <p className="text-[10px] text-muted-foreground">{prog.trainer.email}</p>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Global</span>
                    )}
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    {prog.client ? (
                      <div>
                        <p className="text-xs font-medium text-foreground">{prog.client.firstName} {prog.client.lastName}</p>
                        <p className="text-[10px] text-muted-foreground">{prog.client.email}</p>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Template
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 hidden xl:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {prog.durationWeeks ? `${prog.durationWeeks}w` : "—"}{prog.daysPerWeek ? ` · ${prog.daysPerWeek}d/wk` : ""}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {format(new Date(prog.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end">
                      {prog.trainer && (
                        <ProgramActionsMenu programId={prog.id} programName={prog.name} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {programs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <Library className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No programs found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} programs</p>
            <div className="flex gap-2">
              {page > 1 && (
                <a href={`?search=${search}&status=${status}&page=${page - 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">← Prev</a>
              )}
              {page < totalPages && (
                <a href={`?search=${search}&status=${status}&page=${page + 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">Next →</a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
