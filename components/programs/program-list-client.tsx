"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateProgramMenu } from "@/components/programs/create-program-menu";
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
  Globe,
  Lock,
  Eye,
  ChevronDown,
  X,
  Users,
  Star,
  FolderPlus,
  Folder,
  ArrowLeft,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  duplicateProgramAction,
  deleteProgramAction,
  hardDeleteProgramAction,
  copyGlobalProgramAction,
  toggleProgramPublicAction,
  toggleProgramFavoriteAction,
  setProgramCollectionsAction,
} from "@/actions/program-actions";
import { createCollectionAction } from "@/actions/collection-actions";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
  isFavorite?: boolean;
  collectionIds?: string[];
  bodyAreas?: string[];
  goals?: string[];
  activities?: string[];
}

interface CollectionItem {
  id: string;
  name: string;
  programCount: number;
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

function clientLabel(client: { firstName: string; lastName: string }): string {
  const name = `${client.firstName} ${client.lastName}`.trim();
  return name || "Unnamed client";
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
  onToggleFavorite,
  togglingFavoriteId,
  onAddToCollection,
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
  onToggleFavorite?: (id: string, next: boolean) => void;
  togglingFavoriteId?: string | null;
  onAddToCollection?: (program: ProgramListItem) => void;
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
        {person ? clientLabel(person) : personColumn === "client" ? "Unassigned" : "—"}
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
          {onToggleFavorite && (
            <button
              type="button"
              disabled={togglingFavoriteId === program.id}
              onClick={() => onToggleFavorite(program.id, !program.isFavorite)}
              title={program.isFavorite ? "Remove from favorites" : "Add to favorites"}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md transition-opacity hover:bg-muted disabled:opacity-60",
                program.isFavorite
                  ? "text-amber-500 opacity-100"
                  : "text-muted-foreground opacity-0 group-hover:opacity-100"
              )}
            >
              <Star className={cn("h-4 w-4", program.isFavorite && "fill-current")} />
            </button>
          )}
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
                {onAddToCollection && !program.clientId && (
                  <DropdownMenuItem onClick={() => onAddToCollection(program)}>
                    <Folder className="mr-2 h-4 w-4" /> Add to Collection
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

function CollectionCard({ collection, onClick }: { collection: CollectionItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-border/50 p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Folder className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{collection.name}</p>
        <p className="text-xs text-muted-foreground">
          {collection.programCount} program{collection.programCount === 1 ? "" : "s"}
        </p>
      </div>
    </button>
  );
}

function CreateCollectionCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-left text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <FolderPlus className="h-4.5 w-4.5" />
      </div>
      <p className="text-sm font-medium">Create Collection</p>
    </button>
  );
}

function RecentlyUsedPrograms({ programs }: { programs: ProgramListItem[] }) {
  const recent = useMemo(
    () => [...programs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 8),
    [programs]
  );
  if (recent.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Recently Used
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {recent.map((p) => (
          <Link
            key={p.id}
            href={`/programs/${p.id}`}
            className="shrink-0 rounded-lg border border-border/50 px-3.5 py-2.5 text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <p className="max-w-40 truncate font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              <UpdatedAt date={p.updatedAt} />
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ProgramListClient({
  programs,
  globalPrograms = [],
  updatableIds = [],
  collections = [],
  role,
}: {
  programs: ProgramListItem[];
  globalPrograms?: GlobalProgramItem[];
  updatableIds?: string[];
  collections?: CollectionItem[];
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
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<Set<string>>(new Set());

  // Library-tab-only: quick state filter chips, and the Collection drill-down.
  const [chipFilter, setChipFilter] = useState<"all" | "recent" | "favorites" | "templates" | "archived">("all");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [collectionTagFilter, setCollectionTagFilter] = useState<Set<string>>(new Set());
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [memberSelection, setMemberSelection] = useState<Set<string>>(new Set());
  const [savingMembers, setSavingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  // Row-level "Add to Collection" — the inverse of the above: pick a program
  // first (from its row menu), then choose which collections it belongs to.
  const [addToCollectionsProgram, setAddToCollectionsProgram] = useState<ProgramListItem | null>(null);
  const [addToCollectionsSelection, setAddToCollectionsSelection] = useState<Set<string>>(new Set());
  const [savingProgramCollections, setSavingProgramCollections] = useState(false);
  const [extraCollections, setExtraCollections] = useState<CollectionItem[]>([]);
  const [inlineCollectionName, setInlineCollectionName] = useState("");
  const [creatingInlineCollection, setCreatingInlineCollection] = useState(false);

  // collections prop plus any created inline this session that the prop
  // hasn't caught up to yet (router.refresh() is async).
  const allCollections = useMemo(() => {
    const known = new Set(collections.map((c) => c.id));
    return [...collections, ...extraCollections.filter((c) => !known.has(c.id))];
  }, [collections, extraCollections]);

  const activeTab =
    role === "TRAINER"
      ? searchParams.get("tab") === "programs"
        ? "programs"
        : "templates"
      : "programs";

  // Clients with at least one assigned program — powers the Assigned tab's client filter.
  const assignedClients = useMemo(() => {
    const byId = new Map<string, { id: string; firstName: string; lastName: string }>();
    for (const p of programs) {
      if (p.client) byId.set(p.client.id, p.client);
    }
    return Array.from(byId.values()).sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
  }, [programs]);

  function toggleClientFilter(clientId: string) {
    setClientFilter((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  const hasActiveFilters =
    search !== "" ||
    statusFilter !== "all" ||
    clientFilter.size > 0 ||
    (activeTab === "templates" && typeFilter !== "all") ||
    (activeTab === "templates" && chipFilter !== "all") ||
    !!selectedCollectionId;

  function handleClearFilters() {
    setSearch("");
    setStatusFilter("all");
    setClientFilter(new Set());
    setTypeFilter("all");
    setChipFilter("all");
    setSelectedCollectionId(null);
    setCollectionTagFilter(new Set());
  }

  function handleTabChange(nextTab: string) {
    setTypeFilter("all");
    setSearch("");
    setStatusFilter("all");
    setClientFilter(new Set());
    setChipFilter("all");
    setSelectedCollectionId(null);
    setCollectionTagFilter(new Set());
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
    if (clientFilter.size > 0 && (!p.client || !clientFilter.has(p.client.id))) return false;
    return true;
  });

  function matchesChip(p: ProgramListItem): boolean {
    if (chipFilter === "archived") return p.status === "ARCHIVED";
    if (p.status === "ARCHIVED") return false;
    switch (chipFilter) {
      case "recent":
        return Date.now() - new Date(p.updatedAt).getTime() < RECENT_WINDOW_MS;
      case "favorites":
        return !!p.isFavorite;
      case "templates":
        return p.isTemplate;
      default:
        return true;
    }
  }

  function matchesCollectionTags(p: ProgramListItem): boolean {
    if (collectionTagFilter.size === 0) return true;
    const facets = [...p.tags, ...(p.bodyAreas ?? []), ...(p.goals ?? []), ...(p.activities ?? [])];
    return facets.some((t) => collectionTagFilter.has(t));
  }

  // Programs shown inside the selected collection (for the tag-filter facet list).
  const collectionPrograms = selectedCollectionId
    ? programs.filter((p) => (p.collectionIds ?? []).includes(selectedCollectionId))
    : [];
  const collectionTagOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of collectionPrograms) {
      for (const t of [...p.tags, ...(p.bodyAreas ?? []), ...(p.goals ?? []), ...(p.activities ?? [])]) set.add(t);
    }
    return Array.from(set).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollectionId, programs]);

  // Templates tab — clinical subset
  const filteredClinical =
    activeTab === "templates" && typeFilter !== "global"
      ? programs.filter((p) => {
          if (search && !matchesSearch(p, search)) return false;
          if (chipFilter === "all" && !matchesStatusFilter(p.status, statusFilter)) return false;
          if (!matchesChip(p)) return false;
          if (selectedCollectionId && !(p.collectionIds ?? []).includes(selectedCollectionId)) return false;
          if (selectedCollectionId && !matchesCollectionTags(p)) return false;
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

  async function handleToggleFavorite(id: string, next: boolean) {
    setTogglingFavoriteId(id);
    try {
      const result = await toggleProgramFavoriteAction(id, next);
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setTogglingFavoriteId(null);
    }
  }

  async function handleCreateCollection() {
    setCreatingCollection(true);
    try {
      const result = await createCollectionAction(newCollectionName);
      if (result.success) {
        toast.success(`Collection "${result.data.name}" created`);
        setCreateCollectionOpen(false);
        setNewCollectionName("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setCreatingCollection(false);
    }
  }

  function openManageMembers() {
    if (!selectedCollectionId) return;
    setMemberSelection(new Set(collectionPrograms.map((p) => p.id)));
    setMemberSearch("");
    setManageMembersOpen(true);
  }

  async function handleSaveMembers() {
    if (!selectedCollectionId) return;
    setSavingMembers(true);
    try {
      const changed = programs.filter((p) => {
        const wasIn = (p.collectionIds ?? []).includes(selectedCollectionId);
        const isIn = memberSelection.has(p.id);
        return wasIn !== isIn;
      });
      const results = await Promise.all(
        changed.map((p) => {
          const current = p.collectionIds ?? [];
          const next = memberSelection.has(p.id)
            ? [...current, selectedCollectionId]
            : current.filter((id) => id !== selectedCollectionId);
          return setProgramCollectionsAction(p.id, next);
        })
      );
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        toast.error(`Failed to update ${failed.length} program${failed.length === 1 ? "" : "s"}`);
      } else if (changed.length > 0) {
        toast.success(`Collection updated`);
      }
      setManageMembersOpen(false);
      router.refresh();
    } finally {
      setSavingMembers(false);
    }
  }

  function openAddToCollections(program: ProgramListItem) {
    setAddToCollectionsProgram(program);
    setAddToCollectionsSelection(new Set(program.collectionIds ?? []));
    setInlineCollectionName("");
  }

  async function handleSaveProgramCollections() {
    if (!addToCollectionsProgram) return;
    setSavingProgramCollections(true);
    try {
      const result = await setProgramCollectionsAction(
        addToCollectionsProgram.id,
        Array.from(addToCollectionsSelection)
      );
      if (result.success) {
        toast.success(`Updated collections for "${addToCollectionsProgram.name}"`);
        setAddToCollectionsProgram(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSavingProgramCollections(false);
    }
  }

  async function handleCreateInlineCollection() {
    const name = inlineCollectionName.trim();
    if (!name) return;
    setCreatingInlineCollection(true);
    try {
      const result = await createCollectionAction(name);
      if (result.success) {
        setExtraCollections((prev) => [...prev, { id: result.data.id, name: result.data.name, programCount: 0 }]);
        setAddToCollectionsSelection((prev) => new Set(prev).add(result.data.id));
        setInlineCollectionName("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setCreatingInlineCollection(false);
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

      {/* Quick filter chips, Collections grid, Recently Used — Library tab, my own programs only */}
      {activeTab === "templates" && role === "TRAINER" && typeFilter !== "global" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "recent", "favorites", "templates", "archived"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setChipFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  chipFilter === f
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {f === "all" ? "All" : f === "recent" ? "Recent" : f === "favorites" ? "Favorites" : f === "templates" ? "Templates" : "Archived"}
              </button>
            ))}
          </div>

          {selectedCollectionId ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 -ml-2 text-muted-foreground"
                    onClick={() => {
                      setSelectedCollectionId(null);
                      setCollectionTagFilter(new Set());
                    }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    All Collections
                  </Button>
                  <h3 className="font-semibold text-sm">
                    {collections.find((c) => c.id === selectedCollectionId)?.name}
                  </h3>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={openManageMembers}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Programs
                </Button>
              </div>
              {collectionTagOptions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {collectionTagOptions.map((t) => {
                    const active = collectionTagFilter.has(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setCollectionTagFilter((prev) => {
                            const next = new Set(prev);
                            if (next.has(t)) next.delete(t);
                            else next.add(t);
                            return next;
                          })
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            chipFilter === "all" &&
            !search && (
              <>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">Collections</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {collections.map((c) => (
                      <CollectionCard key={c.id} collection={c} onClick={() => setSelectedCollectionId(c.id)} />
                    ))}
                    <CreateCollectionCard onClick={() => setCreateCollectionOpen(true)} />
                  </div>
                </div>
                <RecentlyUsedPrograms programs={programs} />
              </>
            )
          )}
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
          {(activeTab !== "templates" || typeFilter !== "global") &&
            (activeTab !== "templates" || chipFilter === "all") && (
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
          {activeTab === "programs" && role === "TRAINER" && assignedClients.length > 0 && (
            <Popover>
              <PopoverTrigger render={<Button variant="outline" className="h-8 gap-1.5 px-2.5 font-normal" />}>
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                {clientFilter.size === 0
                  ? "Client"
                  : clientFilter.size === 1
                  ? (() => {
                      const c = assignedClients.find((client) => clientFilter.has(client.id));
                      return c ? clientLabel(c) : "1 client";
                    })()
                  : `${clientFilter.size} clients`}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-1.5">
                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                  {assignedClients.map((client) => {
                    const id = `client-filter-${client.id}`;
                    return (
                      <div
                        key={client.id}
                        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        <Checkbox
                          id={id}
                          checked={clientFilter.has(client.id)}
                          onCheckedChange={() => toggleClientFilter(client.id)}
                        />
                        <Label htmlFor={id} className="flex-1 cursor-pointer truncate text-sm font-normal">
                          {clientLabel(client)}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground"
              onClick={handleClearFilters}
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </div>

        {role === "TRAINER" && (
          <div className="flex flex-wrap shrink-0 items-center gap-2">
            <CreateProgramMenu
              onUseTemplate={() => handleTabChange("templates")}
              trigger={<Button className="gap-2" />}
            >
              <Plus className="h-4 w-4" />
              Create Program
            </CreateProgramMenu>
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
                    onToggleFavorite={handleToggleFavorite}
                    togglingFavoriteId={togglingFavoriteId}
                    onAddToCollection={openAddToCollections}
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

      <Dialog open={createCollectionOpen} onOpenChange={setCreateCollectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Collection</DialogTitle>
            <DialogDescription>
              Group related programs together — a program can belong to more than one collection.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="e.g., Upper Body"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCollectionName.trim()) handleCreateCollection();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCollectionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCollection}
              disabled={creatingCollection || !newCollectionName.trim()}
            >
              {creatingCollection ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageMembersOpen} onOpenChange={setManageMembersOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Add programs to &quot;{collections.find((c) => c.id === selectedCollectionId)?.name}&quot;
            </DialogTitle>
            <DialogDescription>
              Check any programs from your library that belong in this collection. A program can be in more than one.
            </DialogDescription>
          </DialogHeader>

          {programs.length > 0 && (
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search your library..."
                className="pl-9"
              />
            </div>
          )}

          <div className="flex-1 space-y-1 overflow-y-auto rounded-lg border border-border/50 p-1.5">
            {programs.length === 0 && (
              <div className="py-10 text-center">
                <Library className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">Your library is empty — build a program first.</p>
              </div>
            )}
            {programs.length > 0 &&
              programs.filter((p) => p.name.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">No programs match &quot;{memberSearch}&quot;.</p>
              )}
            {programs
              .filter((p) => p.name.toLowerCase().includes(memberSearch.toLowerCase()))
              .map((p) => {
                const id = `member-${p.id}`;
                const status = statusConfig[p.status] ?? { label: p.status, className: "bg-muted text-muted-foreground border-border" };
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-muted">
                    <Checkbox
                      id={id}
                      checked={memberSelection.has(p.id)}
                      onCheckedChange={() =>
                        setMemberSelection((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        })
                      }
                    />
                    <Label htmlFor={id} className="flex flex-1 min-w-0 cursor-pointer items-center justify-between gap-3 font-normal">
                      <span className="truncate text-sm" title={p.name}>{p.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge className={`border text-[10px] font-medium ${status.className}`}>{status.label}</Badge>
                        <WorkoutCount count={p._count.workouts} />
                      </span>
                    </Label>
                  </div>
                );
              })}
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {memberSelection.size} program{memberSelection.size === 1 ? "" : "s"} selected
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setManageMembersOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveMembers} disabled={savingMembers}>
                {savingMembers ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addToCollectionsProgram} onOpenChange={(open) => !open && setAddToCollectionsProgram(null)}>
        <DialogContent className="max-h-[85vh] flex flex-col sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate" title={addToCollectionsProgram?.name}>
              Add &quot;{addToCollectionsProgram?.name}&quot; to collections
            </DialogTitle>
            <DialogDescription>
              Check any collections this program belongs in. It can be in more than one, or none.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-1 overflow-y-auto">
            {allCollections.length === 0 && (
              <div className="py-6 text-center">
                <Folder className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">You don&apos;t have any collections yet.</p>
              </div>
            )}
            {allCollections.map((c) => {
              const id = `program-collection-${c.id}`;
              return (
                <div key={c.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted">
                  <Checkbox
                    id={id}
                    checked={addToCollectionsSelection.has(c.id)}
                    onCheckedChange={() =>
                      setAddToCollectionsSelection((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                  />
                  <Label htmlFor={id} className="flex-1 cursor-pointer truncate text-sm font-normal">
                    {c.name}
                  </Label>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 border-t pt-3">
            <Input
              value={inlineCollectionName}
              onChange={(e) => setInlineCollectionName(e.target.value)}
              placeholder="New collection name..."
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && inlineCollectionName.trim()) handleCreateInlineCollection();
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5"
              disabled={creatingInlineCollection || !inlineCollectionName.trim()}
              onClick={handleCreateInlineCollection}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {creatingInlineCollection ? "Creating..." : "Create"}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddToCollectionsProgram(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProgramCollections} disabled={savingProgramCollections}>
              {savingProgramCollections ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
