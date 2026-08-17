"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  MoreVertical,
  Copy,
  UserPlus,
  Archive,
  Trash2,
  Sparkles,
  Library,
  Pencil,
  Users,
  Dumbbell,
  Upload,
  Globe,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import {
  duplicateProgramAction,
  deleteProgramAction,
  hardDeleteProgramAction,
  copyGlobalProgramAction,
  toggleProgramPublicAction,
} from "@/actions/program-actions";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ProgramListItem {
  id: string;
  name: string;
  status: string;
  isTemplate: boolean;
  isGlobal: boolean;
  isPublic: boolean;
  sourceTemplateId?: string | null;
  tags: string[];
  updatedAt: Date;
  createdAt: Date;
  clientId?: string | null;
  trainer: { id: string; firstName: string; lastName: string } | null;
  client: { id: string; firstName: string; lastName: string } | null;
  workouts: { id: string; name: string }[];
  _count: { workouts: number };
}

interface GlobalProgramItem {
  id: string;
  name: string;
  description?: string | null;
  tags: string[];
  globalUpdatedAt?: Date | null;
  isGlobal: boolean;
  trainer: { id: string; firstName: string; lastName: string } | null;
  workouts: { id: string; name: string }[];
  _count: { workouts: number };
}

function findMatchedWorkoutId(
  program: { workouts: { id: string; name: string }[] },
  search: string
): string | null {
  if (!search) return null;
  const query = search.toLowerCase();
  const match = program.workouts.find((w) => w.name.toLowerCase().includes(query));
  return match?.id ?? null;
}

function matchesSearch(
  program: { name: string; workouts: { id: string; name: string }[] },
  search: string
) {
  return (
    program.name.toLowerCase().includes(search.toLowerCase()) ||
    findMatchedWorkoutId(program, search) !== null
  );
}

// "all" means "everything except archived" — archived programs only show up
// once the trainer explicitly filters for them.
function matchesStatusFilter(status: string, statusFilter: string): boolean {
  if (statusFilter === "all") return status !== "ARCHIVED";
  return status === statusFilter;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  ACTIVE:    { label: "Active",    className: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  DRAFT:     { label: "Draft",     className: "bg-muted text-muted-foreground border-border" },
  PAUSED:    { label: "Paused",    className: "bg-amber-500/10 text-amber-700 border-amber-200" },
  COMPLETED: { label: "Completed", className: "bg-muted text-muted-foreground border-border" },
  ARCHIVED:  { label: "Archived",  className: "bg-muted text-muted-foreground border-border opacity-70" },
};

function ProgramCard({
  program,
  role,
  updatableSet,
  onDuplicate,
  onArchive,
  onRequestHardDelete,
  onTogglePublic,
  togglingPublicId,
  typeBadge,
  search,
}: {
  program: ProgramListItem;
  role?: string;
  updatableSet: Set<string>;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRequestHardDelete: (id: string, name: string) => void;
  onTogglePublic: (id: string, isPublic: boolean) => void;
  togglingPublicId: string | null;
  typeBadge?: "clinical";
  search?: string;
}) {
  const router = useRouter();
  const status = statusConfig[program.status] ?? { label: program.status, className: "bg-muted text-muted-foreground border-border" };
  const matchedWorkoutId = search ? findMatchedWorkoutId(program, search) : null;
  const detailHref = matchedWorkoutId
    ? `/programs/${program.id}?workoutId=${matchedWorkoutId}`
    : `/programs/${program.id}`;
  return (
    <Card className="group flex flex-col border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-border">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <Link href={detailHref} className="flex-1 min-w-0">
            <h3 className="truncate text-base font-semibold leading-tight transition-colors group-hover:text-primary">
              {program.name}
            </h3>
          </Link>
          {role === "TRAINER" && (
            <DropdownMenu>
              <DropdownMenuTrigger className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100">
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => router.push(`/programs/${program.id}/edit`)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(program.id)}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                {!program.clientId && (
                  <DropdownMenuItem onClick={() => router.push(`/programs/${program.id}?assign=true`)}>
                    <UserPlus className="mr-2 h-4 w-4" /> Assign Client
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {program.status === "ARCHIVED" ? (
                  <DropdownMenuItem
                    onClick={() => onRequestHardDelete(program.id, program.name)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Permanently
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => onArchive(program.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Archive className="mr-2 h-4 w-4" /> Archive
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge className={`border text-[11px] font-medium ${status.className}`}>
            {status.label}
          </Badge>
          {typeBadge === "clinical" && (
            <Badge variant="outline" className="text-[11px] font-medium">
              Clinical
            </Badge>
          )}
          {program.isTemplate && !typeBadge && (
            <Badge variant="outline" className="text-[11px] font-medium">
              Template
            </Badge>
          )}
          {updatableSet.has(program.id) && (
            <Badge variant="outline" className="text-[11px] font-medium">
              Update available
            </Badge>
          )}
          {role === "TRAINER" && program.isTemplate && !program.clientId && (
            <button
              type="button"
              disabled={togglingPublicId === program.id}
              onClick={() => onTogglePublic(program.id, !program.isPublic)}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-60",
                program.isPublic
                  ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                  : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              {program.isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {program.isPublic ? "Public" : "Private"}
            </button>
          )}
        </div>

        <div className="mt-4 flex-1 space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {program.client
                ? `${program.client.firstName} ${program.client.lastName}`
                : "Unassigned"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Dumbbell className="h-3.5 w-3.5 shrink-0" />
            <span>
              {program._count.workouts} workout{program._count.workouts !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground/60">
              Updated {formatDistanceToNow(new Date(program.updatedAt), { addSuffix: true })}
            </p>
            <Link
              href={detailHref}
              className="text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100"
            >
              {matchedWorkoutId ? "View workout →" : "View →"}
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GlobalProgramCard({
  program,
  copying,
  onCopy,
}: {
  program: GlobalProgramItem;
  copying: string | null;
  onCopy: (id: string, name: string) => void;
}) {
  return (
    <Card className="group flex flex-col border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-border">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-2">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-tight">{program.name}</h3>
            {program.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{program.description}</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[11px] font-medium">
            {program.isGlobal ? "Global" : "Community"}
          </Badge>
          {!program.isGlobal && program.trainer && (
            <span className="text-[11px] text-muted-foreground">
              by {program.trainer.firstName} {program.trainer.lastName}
            </span>
          )}
          {program.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
          ))}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {program._count.workouts} workout{program._count.workouts !== 1 ? "s" : ""}
        </p>

        <div className="mt-4 border-t border-border/60 pt-3">
          <Button
            size="sm"
            className="w-full"
            disabled={copying === program.id}
            onClick={() => onCopy(program.id, program.name)}
          >
            {copying === program.id ? "Copying…" : "Copy to My Library"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProgramListClient({
  programs,
  globalPrograms = [],
  updatableIds = [],
  role,
}: {
  programs: ProgramListItem[];
  globalPrograms?: GlobalProgramItem[];
  updatableIds?: string[];
  role?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const updatableSet = new Set(updatableIds);
  const [copying, setCopying] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "clinical" | "global">("all");
  const [pendingHardDelete, setPendingHardDelete] = useState<{ id: string; name: string } | null>(null);
  const [hardDeleting, setHardDeleting] = useState(false);
  const [togglingPublicId, setTogglingPublicId] = useState<string | null>(null);

  const activeTab =
    role === "TRAINER"
      ? searchParams.get("tab") === "programs"
        ? "programs"
        : "templates"
      : "programs";

  function handleTabChange(nextTab: string) {
    setTypeFilter("all");
    setSearch("");
    setStatusFilter("all");
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "templates") {
      params.delete("tab");
    } else {
      params.set("tab", nextTab);
    }
    const nextQuery = params.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }

  // Programs tab: non-template programs
  const filteredPrograms = programs.filter((p) => {
    if (search && !matchesSearch(p, search)) return false;
    if (!matchesStatusFilter(p.status, statusFilter)) return false;
    return true;
  });

  // Templates tab — clinical subset
  const filteredClinical =
    activeTab === "templates" && typeFilter !== "global"
      ? programs.filter((p) => {
          if (search && !matchesSearch(p, search)) return false;
          if (!matchesStatusFilter(p.status, statusFilter)) return false;
          return true;
        })
      : [];

  // Templates tab — global subset
  const filteredGlobal =
    activeTab === "templates" && typeFilter !== "clinical"
      ? globalPrograms.filter((p) => {
          if (search && !matchesSearch(p, search)) return false;
          return true;
        })
      : [];

  async function handleDuplicate(id: string) {
    const result = await duplicateProgramAction(id);
    if (result.success) {
      toast.success("Program duplicated");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleArchive(id: string) {
    const result = await deleteProgramAction(id);
    if (result.success) {
      toast.success("Program archived");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleConfirmHardDelete() {
    if (!pendingHardDelete) return;
    setHardDeleting(true);
    try {
      const result = await hardDeleteProgramAction(pendingHardDelete.id);
      if (result.success) {
        toast.success("Program permanently deleted");
        setPendingHardDelete(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setHardDeleting(false);
    }
  }

  async function handleTogglePublic(id: string, isPublic: boolean) {
    setTogglingPublicId(id);
    try {
      const result = await toggleProgramPublicAction(id, isPublic);
      if (result.success) {
        toast.success(isPublic ? "Program is now public" : "Program is now private");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setTogglingPublicId(null);
    }
  }

  async function handleCopyGlobal(globalProgramId: string, name: string) {
    setCopying(globalProgramId);
    try {
      const result = await copyGlobalProgramAction(globalProgramId);
      if (result.success) {
        toast.success(`"${name}" copied to your library`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setCopying(null);
    }
  }

  return (
    <div className="space-y-6">
      {role === "TRAINER" && (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="programs">Assigned</TabsTrigger>
            <TabsTrigger value="templates">Library</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {/* Type filter — only shown in Templates tab */}
      {activeTab === "templates" && role === "TRAINER" && (
        <div className="flex items-center gap-2">
          {(["all", "clinical", "global"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                typeFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              ].join(" ")}
            >
              {f === "all" ? "All" : f === "clinical" ? "Clinical" : "Global"}
            </button>
          ))}
        </div>
      )}
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={activeTab === "templates" ? "Search library or workouts..." : "Search assigned programs or workouts..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {(activeTab !== "templates" || typeFilter !== "global") && (
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status">
                  {(value: string | null) =>
                    !value || value === "all" ? "All Status" : statusConfig[value]?.label ?? value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PAUSED">Paused</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {role === "TRAINER" && (
          <div className="flex flex-wrap shrink-0 items-center gap-2">
            <Button variant="outline" className="gap-2" asChild>
              <Link href="/programs/upload">
                <Upload className="h-4 w-4 text-emerald-600" />
                Upload Brief
              </Link>
            </Button>
            <Button variant="outline" className="gap-2" asChild>
              <Link href="/programs/generate">
                <Sparkles className="h-4 w-4 text-blue-600" />
                AI Generate
              </Link>
            </Button>
            <Button className="gap-2" asChild>
              <Link href="/programs/new">
                <Plus className="h-4 w-4" />
                New Program
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Programs tab grid */}
      {activeTab === "programs" && (
        filteredPrograms.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <Library className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <h3 className="mt-4 font-semibold">No assigned programs</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {role === "TRAINER"
                ? "Assign a program from your Library to a client to see it here."
                : "No programs have been assigned to you yet."}
            </p>
            {role === "TRAINER" && (
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/programs/generate">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                    Generate with AI
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/programs/new">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New Program
                  </Link>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredPrograms.map((program) => (
              <ProgramCard
                key={program.id}
                program={program}
                role={role}
                updatableSet={updatableSet}
                onDuplicate={handleDuplicate}
                onArchive={handleArchive}
                onRequestHardDelete={(id, name) => setPendingHardDelete({ id, name })}
                onTogglePublic={handleTogglePublic}
                togglingPublicId={togglingPublicId}
                search={search}
              />
            ))}
          </div>
        )
      )}

      {/* Templates tab grid — merged clinical + global */}
      {activeTab === "templates" && (
        filteredClinical.length === 0 && filteredGlobal.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <Library className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <h3 className="mt-4 font-semibold">
              {typeFilter === "global"
                ? "No global templates"
                : typeFilter === "clinical"
                ? "Your library is empty"
                : "Your library is empty"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {typeFilter === "global"
                ? "Your administrator hasn't added any global programs yet."
                : "Build a program here, then assign it to a client when it's ready."}
            </p>
            {typeFilter !== "global" && role === "TRAINER" && (
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/programs/generate">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                    Generate with AI
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/programs/new">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New Program
                  </Link>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredClinical.map((program) => (
              <ProgramCard
                key={program.id}
                program={program}
                role={role}
                updatableSet={updatableSet}
                onDuplicate={handleDuplicate}
                onArchive={handleArchive}
                onRequestHardDelete={(id, name) => setPendingHardDelete({ id, name })}
                onTogglePublic={handleTogglePublic}
                togglingPublicId={togglingPublicId}
                typeBadge="clinical"
                search={search}
              />
            ))}
            {filteredGlobal.map((prog) => (
              <GlobalProgramCard
                key={prog.id}
                program={prog}
                copying={copying}
                onCopy={handleCopyGlobal}
              />
            ))}
          </div>
        )
      )}

      <Dialog open={!!pendingHardDelete} onOpenChange={(open) => !open && setPendingHardDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{pendingHardDelete?.name}" permanently?</DialogTitle>
            <DialogDescription>
              This permanently deletes the program and all of its workouts, scheduled
              and completed sessions, feedback, and voice memos. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingHardDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmHardDelete} disabled={hardDeleting}>
              {hardDeleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
