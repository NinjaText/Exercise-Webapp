"use client";

import { useState, useMemo, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search, Play, X, Plus, ArrowLeft, Globe, Lock,
  ChevronDown, ChevronUp, Trash2, Check, Sparkles, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";
import { YouTubeVideoSearch } from "@/components/exercises/youtube-video-search";
import { createOrganizationExerciseAction, toggleExercisePublicAction } from "@/actions/exercise-actions";
import { isYouTubeUrl, hasRealVideoUrl, parseYoutubeUrls } from "@/lib/utils/video";
import { toast } from "sonner";
import { resolvePickerTabs, mergeExercisesForPicker, type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";

interface Exercise {
  id: string;
  name: string;
  bodyRegion: string[];
  difficultyLevel: string | null;
  defaultReps?: number | null;
  musclesTargeted?: string[];
  description?: string | null;
  videoUrl?: string | null;
  videoProvider?: string | null;
  exercisePhases?: string[];
  source?: string | null;
  organizationId?: string | null;
  isPublic?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: Exercise[];
  onSelect: (exercise: Exercise) => void;
  organizationOrganizationId?: string | null;
  exerciseSourcePreference?: ExerciseSourcePreference;
}

const PHASES = [
  { value: "all",           label: "All"          },
  { value: "WARMUP",        label: "Warm-up"      },
  { value: "ACTIVATION",    label: "Activation"   },
  { value: "STRENGTHENING", label: "Strengthening" },
  { value: "MOBILITY",      label: "Mobility"     },
  { value: "COOLDOWN",      label: "Cool-down"    },
] as const;

const REGIONS = [
  { value: "UPPER_BODY",  label: "Upper"       },
  { value: "LOWER_BODY",  label: "Lower"       },
  { value: "CORE",        label: "Core"        },
  { value: "FULL_BODY",   label: "Full Body"   },
  { value: "BALANCE",     label: "Balance"     },
  { value: "FLEXIBILITY", label: "Flexibility" },
] as const;

const DIFFICULTY_COLORS: Record<string, string> = {
  BEGINNER:     "bg-green-100 text-green-700 border-green-200",
  INTERMEDIATE: "bg-amber-100 text-amber-700 border-amber-200",
  ADVANCED:     "bg-red-100 text-red-700 border-red-200",
};

const MAX_BATCH_SIZE = 15;

interface FilterBarProps {
  search: string;
  setSearch: (v: string) => void;
  phase: string;
  setPhase: (v: string) => void;
  bodyRegions: string[];
  setRegions: (v: string[]) => void;
}

function FilterBar({ search, setSearch, phase, setPhase, bodyRegions, setRegions }: FilterBarProps) {
  function toggleRegion(value: string) {
    setRegions(bodyRegions.includes(value) ? bodyRegions.filter((r) => r !== value) : [...bodyRegions, value]);
  }
  return (
    <div className="px-4 pt-3 pb-2 space-y-2.5 shrink-0 border-b">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search exercises..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-8 text-sm"
        />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Category</p>
        <div className="flex flex-wrap gap-1">
          {PHASES.map((p) => (
            <button key={p.value} type="button" onClick={() => setPhase(p.value)}
              className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                phase === p.value ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
              )}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Body Region</p>
        <div className="flex flex-wrap gap-1">
          {REGIONS.map((r) => (
            <button key={r.value} type="button" onClick={() => toggleRegion(r.value)}
              className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                bodyRegions.includes(r.value) ? "bg-secondary text-secondary-foreground border-secondary" : "bg-background text-muted-foreground border-border hover:border-muted-foreground/50 hover:text-foreground"
              )}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ExerciseListProps {
  list: Exercise[];
  organizationOrganizationId?: string | null;
  phase: string;
  setPhase: (v: string) => void;
  bodyRegions: string[];
  setRegions: (v: string[]) => void;
  onSelect: (ex: Exercise) => void;
  onClose: () => void;
  onPreview: (ex: Exercise) => void;
  onTogglePublic: (ex: Exercise, next: boolean) => void;
}

function ExerciseList({
  list,
  organizationOrganizationId,
  phase,
  setPhase,
  bodyRegions,
  setRegions,
  onSelect,
  onClose,
  onPreview,
  onTogglePublic,
}: ExerciseListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-2">
      <p className="text-[11px] text-muted-foreground mb-1">{list.length} exercise{list.length !== 1 ? "s" : ""}</p>
      <div className="space-y-0.5">
        {list.map((ex) => {
          const isMine = ex.source === "ORGANIZATION" && ex.organizationId === organizationOrganizationId;
          return (
          <div key={ex.id} role="button" tabIndex={0}
            className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-muted/70 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => { onSelect(ex); onClose(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(ex); onClose(); }
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-sm">{ex.name}</span>
                  {hasRealVideoUrl(ex.videoUrl) && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-sm font-medium shrink-0 hover:bg-blue-100 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); onPreview(ex); }}
                    >
                      <Play className="h-2.5 w-2.5" /> Video
                    </span>
                  )}
                  {isMine && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onTogglePublic(ex, !ex.isPublic); }}
                      className={cn(
                        "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-sm font-medium border transition-colors",
                        ex.isPublic
                          ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                      )}
                    >
                      {ex.isPublic ? <Globe className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                      {ex.isPublic ? "Public" : "Private"}
                    </button>
                  )}
                </div>
                {ex.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ex.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-1">
                  {ex.bodyRegion.map((region) => (
                    <Badge key={region} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {region.replace(/_/g, " ")}
                    </Badge>
                  ))}
                  {ex.difficultyLevel && (
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", DIFFICULTY_COLORS[ex.difficultyLevel])}>
                      {ex.difficultyLevel}
                    </Badge>
                  )}
                  {ex.exercisePhases?.filter((p) => p !== "STRENGTHENING").map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200">
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
          );
        })}

        {list.length === 0 && (
          <div className="text-center py-10">
            <p className="text-sm text-muted-foreground">No exercises found.</p>
            {(phase !== "all" || bodyRegions.length > 0) && (
              <Button variant="ghost" size="sm" className="mt-2 text-xs"
                onClick={() => { setPhase("all"); setRegions([]); }}>
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PhaseMultiSelect({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const options = [
    { value: "WARMUP", label: "Warm-up" },
    { value: "ACTIVATION", label: "Activation" },
    { value: "STRENGTHENING", label: "Strengthening" },
    { value: "MOBILITY", label: "Mobility" },
    { value: "COOLDOWN", label: "Cool-down" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(active ? value.filter((v) => v !== opt.value) : [...value, opt.value])}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Draft exercise model (shared by AI-generated and manual rows) ─────────

interface ExerciseFormShape {
  name: string;
  description: string;
  bodyRegion: string[];
  difficultyLevel: string;
  exercisePhases: string[];
  videoUrl: string;
  isPublic: boolean;
}

function emptyFormShape(): ExerciseFormShape {
  return {
    name: "",
    description: "",
    bodyRegion: [],
    difficultyLevel: "",
    exercisePhases: [],
    videoUrl: "",
    isPublic: true,
  };
}

interface DraftExercise extends ExerciseFormShape {
  draftId: string;
  videoMode: "search" | "paste";
  expanded: boolean;
}

function makeDraft(overrides?: Partial<DraftExercise>): DraftExercise {
  return {
    ...emptyFormShape(),
    draftId: crypto.randomUUID(),
    videoMode: "search",
    expanded: true,
    ...overrides,
  };
}

function CreateExerciseFields({
  form,
  setForm,
}: {
  form: DraftExercise;
  setForm: (updater: DraftExercise | ((prev: DraftExercise) => DraftExercise)) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`ex-name-${form.draftId}`} className="text-xs font-semibold">Name *</Label>
        <Input
          id={`ex-name-${form.draftId}`}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Seated Hip Flexor Stretch"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Body Region</Label>
        <div className="flex flex-wrap gap-1.5">
          {REGIONS.map((r) => {
            const active = form.bodyRegion.includes(r.value);
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setForm((f) => ({
                  ...f,
                  bodyRegion: active ? f.bodyRegion.filter((v) => v !== r.value) : [...f.bodyRegion, r.value],
                }))}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Difficulty</Label>
        <Select value={form.difficultyLevel || "UNSET"} onValueChange={(v) => setForm((f) => ({ ...f, difficultyLevel: (v === "UNSET" ? "" : v) as string }))}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="UNSET">Not set</SelectItem>
            <SelectItem value="BEGINNER">Beginner</SelectItem>
            <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
            <SelectItem value="ADVANCED">Advanced</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Phase(s)</Label>
        <PhaseMultiSelect
          value={form.exercisePhases}
          onChange={(next) => setForm((f) => ({ ...f, exercisePhases: next }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`ex-desc-${form.draftId}`} className="text-xs font-semibold">Description</Label>
        <Textarea
          id={`ex-desc-${form.draftId}`}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Brief description..."
          className="text-sm resize-none h-16"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Video</Label>
        <Tabs value={form.videoMode} onValueChange={(v) => setForm((f) => ({ ...f, videoMode: v as "search" | "paste" }))}>
          <TabsList className="grid grid-cols-2 h-7">
            <TabsTrigger value="search" className="text-xs">Search YouTube</TabsTrigger>
            <TabsTrigger value="paste" className="text-xs">Paste URL</TabsTrigger>
          </TabsList>
          <TabsContent value="search" className="mt-2">
            <YouTubeVideoSearch onSelect={(v) => setForm((f) => ({ ...f, videoUrl: v.videoUrl }))} />
            {form.videoUrl && isYouTubeUrl(form.videoUrl) && (
              <p className="text-xs text-muted-foreground mt-1">Selected: {form.videoUrl}</p>
            )}
          </TabsContent>
          <TabsContent value="paste" className="mt-2">
            <Input
              value={form.videoUrl}
              onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
              placeholder="YouTube or Vimeo URL"
              className="h-8 text-sm"
            />
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Visible to all organizations</p>
          <p className="text-xs text-muted-foreground">When on, this exercise appears in the Universal tab for all organizations</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.isPublic}
          onClick={() => setForm((f) => ({ ...f, isPublic: !f.isPublic }))}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            form.isPublic ? "bg-primary" : "bg-input"
          )}
        >
          <span className={cn(
            "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
            form.isPublic ? "translate-x-4" : "translate-x-0"
          )} />
        </button>
      </div>
    </>
  );
}

function DraftExerciseCard({
  draft,
  index,
  onUpdate,
  onRemove,
  removeDisabled,
}: {
  draft: DraftExercise;
  index: number;
  onUpdate: (updater: DraftExercise | ((prev: DraftExercise) => DraftExercise)) => void;
  onRemove: () => void;
  removeDisabled?: boolean;
}) {
  const isReady = !!draft.name.trim();
  return (
    <div className={cn("rounded-lg border bg-background transition-colors", isReady && "border-green-200")}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
          {index + 1}
        </span>
        <p className="flex-1 truncate text-sm font-medium">{draft.name || "Untitled exercise"}</p>
        {draft.videoUrl && (
          <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
            <Play className="h-2.5 w-2.5" /> Video
          </Badge>
        )}
        <button
          type="button"
          onClick={() => onUpdate((f) => ({ ...f, expanded: !f.expanded }))}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
        >
          {draft.expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={removeDisabled}
          className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:pointer-events-none"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {draft.expanded && (
        <div className="space-y-4 border-t px-3 py-3">
          <CreateExerciseFields form={draft} setForm={onUpdate} />
        </div>
      )}
    </div>
  );
}

interface AiSearchVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  videoUrl: string;
}

function VideoMultiSelectGrid({
  videos,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onPreview,
}: {
  videos: AiSearchVideo[];
  selectedIds: Set<string>;
  onToggle: (videoId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onPreview: (video: AiSearchVideo) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{selectedIds.size}</span> of {videos.length} selected
        </p>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onSelectAll}>Select all</Button>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onDeselectAll}>Deselect all</Button>
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
        {videos.map((v) => {
          const selected = selectedIds.has(v.videoId);
          return (
            <div
              key={v.videoId}
              role="button"
              tabIndex={0}
              onClick={() => onToggle(v.videoId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(v.videoId);
                }
              }}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-muted/50",
                selected && "bg-primary/5"
              )}
            >
              <div className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
              )}>
                {selected && <Check className="h-2.5 w-2.5" />}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onPreview(v); }}
                className="group relative h-9 w-14 shrink-0 overflow-hidden rounded"
                title="Preview video"
              >
                {v.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                  <Play className="h-3.5 w-3.5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{v.title}</p>
                <p className="truncate text-[10px] text-muted-foreground">{v.channelTitle}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ExercisePickerDialog({
  open,
  onOpenChange,
  exercises,
  onSelect,
  organizationOrganizationId,
  exerciseSourcePreference,
}: Props) {
  const [search, setSearch]     = useState("");
  const [phase, setPhase]       = useState<string>("all");
  const [bodyRegions, setRegions] = useState<string[]>([]);
  const [videoPreview, setVideoPreview] = useState<Exercise | null>(null);
  const [videoUrlPreview, setVideoUrlPreview] = useState<{ videoId: string; url: string; title: string } | null>(null);
  const [view, setView] = useState<"list" | "create">("list");
  const [localExercises, setLocalExercises] = useState<Exercise[]>([]);
  const [publicOverrides, setPublicOverrides] = useState<Map<string, boolean>>(new Map());
  const [isPending, startTransition] = useTransition();
  const [createTab, setCreateTab] = useState<"ai" | "manual">("ai");

  const [aiContext, setAiContext] = useState<"CLINICAL" | "PERFORMANCE">("CLINICAL");
  const [aiVideoMode, setAiVideoMode] = useState<"paste" | "search">("search");
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  const [aiSearchVideos, setAiSearchVideos] = useState<AiSearchVideo[]>([]);
  const [aiSelectedVideoIds, setAiSelectedVideoIds] = useState<Set<string>>(new Set());
  const [aiPasteText, setAiPasteText] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiProgress, setAiProgress] = useState({ done: 0, total: 0 });
  const [aiDrafts, setAiDrafts] = useState<DraftExercise[]>([]);

  const [manualDrafts, setManualDrafts] = useState<DraftExercise[]>([makeDraft()]);

  const allExercises = useMemo(
    () => [...exercises, ...localExercises].map((ex) =>
      publicOverrides.has(ex.id) ? { ...ex, isPublic: publicOverrides.get(ex.id) } : ex
    ),
    [exercises, localExercises, publicOverrides]
  );

  const universalExercises = useMemo(
    () => allExercises.filter(
      (ex) => ex.source === "UNIVERSAL" || (ex.source === "ORGANIZATION" && ex.isPublic)
    ),
    [allExercises]
  );

  const myOrganizationExercises = useMemo(
    () => allExercises.filter(
      (ex) => ex.source === "ORGANIZATION" && ex.organizationId === organizationOrganizationId
    ),
    [allExercises, organizationOrganizationId]
  );

  function applyFilters(list: Exercise[]) {
    const q = search.toLowerCase();
    return list.filter((ex) => {
      if (q && !ex.name.toLowerCase().includes(q)) return false;
      if (phase !== "all") {
        const phases = ex.exercisePhases?.length ? ex.exercisePhases : ["STRENGTHENING"];
        if (!phases.includes(phase)) return false;
      }
      if (bodyRegions.length > 0 && !ex.bodyRegion.some((r) => bodyRegions.includes(r))) return false;
      return true;
    });
  }

  const { showUniversal, showOrganization } = resolvePickerTabs(
    exerciseSourcePreference,
    !!organizationOrganizationId
  );

  const mergedExercises = useMemo(
    () => mergeExercisesForPicker(
      showUniversal ? universalExercises : [],
      showOrganization ? myOrganizationExercises : [],
      organizationOrganizationId
    ),
    [universalExercises, myOrganizationExercises, showUniversal, showOrganization, organizationOrganizationId]
  );

  const filteredExercises = useMemo(() => applyFilters(mergedExercises), [mergedExercises, search, phase, bodyRegions]);

  // ── AI search ────────────────────────────────────────────────────────────

  async function runAiSearch() {
    if (!aiSearchQuery.trim()) {
      toast.error("Enter a search term");
      return;
    }
    setAiSearchLoading(true);
    setAiSearchVideos([]);
    setAiSelectedVideoIds(new Set());
    try {
      const res = await fetch(`/api/youtube/search-videos?q=${encodeURIComponent(aiSearchQuery)}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Search failed");
        return;
      }
      setAiSearchVideos(json.videos);
      if (json.total === 0) toast.info("No videos found — try different search terms");
    } catch {
      toast.error("Search failed — try again");
    } finally {
      setAiSearchLoading(false);
    }
  }

  function toggleAiVideoSelection(videoId: string) {
    setAiSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  const aiPastedUrls = useMemo(() => parseYoutubeUrls(aiPasteText), [aiPasteText]);
  const aiSelectedCount = aiVideoMode === "search" ? aiSelectedVideoIds.size : aiPastedUrls.length;

  async function handleGenerateWithAi() {
    const urls = aiVideoMode === "search"
      ? aiSearchVideos.filter((v) => aiSelectedVideoIds.has(v.videoId)).map((v) => v.videoUrl)
      : aiPastedUrls;

    if (!urls.length) {
      toast.error("Select at least one video");
      return;
    }
    if (urls.length > MAX_BATCH_SIZE) {
      toast.error(`Select at most ${MAX_BATCH_SIZE} videos at a time`);
      return;
    }

    setAiGenerating(true);
    setAiProgress({ done: 0, total: urls.length });
    let successCount = 0;

    for (const url of urls) {
      try {
        const res = await fetch("/api/ai/generate-exercise-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeUrl: url, context: aiContext }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(`Skipped one video: ${json.error ?? "generation failed"}`);
          setAiProgress((p) => ({ ...p, done: p.done + 1 }));
          continue;
        }
        const d = json.data;
        setAiDrafts((prev) => [...prev, makeDraft({
          name: d.exerciseName ?? "",
          description: d.description ?? "",
          bodyRegion: d.bodyRegion ?? [],
          difficultyLevel: d.difficultyLevel ?? "",
          exercisePhases: d.exercisePhases ?? [],
          videoUrl: d.videoUrl ?? url,
          isPublic: true,
        })]);
        successCount++;
      } catch {
        toast.error("Failed to generate one exercise — skipped");
      }
      setAiProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setAiGenerating(false);
    setAiProgress({ done: 0, total: 0 });

    if (successCount > 0) {
      toast.success(`${successCount} exercise${successCount === 1 ? "" : "s"} generated — review below`);
      setAiSearchVideos([]);
      setAiSelectedVideoIds(new Set());
      setAiSearchQuery("");
      setAiPasteText("");
    }
  }

  function updateAiDraft(draftId: string, updater: DraftExercise | ((prev: DraftExercise) => DraftExercise)) {
    setAiDrafts((prev) => prev.map((d) => {
      if (d.draftId !== draftId) return d;
      return typeof updater === "function" ? updater(d) : updater;
    }));
  }

  function removeAiDraft(draftId: string) {
    setAiDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
  }

  function updateManualDraft(draftId: string, updater: DraftExercise | ((prev: DraftExercise) => DraftExercise)) {
    setManualDrafts((prev) => prev.map((d) => {
      if (d.draftId !== draftId) return d;
      return typeof updater === "function" ? updater(d) : updater;
    }));
  }

  function addManualDraft() {
    setManualDrafts((prev) => [...prev, makeDraft()]);
  }

  function removeManualDraft(draftId: string) {
    setManualDrafts((prev) => prev.length > 1 ? prev.filter((d) => d.draftId !== draftId) : prev);
  }

  function handleClose() {
    setView("list");
    setCreateTab("ai");
    setAiContext("CLINICAL");
    setAiVideoMode("search");
    setAiSearchQuery("");
    setAiSearchVideos([]);
    setAiSelectedVideoIds(new Set());
    setAiPasteText("");
    setAiDrafts([]);
    setManualDrafts([makeDraft()]);
    onOpenChange(false);
  }

  function handleTogglePublic(ex: Exercise, next: boolean) {
    startTransition(async () => {
      const result = await toggleExercisePublicAction(ex.id, next);
      if (result.success) {
        setPublicOverrides((prev) => new Map(prev).set(ex.id, next));
        setLocalExercises((prev) =>
          prev.map((e) => e.id === ex.id ? { ...e, isPublic: next } : e)
        );
        toast.success(next ? "Exercise is now public" : "Exercise is now private");
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleCreateBatch(drafts: DraftExercise[]) {
    const ready = drafts.filter((d) => d.name.trim());
    if (!ready.length) {
      toast.error("Add a name to at least one exercise");
      return;
    }

    startTransition(async () => {
      const results = await Promise.all(ready.map((d) =>
        createOrganizationExerciseAction({
          name: d.name,
          description: d.description || undefined,
          bodyRegion: d.bodyRegion.length ? d.bodyRegion : undefined,
          difficultyLevel: d.difficultyLevel || undefined,
          exercisePhases: d.exercisePhases,
          videoUrl: d.videoUrl || undefined,
          isPublic: d.isPublic,
        })
      ));

      const created: Exercise[] = [];
      let failureCount = 0;
      results.forEach((result, i) => {
        if (result.success) {
          created.push({
            id: result.data.id,
            name: result.data.name,
            bodyRegion: result.data.bodyRegion,
            difficultyLevel: result.data.difficultyLevel || "",
            exercisePhases: result.data.exercisePhases ?? [],
            videoUrl: result.data.videoUrl ?? null,
            videoProvider: result.data.videoProvider ?? null,
            description: result.data.description ?? null,
            source: "ORGANIZATION",
            organizationId: result.data.organizationId ?? null,
            isPublic: result.data.isPublic,
          });
        } else {
          failureCount++;
          toast.error(`"${ready[i].name}": ${result.error}`);
        }
      });

      if (created.length) {
        setLocalExercises((prev) => [...prev, ...created]);
        created.forEach((ex) => onSelect(ex));
        toast.success(
          `${created.length} exercise${created.length === 1 ? "" : "s"} created and added to program` +
          (failureCount ? ` (${failureCount} failed)` : "")
        );
        handleClose();
      }
    });
  }

  const activeDrafts = createTab === "ai" ? aiDrafts : manualDrafts;
  const readyCount = activeDrafts.filter((d) => d.name.trim()).length;

  function handleSubmitCurrentTab() {
    if (createTab === "ai") handleCreateBatch(aiDrafts);
    else handleCreateBatch(manualDrafts);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-3xl h-[88vh] flex flex-col gap-0 p-0 overflow-hidden" showCloseButton={false}>
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between gap-2">
              {view === "create" ? (
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Create New Exercise
                </button>
              ) : (
                <DialogTitle>Add Exercise</DialogTitle>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                {view === "list" && organizationOrganizationId && (
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setView("create")}>
                    <Plus className="h-3.5 w-3.5" />
                    Create New
                  </Button>
                )}
                <Button type="button" variant="ghost" size="icon-sm" onClick={handleClose}>
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
            </div>
          </DialogHeader>

          {view === "create" ? (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as "ai" | "manual")}>
                  <TabsList className="grid grid-cols-2 mb-4">
                    <TabsTrigger value="ai">AI Generate</TabsTrigger>
                    <TabsTrigger value="manual">Manual</TabsTrigger>
                  </TabsList>

                  <TabsContent value="ai" className="mt-0 space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Exercise Context</Label>
                      <div className="flex gap-1 rounded-md border bg-muted/40 p-1 w-fit">
                        <button
                          type="button"
                          onClick={() => setAiContext("CLINICAL")}
                          className={cn(
                            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                            aiContext === "CLINICAL" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Rehab / Clinical
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiContext("PERFORMANCE")}
                          className={cn(
                            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                            aiContext === "PERFORMANCE" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Athletic / Performance
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Video(s)</Label>
                      <p className="text-xs text-muted-foreground">
                        Select multiple videos below, then generate exercise details for all of them at once.
                      </p>
                      <Tabs value={aiVideoMode} onValueChange={(v) => setAiVideoMode(v as "paste" | "search")}>
                        <TabsList className="grid grid-cols-2 h-7">
                          <TabsTrigger value="search" className="text-xs">Search YouTube</TabsTrigger>
                          <TabsTrigger value="paste" className="text-xs">Paste URLs</TabsTrigger>
                        </TabsList>
                        <TabsContent value="search" className="mt-2 space-y-2">
                          <div className="flex gap-2">
                            <Input
                              value={aiSearchQuery}
                              onChange={(e) => setAiSearchQuery(e.target.value)}
                              placeholder="e.g. Single Leg RDL"
                              className="h-8 text-sm flex-1"
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runAiSearch(); } }}
                            />
                            <Button type="button" size="sm" className="h-8 text-xs shrink-0" disabled={aiSearchLoading} onClick={runAiSearch}>
                              <Search className="h-3.5 w-3.5 mr-1" />
                              {aiSearchLoading ? "Searching..." : "Search"}
                            </Button>
                          </div>
                          {aiSearchVideos.length > 0 && (
                            <VideoMultiSelectGrid
                              videos={aiSearchVideos}
                              selectedIds={aiSelectedVideoIds}
                              onToggle={toggleAiVideoSelection}
                              onSelectAll={() => setAiSelectedVideoIds(new Set(aiSearchVideos.map((v) => v.videoId)))}
                              onDeselectAll={() => setAiSelectedVideoIds(new Set())}
                              onPreview={(v) => setVideoUrlPreview({ videoId: v.videoId, url: v.videoUrl, title: v.title })}
                            />
                          )}
                        </TabsContent>
                        <TabsContent value="paste" className="mt-2 space-y-1.5">
                          <Textarea
                            value={aiPasteText}
                            onChange={(e) => setAiPasteText(e.target.value)}
                            placeholder={"https://www.youtube.com/watch?v=abc123\nhttps://youtu.be/def456"}
                            rows={4}
                            className="font-mono text-xs resize-none"
                          />
                          <p className="text-xs text-muted-foreground">
                            {aiPastedUrls.length > 0
                              ? <span className="text-foreground font-medium">{aiPastedUrls.length} valid YouTube URL{aiPastedUrls.length === 1 ? "" : "s"} detected</span>
                              : "One URL per line"}
                          </p>
                        </TabsContent>
                      </Tabs>

                      {aiSelectedCount > MAX_BATCH_SIZE && (
                        <p className="text-xs text-destructive">Select at most {MAX_BATCH_SIZE} videos at a time.</p>
                      )}

                      <Button
                        type="button"
                        size="sm"
                        className="h-8 text-xs w-full"
                        disabled={aiSelectedCount === 0 || aiSelectedCount > MAX_BATCH_SIZE || aiGenerating}
                        onClick={handleGenerateWithAi}
                      >
                        {aiGenerating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                        {aiGenerating
                          ? `Generating ${aiProgress.done + 1} of ${aiProgress.total}…`
                          : `Generate ${aiSelectedCount > 0 ? aiSelectedCount : ""} Exercise${aiSelectedCount === 1 ? "" : "s"} with AI`}
                      </Button>
                      {aiGenerating && (
                        <Progress value={aiProgress.total > 0 ? Math.round((aiProgress.done / aiProgress.total) * 100) : 0} className="h-1.5" />
                      )}
                    </div>

                    {aiDrafts.length > 0 && (
                      <div className="space-y-2 pt-2 border-t">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {aiDrafts.length} exercise{aiDrafts.length === 1 ? "" : "s"} to review
                        </p>
                        <div className="space-y-2">
                          {aiDrafts.map((draft, index) => (
                            <DraftExerciseCard
                              key={draft.draftId}
                              draft={draft}
                              index={index}
                              onUpdate={(updater) => updateAiDraft(draft.draftId, updater)}
                              onRemove={() => removeAiDraft(draft.draftId)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="manual" className="mt-0 space-y-3">
                    {manualDrafts.map((draft, index) => (
                      <DraftExerciseCard
                        key={draft.draftId}
                        draft={draft}
                        index={index}
                        onUpdate={(updater) => updateManualDraft(draft.draftId, updater)}
                        onRemove={() => removeManualDraft(draft.draftId)}
                        removeDisabled={manualDrafts.length === 1}
                      />
                    ))}
                    <Button type="button" variant="outline" size="sm" className="w-full h-8 text-xs gap-1" onClick={addManualDraft}>
                      <Plus className="h-3.5 w-3.5" />
                      Add Another Exercise
                    </Button>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="flex shrink-0 gap-2 border-t bg-background px-4 py-3">
                <Button type="button" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setView("list")}>Cancel</Button>
                <Button type="button" className="flex-1 h-8 text-xs" disabled={isPending || readyCount === 0} onClick={handleSubmitCurrentTab}>
                  {isPending
                    ? "Creating..."
                    : `Create ${readyCount > 0 ? readyCount : ""} Exercise${readyCount === 1 ? "" : "s"} & Add to Program`}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <FilterBar
                search={search}
                setSearch={setSearch}
                phase={phase}
                setPhase={setPhase}
                bodyRegions={bodyRegions}
                setRegions={setRegions}
              />
              <ExerciseList
                list={filteredExercises}
                organizationOrganizationId={organizationOrganizationId}
                phase={phase}
                setPhase={setPhase}
                bodyRegions={bodyRegions}
                setRegions={setRegions}
                onSelect={onSelect}
                onClose={handleClose}
                onPreview={setVideoPreview}
                onTogglePublic={handleTogglePublic}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!videoPreview} onOpenChange={(o) => { if (!o) setVideoPreview(null); }}>
        <DialogContent className="sm:max-w-2xl gap-0 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="font-semibold text-sm truncate pr-4">{videoPreview?.name}</p>
            <button onClick={() => setVideoPreview(null)} className="shrink-0 rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="w-full bg-black">
            {videoPreview?.videoUrl && (
              <UniversalVideoPlayer url={videoPreview.videoUrl} provider={videoPreview.videoProvider} autoPlay />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!videoUrlPreview} onOpenChange={(o) => { if (!o) setVideoUrlPreview(null); }}>
        <DialogContent className="sm:max-w-2xl gap-0 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="font-semibold text-sm truncate pr-4">{videoUrlPreview?.title}</p>
            <button onClick={() => setVideoUrlPreview(null)} className="shrink-0 rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="w-full bg-black">
            {videoUrlPreview?.url && (
              <UniversalVideoPlayer url={videoUrlPreview.url} autoPlay />
            )}
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t">
            <Button type="button" variant="outline" size="sm" onClick={() => setVideoUrlPreview(null)}>
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (videoUrlPreview) toggleAiVideoSelection(videoUrlPreview.videoId);
                setVideoUrlPreview(null);
              }}
            >
              {videoUrlPreview && aiSelectedVideoIds.has(videoUrlPreview.videoId) ? "Deselect video" : "Select video"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
