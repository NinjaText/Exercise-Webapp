"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Dumbbell,
  Upload,
  Globe,
  Lock,
  Eye,
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

function WorkoutCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Dumbbell className="h-3.5 w-3.5 shrink-0" />
      {count}
    </span>
  );
}

function UpdatedAt({ date }: { date: Date }) {
  return (
    <span className="text-muted-foreground">
      {formatDistanceToNow(new Date(date), { addSuffix: true })}
    </span>
  );
}

function ProgramRow({
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
  personColumn,
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
  /** Which related person to show — trainers see the assigned client, clients see their trainer. */
  personColumn: "client" | "trainer";
}) {
  const router = useRouter();
  const status = statusConfig[program.status] ?? { label: program.status, className: "bg-muted text-muted-foreground border-border" };
  const matchedWorkoutId = search ? findMatchedWorkoutId(program, search) : null;
  const detailHref = matchedWorkoutId
    ? `/programs/${program.id}?workoutId=${matchedWorkoutId}`
    : `/programs/${program.id}`;
  const person = personColumn === "client" ? program.client : program.trainer;

  return (
    <TableRow className="group">
      <TableCell className="max-w-64">
        <Link href={detailHref} className="font-medium hover:text-primary hover:underline truncate block">
          {program.name}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {person ? `${person.firstName} ${person.lastName}` : personColumn === "client" ? "Unassigned" : "—"}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
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
      </TableCell>
      <TableCell>
        <WorkoutCount count={program._count.workouts} />
      </TableCell>
      <TableCell>
        <UpdatedAt date={program.updatedAt} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={detailHref}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
            title={matchedWorkoutId ? "View workout" : "View program"}
          >
            <Eye className="h-4 w-4" />
          </Link>
          {role === "TRAINER" && (
            <DropdownMenu>
              <DropdownMenuTrigger className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-muted">
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
      </TableCell>
    </TableRow>
  );
}

function GlobalProgramRow({
  program,
  copying,
  onCopy,
}: {
  program: GlobalProgramItem;
  copying: string | null;
  onCopy: (id: string, name: string) => void;
}) {
  return (
    <TableRow className="group">
      <TableCell className="max-w-64">
        <div className="flex items-start gap-2">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
          <div className="min-w-0">
            <p className="font-medium truncate">{program.name}</p>
            {program.description && (
              <p className="truncate text-xs text-muted-foreground">{program.description}</p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">—</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[11px] font-medium">
            {program.isGlobal ? "Global" : "Community"}
          </Badge>
          {!program.isGlobal && program.trainer && (
            <span className="text-[11px] text-muted-foreground">
              by {program.trainer.firstName} {program.trainer.lastName}
            </span>
          )}
          {program.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <WorkoutCount count={program._count.workouts} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {program.globalUpdatedAt ? formatDistanceToNow(new Date(program.globalUpdatedAt), { addSuffix: true }) : "—"}
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant="outline"
          disabled={copying === program.id}
          onClick={() => onCopy(program.id, program.name)}
        >
          {copying === program.id ? "Copying…" : "Copy to My Library"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ProgramsEmptyState({ title, description, showCreateActions }: { title: string; description: string; showCreateActions: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <Library className="mx-auto h-12 w-12 text-muted-foreground/40" />
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {showCreateActions && (
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

  const personColumn: "client" | "trainer" = role === "TRAINER" ? "client" : "trainer";

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
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button className="gap-2" />}>
                <Plus className="h-4 w-4" />
                Create Program
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => router.push("/programs/new")}>
                  <Pencil className="mr-2 h-4 w-4 text-muted-foreground" />
                  Start from scratch
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/programs/generate")}>
                  <Sparkles className="mr-2 h-4 w-4 text-blue-600" />
                  Generate with AI
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/programs/upload")}>
                  <Upload className="mr-2 h-4 w-4 text-emerald-600" />
                  Upload a program/document
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleTabChange("templates")}>
                  <Library className="mr-2 h-4 w-4 text-muted-foreground" />
                  Use a template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Programs tab table */}
      {activeTab === "programs" && (
        filteredPrograms.length === 0 ? (
          <ProgramsEmptyState
            title="No assigned programs"
            description={
              role === "TRAINER"
                ? "Assign a program from your Library to a client to see it here."
                : "No programs have been assigned to you yet."
            }
            showCreateActions={role === "TRAINER"}
          />
        ) : (
          <div className="rounded-xl border border-border/50 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>{personColumn === "client" ? "Client" : "Trainer"}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Workouts</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPrograms.map((program) => (
                  <ProgramRow
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
                    personColumn={personColumn}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* Templates tab table — merged clinical + global */}
      {activeTab === "templates" && (
        filteredClinical.length === 0 && filteredGlobal.length === 0 ? (
          <ProgramsEmptyState
            title={
              typeFilter === "global"
                ? "No global templates"
                : "Your library is empty"
            }
            description={
              typeFilter === "global"
                ? "Your administrator hasn't added any global programs yet."
                : "Build a program here, then assign it to a client when it's ready."
            }
            showCreateActions={typeFilter !== "global" && role === "TRAINER"}
          />
        ) : (
          <div className="rounded-xl border border-border/50 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Workouts</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClinical.map((program) => (
                  <ProgramRow
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
                    personColumn="client"
                  />
                ))}
                {filteredGlobal.map((prog) => (
                  <GlobalProgramRow
                    key={prog.id}
                    program={prog}
                    copying={copying}
                    onCopy={handleCopyGlobal}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      <Dialog open={!!pendingHardDelete} onOpenChange={(open) => !open && setPendingHardDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{pendingHardDelete?.name}&quot; permanently?</DialogTitle>
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
