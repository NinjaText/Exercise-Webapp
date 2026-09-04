"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/stat-card";
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
  X,
  Star,
  FolderPlus,
  Folder,
  SlidersHorizontal,
  Grid3x3,
  Users,
  CalendarClock,
  PauseCircle,
  CheckCircle2,
  ClipboardList,
  Download,
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
import type { ProgramProgress } from "@/lib/services/program.service";

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const SPORT_OPTIONS = ["Tennis", "Golf", "Running", "Basketball", "Soccer", "Swimming", "General Fitness"];
const BODY_AREA_OPTIONS = ["Shoulder", "Elbow", "Wrist/Hand", "Chest", "Back", "Hip", "Knee", "Ankle/Foot", "Core"];
const GOAL_OPTIONS = ["Strength", "Mobility", "Endurance", "Weight Loss", "Rehab", "Power"];
const LEVEL_OPTIONS = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];
const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

type DurationBucket = "le1" | "2to4" | "5to8" | "9to12" | "gt12";
const DURATION_OPTIONS: { value: DurationBucket; label: string }[] = [
  { value: "le1", label: "1 week or less" },
  { value: "2to4", label: "2-4 weeks" },
  { value: "5to8", label: "5-8 weeks" },
  { value: "9to12", label: "9-12 weeks" },
  { value: "gt12", label: "12+ weeks" },
];

function matchesDurationBucket(weeks: number | null | undefined, bucket: DurationBucket): boolean {
  if (weeks == null) return false;
  switch (bucket) {
    case "le1": return weeks <= 1;
    case "2to4": return weeks >= 2 && weeks <= 4;
    case "5to8": return weeks >= 5 && weeks <= 8;
    case "9to12": return weeks >= 9 && weeks <= 12;
    case "gt12": return weeks > 12;
  }
}

const VIEW_OPTIONS = [
  { value: "all", label: "All" },
  { value: "recent", label: "Recent" },
  { value: "favorites", label: "Favorites" },
  { value: "templates", label: "Templates" },
  { value: "archived", label: "Archived" },
] as const;

const LIBRARY_SORT_OPTIONS = [
  { value: "recent", label: "Recently Used" },
  { value: "name_asc", label: "Name A-Z" },
  { value: "name_desc", label: "Name Z-A" },
  { value: "workouts_desc", label: "Most Workouts" },
  { value: "workouts_asc", label: "Fewest Workouts" },
] as const;
type LibrarySort = (typeof LIBRARY_SORT_OPTIONS)[number]["value"];

function sortLibraryPrograms<T extends { name: string; _count: { workouts: number } }>(
  items: T[],
  sort: LibrarySort,
  getUpdatedAt: (item: T) => Date | null | undefined
): T[] {
  const sorted = [...items];
  switch (sort) {
    case "name_asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "name_desc":
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case "workouts_desc":
      return sorted.sort((a, b) => b._count.workouts - a._count.workouts);
    case "workouts_asc":
      return sorted.sort((a, b) => a._count.workouts - b._count.workouts);
    case "recent":
    default:
      return sorted.sort((a, b) => {
        const at = getUpdatedAt(a)?.getTime() ?? 0;
        const bt = getUpdatedAt(b)?.getTime() ?? 0;
        return bt - at;
      });
  }
}

interface Categorized {
  tags: string[];
  bodyAreas?: string[];
  goals?: string[];
  activities?: string[];
  level?: string | null;
  durationWeeks?: number | null;
  status: string;
}

interface ProgramListItem extends Categorized {
  id: string;
  name: string;
  isTemplate: boolean;
  isGlobal: boolean;
  isPublic: boolean;
  sourceTemplateId?: string | null;
  updatedAt: Date;
  createdAt: Date;
  startDate?: Date | null;
  clientId?: string | null;
  trainer: { id: string; firstName: string; lastName: string } | null;
  client: { id: string; firstName: string; lastName: string } | null;
  workouts: { id: string; name: string }[];
  _count: { workouts: number };
  isFavorite?: boolean;
  collectionIds?: string[];
}

interface CollectionItem {
  id: string;
  name: string;
  programCount: number;
}

interface GlobalProgramItem extends Categorized {
  id: string;
  name: string;
  description?: string | null;
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

function initials(person: { firstName: string; lastName: string }): string {
  return `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase();
}

const statusConfig: Record<string, { label: string; className: string }> = {
  ACTIVE:    { label: "Active",    className: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  DRAFT:     { label: "Draft",     className: "bg-muted text-muted-foreground border-border" },
  PAUSED:    { label: "Paused",    className: "bg-amber-500/10 text-amber-700 border-amber-200" },
  COMPLETED: { label: "Completed", className: "bg-muted text-muted-foreground border-border" },
  ARCHIVED:  { label: "Archived",  className: "bg-muted text-muted-foreground border-border opacity-70" },
};

// --- Assigned tab: a derived status distinct from the raw PlanStatus, since
// "Starting Soon" isn't a real stored value — it's ACTIVE + a future startDate.
type AssignedStatus = "ACTIVE" | "STARTING_SOON" | "ON_HOLD" | "COMPLETED" | "OTHER";

function deriveAssignedStatus(program: { status: string; startDate?: Date | null }): AssignedStatus {
  if (program.status === "PAUSED") return "ON_HOLD";
  if (program.status === "COMPLETED") return "COMPLETED";
  if (program.status === "ACTIVE") {
    if (program.startDate && new Date(program.startDate).getTime() > Date.now()) return "STARTING_SOON";
    return "ACTIVE";
  }
  return "OTHER";
}

const assignedStatusConfig: Record<AssignedStatus, { label: string; className: string; dot: string }> = {
  ACTIVE:         { label: "Active",        className: "bg-emerald-500/10 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  STARTING_SOON:  { label: "Starting Soon", className: "bg-blue-500/10 text-blue-700 border-blue-200",         dot: "bg-blue-500" },
  ON_HOLD:        { label: "On Hold",       className: "bg-amber-500/10 text-amber-700 border-amber-200",     dot: "bg-amber-500" },
  COMPLETED:      { label: "Completed",     className: "bg-purple-500/10 text-purple-700 border-purple-200",  dot: "bg-purple-500" },
  OTHER:          { label: "Draft",         className: "bg-muted text-muted-foreground border-border",         dot: "bg-muted-foreground" },
};

function formatDueLabel(date: Date): string {
  const now = new Date();
  const days = Math.round((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

type AssignedSort =
  | "updated_desc" | "client_asc" | "client_desc"
  | "progress_desc" | "progress_asc" | "start_desc" | "start_asc";

const SORT_OPTIONS: { value: AssignedSort; label: string }[] = [
  { value: "updated_desc", label: "Recently Updated" },
  { value: "client_asc", label: "Client Name A-Z" },
  { value: "client_desc", label: "Client Name Z-A" },
  { value: "progress_desc", label: "Progress: Highest" },
  { value: "progress_asc", label: "Progress: Lowest" },
  { value: "start_desc", label: "Start Date: Newest" },
  { value: "start_asc", label: "Start Date: Oldest" },
];

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

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

// --- Library tab row: Program | Collection | Tags | Workouts | Updated | Actions
function LibraryProgramRow({
  program,
  role,
  updatableSet,
  collectionsById,
  onDuplicate,
  onArchive,
  onRequestHardDelete,
  onTogglePublic,
  togglingPublicId,
  onToggleFavorite,
  togglingFavoriteId,
  onAddToCollection,
  search,
}: {
  program: ProgramListItem;
  role?: string;
  updatableSet: Set<string>;
  collectionsById: Map<string, string>;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRequestHardDelete: (id: string, name: string) => void;
  onTogglePublic: (id: string, isPublic: boolean) => void;
  togglingPublicId: string | null;
  onToggleFavorite: (id: string, next: boolean) => void;
  togglingFavoriteId: string | null;
  onAddToCollection: (program: ProgramListItem) => void;
  search?: string;
}) {
  const router = useRouter();
  const matchedWorkoutId = search ? findMatchedWorkoutId(program, search) : null;
  const detailHref = matchedWorkoutId
    ? `/programs/${program.id}?workoutId=${matchedWorkoutId}`
    : `/programs/${program.id}`;

  const collectionNames = (program.collectionIds ?? [])
    .map((id) => collectionsById.get(id))
    .filter((n): n is string => !!n);

  const allTags = [
    ...program.tags,
    ...(program.bodyAreas ?? []),
    ...(program.goals ?? []),
    ...(program.activities ?? []),
  ];

  return (
    <TableRow className="group">
      <TableCell className="max-w-64">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Dumbbell className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <Link href={detailHref} className="block truncate font-medium hover:text-primary hover:underline">
              {program.name}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {program.isTemplate && (
                <Badge variant="outline" className="text-[10px] font-medium">Template</Badge>
              )}
              {updatableSet.has(program.id) && (
                <Badge variant="outline" className="text-[10px] font-medium">Update available</Badge>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {collectionNames.length === 0
          ? "—"
          : collectionNames.length === 1
          ? collectionNames[0]
          : `${collectionNames[0]} +${collectionNames.length - 1}`}
      </TableCell>
      <TableCell>
        <div className="flex max-w-56 flex-wrap items-center gap-1">
          {allTags.slice(0, 3).map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
          ))}
          {allTags.length > 3 && (
            <Badge variant="secondary" className="text-[10px]">+{allTags.length - 3}</Badge>
          )}
          {allTags.length === 0 && <span className="text-muted-foreground">—</span>}
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
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => router.push(`/programs/${program.id}/edit`)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(program.id)}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(`/programs/${program.id}?assign=true`)}>
                  <UserPlus className="mr-2 h-4 w-4" /> Assign Client
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddToCollection(program)}>
                  <Folder className="mr-2 h-4 w-4" /> Add to Collection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTogglePublic(program.id, !program.isPublic)} disabled={togglingPublicId === program.id}>
                  {program.isPublic ? <Lock className="mr-2 h-4 w-4" /> : <Globe className="mr-2 h-4 w-4" />}
                  {program.isPublic ? "Make Private" : "Make Public"}
                </DropdownMenuItem>
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

// --- Assigned tab row: Client | Program | Progress | Next Workout | Status | Updated | Actions
function AssignedProgramRow({
  program,
  progress,
  onDuplicate,
  onArchive,
  onRequestHardDelete,
}: {
  program: ProgramListItem;
  progress?: ProgramProgress;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRequestHardDelete: (id: string, name: string) => void;
}) {
  const router = useRouter();
  const assignedStatus = assignedStatusConfig[deriveAssignedStatus(program)];
  const total = progress?.total ?? 0;
  const completed = progress?.completed ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <TableRow className="group">
      <TableCell>
        {program.client ? (
          <Link href={`/clients/${program.client.id}`} className="flex items-center gap-2.5 hover:underline">
            <Avatar size="sm" className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs">{initials(program.client)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{clientLabel(program.client)}</span>
          </Link>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        )}
      </TableCell>
      <TableCell className="max-w-52">
        <Link href={`/programs/${program.id}`} className="block truncate font-medium hover:text-primary hover:underline">
          {program.name}
        </Link>
        {program.durationWeeks != null && (
          <Badge variant="outline" className="mt-1 text-[10px] font-medium">
            {program.durationWeeks} week{program.durationWeeks === 1 ? "" : "s"}
          </Badge>
        )}
      </TableCell>
      <TableCell className="min-w-36">
        {total === 0 ? (
          <span className="text-muted-foreground">Not started</span>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{percent}%</span>
            </div>
            <Progress value={percent} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">{completed} of {total} workouts</p>
          </div>
        )}
      </TableCell>
      <TableCell>
        {progress?.nextSession ? (
          <div>
            <p className="truncate text-sm">{progress.nextSession.workoutName}</p>
            <p className="text-[11px] text-muted-foreground">{formatDueLabel(new Date(progress.nextSession.scheduledDate))}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge className={`border text-[11px] font-medium ${assignedStatus.className}`}>
          {assignedStatus.label}
        </Badge>
      </TableCell>
      <TableCell>
        <UpdatedAt date={program.updatedAt} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/programs/${program.id}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
            title="View program"
          >
            <Eye className="h-4 w-4" />
          </Link>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onRequestHardDelete(program.id, program.name)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete Permanently
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onArchive(program.id)}
                className="text-destructive focus:text-destructive"
              >
                <Archive className="mr-2 h-4 w-4" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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

function CollectionTile({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 text-left shadow-sm transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border/50 hover:border-primary/40 hover:bg-muted/40"
      )}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", selected ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary")}>
        {label === "All Programs" ? <Grid3x3 className="h-4.5 w-4.5" /> : <Folder className="h-4.5 w-4.5" />}
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">
          {count} program{count === 1 ? "" : "s"}
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

// --- Filters panel: checkbox-group facets for the Library tab ---
function CheckboxGroup({
  options,
  selected,
  onToggle,
  onClear,
  limit,
}: {
  options: (string | { value: string; label: string })[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const normalized = options.map((opt) => (typeof opt === "string" ? { value: opt, label: opt } : opt));
  const visible = limit && !expanded ? normalized.slice(0, limit) : normalized;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-1.5 text-sm">
        <Checkbox checked={selected.size === 0} onCheckedChange={() => onClear()} />
        All
      </label>
      {visible.map((opt) => (
        <label key={opt.value} className="flex items-center gap-1.5 text-sm">
          <Checkbox checked={selected.has(opt.value)} onCheckedChange={() => onToggle(opt.value)} />
          {opt.label}
        </label>
      ))}
      {limit != null && normalized.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : `+ Show more`}
        </button>
      )}
    </div>
  );
}

function ProgramFiltersPanel({
  typeFilter,
  onTypeFilterChange,
  sportFilter,
  onToggleSport,
  bodyAreaFilter,
  onToggleBodyArea,
  goalFilter,
  onToggleGoal,
  levelFilter,
  onToggleLevel,
  durationFilter,
  onToggleDuration,
  statusFilter,
  onToggleStatus,
  onReset,
  onApply,
}: {
  typeFilter: "all" | "clinical" | "global";
  onTypeFilterChange: (v: "all" | "clinical" | "global") => void;
  sportFilter: Set<string>;
  onToggleSport: (v: string) => void;
  bodyAreaFilter: Set<string>;
  onToggleBodyArea: (v: string) => void;
  goalFilter: Set<string>;
  onToggleGoal: (v: string) => void;
  levelFilter: Set<string>;
  onToggleLevel: (v: string) => void;
  durationFilter: Set<DurationBucket>;
  onToggleDuration: (v: DurationBucket) => void;
  statusFilter: Set<string>;
  onToggleStatus: (v: string) => void;
  onReset: () => void;
  onApply: () => void;
}) {
  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Filters</h3>
        <button type="button" onClick={onReset} className="text-xs font-medium text-primary hover:underline">
          Clear all
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Users className="h-3.5 w-3.5 text-muted-foreground" /> Source</p>
        <div className="flex flex-wrap items-center gap-4">
          {(["all", "clinical", "global"] as const).map((v) => (
            <label key={v} className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="program-source"
                checked={typeFilter === v}
                onChange={() => onTypeFilterChange(v)}
                className="h-3.5 w-3.5 accent-primary"
              />
              {v === "all" ? "All Sources" : v === "clinical" ? "My Programs" : "InMotus Programs"}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Sport</p>
        <CheckboxGroup options={SPORT_OPTIONS} selected={sportFilter} onToggle={onToggleSport} onClear={() => sportFilter.forEach(onToggleSport)} limit={5} />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Body Area</p>
        <CheckboxGroup options={BODY_AREA_OPTIONS} selected={bodyAreaFilter} onToggle={onToggleBodyArea} onClear={() => bodyAreaFilter.forEach(onToggleBodyArea)} limit={5} />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Goal</p>
        <CheckboxGroup options={GOAL_OPTIONS} selected={goalFilter} onToggle={onToggleGoal} onClear={() => goalFilter.forEach(onToggleGoal)} />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Level</p>
        <CheckboxGroup
          options={LEVEL_OPTIONS}
          selected={levelFilter}
          onToggle={onToggleLevel}
          onClear={() => levelFilter.forEach(onToggleLevel)}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Duration</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox checked={durationFilter.size === 0} onCheckedChange={() => durationFilter.forEach(onToggleDuration)} />
            Any Duration
          </label>
          {DURATION_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={durationFilter.has(opt.value)} onCheckedChange={() => onToggleDuration(opt.value)} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Status</p>
        <CheckboxGroup
          options={STATUS_OPTIONS}
          selected={statusFilter}
          onToggle={onToggleStatus}
          onClear={() => statusFilter.forEach(onToggleStatus)}
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onReset}>Reset</Button>
        <Button onClick={onApply}>Apply Filters</Button>
      </div>
    </div>
  );
}

export function ProgramListClient({
  programs,
  globalPrograms = [],
  updatableIds = [],
  collections = [],
  progressByProgramId = {},
  role,
}: {
  programs: ProgramListItem[];
  globalPrograms?: GlobalProgramItem[];
  updatableIds?: string[];
  collections?: CollectionItem[];
  progressByProgramId?: Record<string, ProgramProgress>;
  role?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const updatableSet = new Set(updatableIds);
  const [copying, setCopying] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "clinical" | "global">("all");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("recent");
  const [pendingHardDelete, setPendingHardDelete] = useState<{ id: string; name: string } | null>(null);
  const [hardDeleting, setHardDeleting] = useState(false);
  const [togglingPublicId, setTogglingPublicId] = useState<string | null>(null);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(null);

  // Library-tab-only: quick View dropdown, the Filters panel, and Collections.
  const [chipFilter, setChipFilter] = useState<"all" | "recent" | "favorites" | "templates" | "archived">("all");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sportFilter, setSportFilter] = useState<Set<string>>(new Set());
  const [bodyAreaFilter, setBodyAreaFilter] = useState<Set<string>>(new Set());
  const [goalFilter, setGoalFilter] = useState<Set<string>>(new Set());
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set());
  const [durationFilter, setDurationFilter] = useState<Set<DurationBucket>>(new Set());
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<Set<string>>(new Set());
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

  // Assigned-tab-only: status filter, sort, search.
  const [assignedSearch, setAssignedSearch] = useState("");
  const [assignedStatusFilter, setAssignedStatusFilter] = useState<"all" | AssignedStatus>("all");
  const [assignedSort, setAssignedSort] = useState<AssignedSort>("updated_desc");

  // collections prop plus any created inline this session that the prop
  // hasn't caught up to yet (router.refresh() is async).
  const allCollections = useMemo(() => {
    const known = new Set(collections.map((c) => c.id));
    return [...collections, ...extraCollections.filter((c) => !known.has(c.id))];
  }, [collections, extraCollections]);

  const collectionsById = useMemo(
    () => new Map(allCollections.map((c) => [c.id, c.name])),
    [allCollections]
  );

  const activeTab =
    role === "TRAINER"
      ? searchParams.get("tab") === "programs"
        ? "programs"
        : "templates"
      : "programs";

  function handleTabChange(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "templates") {
      params.delete("tab");
    } else {
      params.set("tab", nextTab);
    }
    const nextQuery = params.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }

  // ---------- Assigned tab ----------
  const assignedPrograms = programs; // page.tsx already scoped this fetch to hasClient:true

  const assignedStatCounts = useMemo(() => {
    const counts: Record<AssignedStatus, number> = { ACTIVE: 0, STARTING_SOON: 0, ON_HOLD: 0, COMPLETED: 0, OTHER: 0 };
    for (const p of assignedPrograms) counts[deriveAssignedStatus(p)] += 1;
    return counts;
  }, [assignedPrograms]);

  const filteredAssigned = useMemo(() => {
    let rows = assignedPrograms.filter((p) => {
      if (assignedSearch) {
        const clientMatch = p.client && clientLabel(p.client).toLowerCase().includes(assignedSearch.toLowerCase());
        if (!matchesSearch(p, assignedSearch) && !clientMatch) return false;
      }
      if (assignedStatusFilter !== "all" && deriveAssignedStatus(p) !== assignedStatusFilter) return false;
      return true;
    });

    rows = [...rows].sort((a, b) => {
      switch (assignedSort) {
        case "client_asc":
          return clientLabel(a.client ?? { firstName: "", lastName: "" }).localeCompare(clientLabel(b.client ?? { firstName: "", lastName: "" }));
        case "client_desc":
          return clientLabel(b.client ?? { firstName: "", lastName: "" }).localeCompare(clientLabel(a.client ?? { firstName: "", lastName: "" }));
        case "progress_desc":
        case "progress_asc": {
          const pa = progressByProgramId[a.id];
          const pb = progressByProgramId[b.id];
          const percentA = pa && pa.total > 0 ? pa.completed / pa.total : 0;
          const percentB = pb && pb.total > 0 ? pb.completed / pb.total : 0;
          return assignedSort === "progress_desc" ? percentB - percentA : percentA - percentB;
        }
        case "start_desc":
          return new Date(b.startDate ?? b.createdAt).getTime() - new Date(a.startDate ?? a.createdAt).getTime();
        case "start_asc":
          return new Date(a.startDate ?? a.createdAt).getTime() - new Date(b.startDate ?? b.createdAt).getTime();
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return rows;
  }, [assignedPrograms, assignedSearch, assignedStatusFilter, assignedSort, progressByProgramId]);

  function handleExportAssigned() {
    const header = ["Client", "Program", "Progress %", "Status", "Last Updated"];
    const rows = filteredAssigned.map((p) => {
      const progress = progressByProgramId[p.id];
      const percent = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
      return [
        p.client ? clientLabel(p.client) : "Unassigned",
        p.name,
        String(percent),
        assignedStatusConfig[deriveAssignedStatus(p)].label,
        new Date(p.updatedAt).toISOString(),
      ];
    });
    downloadCsv(`assigned-programs-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  }

  // ---------- Library tab ----------
  function matchesChip(p: Categorized & { isFavorite?: boolean }): boolean {
    if (chipFilter === "archived") return p.status === "ARCHIVED";
    if (p.status === "ARCHIVED") return false;
    switch (chipFilter) {
      case "recent":
        return true; // recency handled separately via updatedAt window below
      case "favorites":
        return !!p.isFavorite;
      case "templates":
        return true;
      default:
        return true;
    }
  }

  function matchesRecentWindow(updatedAt: Date): boolean {
    if (chipFilter !== "recent") return true;
    return Date.now() - new Date(updatedAt).getTime() < RECENT_WINDOW_MS;
  }

  function matchesFacets(p: Categorized): boolean {
    if (sportFilter.size > 0 && !(p.activities ?? []).some((a) => sportFilter.has(a))) return false;
    if (bodyAreaFilter.size > 0 && !(p.bodyAreas ?? []).some((a) => bodyAreaFilter.has(a))) return false;
    if (goalFilter.size > 0 && !(p.goals ?? []).some((a) => goalFilter.has(a))) return false;
    if (levelFilter.size > 0 && !(p.level && levelFilter.has(p.level))) return false;
    if (durationFilter.size > 0 && !Array.from(durationFilter).some((b) => matchesDurationBucket(p.durationWeeks, b))) return false;
    if (libraryStatusFilter.size > 0 && !libraryStatusFilter.has(p.status)) return false;
    return true;
  }

  const activeFilterCount =
    sportFilter.size + bodyAreaFilter.size + goalFilter.size + levelFilter.size +
    durationFilter.size + libraryStatusFilter.size + (typeFilter !== "all" ? 1 : 0);

  function handleResetFilters() {
    setTypeFilter("all");
    setSportFilter(new Set());
    setBodyAreaFilter(new Set());
    setGoalFilter(new Set());
    setLevelFilter(new Set());
    setDurationFilter(new Set());
    setLibraryStatusFilter(new Set());
  }

  function makeToggleSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>) {
    return (value: T) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    };
  }

  // Library tab — clinical (my own) programs
  const filteredClinical = sortLibraryPrograms(
    activeTab === "templates" && typeFilter !== "global"
      ? programs.filter((p) => {
          if (search && !matchesSearch(p, search)) return false;
          if (!matchesChip(p)) return false;
          if (!matchesRecentWindow(p.updatedAt)) return false;
          if (chipFilter === "templates" && !p.isTemplate) return false;
          if (!matchesFacets(p)) return false;
          if (selectedCollectionId && !(p.collectionIds ?? []).includes(selectedCollectionId)) return false;
          return true;
        })
      : [],
    librarySort,
    (p) => p.updatedAt
  );

  // Library tab — global subset
  const filteredGlobal = sortLibraryPrograms(
    activeTab === "templates" && typeFilter !== "clinical"
      ? globalPrograms.filter((p) => {
          if (search && !matchesSearch(p, search)) return false;
          if (!matchesFacets(p)) return false;
          return true;
        })
      : [],
    librarySort,
    (p) => p.globalUpdatedAt
  );

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

  const collectionPrograms = selectedCollectionId
    ? programs.filter((p) => (p.collectionIds ?? []).includes(selectedCollectionId))
    : [];

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

  return (
    <div className="space-y-6">
      {role === "TRAINER" && (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="templates"><Library className="h-3.5 w-3.5" /> Library</TabsTrigger>
            <TabsTrigger value="programs"><Users className="h-3.5 w-3.5" /> Assigned</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* ================= LIBRARY TAB ================= */}
      {activeTab === "templates" && role === "TRAINER" && (
        <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Collections</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <CollectionTile
                label="All Programs"
                count={programs.filter((p) => p.status !== "ARCHIVED").length}
                selected={selectedCollectionId === null}
                onClick={() => setSelectedCollectionId(null)}
              />
              {allCollections.map((c) => (
                <CollectionTile
                  key={c.id}
                  label={c.name}
                  count={c.programCount}
                  selected={selectedCollectionId === c.id}
                  onClick={() => setSelectedCollectionId(c.id)}
                />
              ))}
              <CreateCollectionCard onClick={() => setCreateCollectionOpen(true)} />
            </div>
          </div>

          {selectedCollectionId && (
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm">
                {allCollections.find((c) => c.id === selectedCollectionId)?.name} · {collectionPrograms.length} program{collectionPrograms.length === 1 ? "" : "s"}
              </h3>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openManageMembers}>
                <Plus className="h-3.5 w-3.5" />
                Add Programs
              </Button>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search programs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={chipFilter} onValueChange={(v) => setChipFilter((v as typeof chipFilter) ?? "all")}>
                <SelectTrigger className="w-40">
                  <SelectValue>
                    {(value: string | null) => `View: ${VIEW_OPTIONS.find((o) => o.value === value)?.label ?? "All"}`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {VIEW_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={librarySort} onValueChange={(v) => setLibrarySort((v as LibrarySort) ?? "recent")}>
                <SelectTrigger className="w-44">
                  <SelectValue>
                    {(value: string | null) => `Sort: ${LIBRARY_SORT_OPTIONS.find((o) => o.value === value)?.label ?? "Recently Used"}`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LIBRARY_SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={filtersOpen ? "secondary" : "outline"}
                className="gap-1.5"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge className="ml-0.5 h-5 min-w-5 justify-center border-0 bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
              {(search || activeFilterCount > 0 || chipFilter !== "all") && (
                <Button
                  variant="ghost"
                  className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSearch("");
                    setChipFilter("all");
                    handleResetFilters();
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </Button>
              )}
            </div>
            <CreateProgramMenu
              onUseTemplate={() => handleTabChange("templates")}
              trigger={<Button className="gap-2" />}
            >
              <Plus className="h-4 w-4" />
              Create Program
            </CreateProgramMenu>
          </div>

          {filtersOpen && (
            <ProgramFiltersPanel
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
              sportFilter={sportFilter}
              onToggleSport={makeToggleSet(setSportFilter)}
              bodyAreaFilter={bodyAreaFilter}
              onToggleBodyArea={makeToggleSet(setBodyAreaFilter)}
              goalFilter={goalFilter}
              onToggleGoal={makeToggleSet(setGoalFilter)}
              levelFilter={levelFilter}
              onToggleLevel={makeToggleSet(setLevelFilter)}
              durationFilter={durationFilter}
              onToggleDuration={makeToggleSet(setDurationFilter)}
              statusFilter={libraryStatusFilter}
              onToggleStatus={makeToggleSet(setLibraryStatusFilter)}
              onReset={handleResetFilters}
              onApply={() => setFiltersOpen(false)}
            />
          )}

          {filteredClinical.length === 0 && filteredGlobal.length === 0 ? (
            <ProgramsEmptyState
              title={typeFilter === "global" ? "No global templates" : "Your library is empty"}
              description={
                typeFilter === "global"
                  ? "Your administrator hasn't added any global programs yet."
                  : "Build a program here, then assign it to a client when it's ready."
              }
              showCreateActions={typeFilter !== "global"}
            />
          ) : (
            <div className="rounded-xl border border-border/50 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Program</TableHead>
                    <TableHead>Collection</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Workouts</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClinical.map((program) => (
                    <LibraryProgramRow
                      key={program.id}
                      program={program}
                      role={role}
                      updatableSet={updatableSet}
                      collectionsById={collectionsById}
                      onDuplicate={handleDuplicate}
                      onArchive={handleArchive}
                      onRequestHardDelete={(id, name) => setPendingHardDelete({ id, name })}
                      onTogglePublic={handleTogglePublic}
                      togglingPublicId={togglingPublicId}
                      onToggleFavorite={handleToggleFavorite}
                      togglingFavoriteId={togglingFavoriteId}
                      onAddToCollection={openAddToCollections}
                      search={search}
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
          )}
        </div>
      )}

      {/* ================= ASSIGNED TAB ================= */}
      {activeTab === "programs" && (
        <div className="space-y-5">
          {role === "TRAINER" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Active" value={assignedStatCounts.ACTIVE} icon={CheckCircle2} description="Clients in progress" iconClassName="bg-emerald-500/10 text-emerald-600" />
              <StatCard label="Starting Soon" value={assignedStatCounts.STARTING_SOON} icon={CalendarClock} description="Scheduled to begin" iconClassName="bg-blue-500/10 text-blue-600" />
              <StatCard label="Total Assigned" value={assignedPrograms.length} icon={ClipboardList} description="All assignments" iconClassName="bg-indigo-500/10 text-indigo-600" />
              <StatCard label="On Hold" value={assignedStatCounts.ON_HOLD} icon={PauseCircle} description="Paused programs" iconClassName="bg-amber-500/10 text-amber-600" />
              <StatCard label="Completed" value={assignedStatCounts.COMPLETED} icon={CheckCircle2} description="Finished programs" iconClassName="bg-purple-500/10 text-purple-600" />
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search client or program..."
                  value={assignedSearch}
                  onChange={(e) => setAssignedSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={assignedStatusFilter} onValueChange={(v) => setAssignedStatusFilter((v as typeof assignedStatusFilter) ?? "all")}>
                <SelectTrigger className="w-40">
                  <SelectValue>
                    {(value: string | null) => `Status: ${value && value !== "all" ? assignedStatusConfig[value as AssignedStatus]?.label : "All"}`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {(["ACTIVE", "STARTING_SOON", "ON_HOLD", "COMPLETED"] as AssignedStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", assignedStatusConfig[s].dot)} />
                        {assignedStatusConfig[s].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assignedSort} onValueChange={(v) => setAssignedSort((v as AssignedSort) ?? "updated_desc")}>
                <SelectTrigger className="w-52">
                  <SelectValue>
                    {(value: string | null) => `Sort by: ${SORT_OPTIONS.find((o) => o.value === value)?.label ?? "Recently Updated"}`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {role === "TRAINER" && (
              <div className="flex items-center gap-2">
                <Button variant="outline" className="gap-1.5" onClick={handleExportAssigned}>
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
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

          {filteredAssigned.length === 0 ? (
            <ProgramsEmptyState
              title="No assigned programs"
              description={
                role === "TRAINER"
                  ? "Assign a program from your Library to a client to see it here."
                  : "No programs have been assigned to you yet."
              }
              showCreateActions={role === "TRAINER"}
            />
          ) : role === "TRAINER" ? (
            <div className="rounded-xl border border-border/50 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Program</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Next Workout</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssigned.map((program) => (
                    <AssignedProgramRow
                      key={program.id}
                      program={program}
                      progress={progressByProgramId[program.id]}
                      onDuplicate={handleDuplicate}
                      onArchive={handleArchive}
                      onRequestHardDelete={(id, name) => setPendingHardDelete({ id, name })}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            // Client role: keep the simpler original table (Name/Trainer/Status/Workouts/Updated)
            <div className="rounded-xl border border-border/50 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Trainer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Workouts</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssigned.map((program) => {
                    const status = statusConfig[program.status] ?? { label: program.status, className: "bg-muted text-muted-foreground border-border" };
                    return (
                      <TableRow key={program.id} className="group">
                        <TableCell className="max-w-64">
                          <Link href={`/programs/${program.id}`} className="font-medium hover:text-primary hover:underline truncate block">
                            {program.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {program.trainer ? clientLabel(program.trainer) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={`border text-[11px] font-medium ${status.className}`}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <WorkoutCount count={program._count.workouts} />
                        </TableCell>
                        <TableCell>
                          <UpdatedAt date={program.updatedAt} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/programs/${program.id}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
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
              Add programs to &quot;{allCollections.find((c) => c.id === selectedCollectionId)?.name}&quot;
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
