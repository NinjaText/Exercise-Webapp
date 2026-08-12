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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Play, X, Plus, ArrowLeft, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";
import { YouTubeVideoSearch } from "@/components/exercises/youtube-video-search";
import { createOrganizationExerciseAction, toggleExercisePublicAction } from "@/actions/exercise-actions";
import { isYouTubeUrl, hasRealVideoUrl } from "@/lib/utils/video";
import { toast } from "sonner";
import { resolvePickerTabs, type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";

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
  showOrganizationControls?: boolean;
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
  showOrganizationControls,
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
        {list.map((ex) => (
          <button key={ex.id} type="button"
            className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-muted/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => { onSelect(ex); onClose(); }}
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
                  {showOrganizationControls && ex.source === "ORGANIZATION" && (
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
          </button>
        ))}

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

function emptyFormShape() {
  return {
    name: "",
    description: "",
    bodyRegion: [] as string[],
    difficultyLevel: "",
    exercisePhases: [] as string[],
    videoUrl: "",
    isPublic: true,
  };
}

function CreateExerciseFields({
  form,
  setForm,
}: {
  form: ReturnType<typeof emptyFormShape>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyFormShape>>>;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ex-name" className="text-xs font-semibold">Name *</Label>
        <Input
          id="ex-name"
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
        <Label htmlFor="ex-desc" className="text-xs font-semibold">Description</Label>
        <Textarea
          id="ex-desc"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Brief description..."
          className="text-sm resize-none h-16"
        />
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
  const [view, setView] = useState<"list" | "create">("list");
  const [localExercises, setLocalExercises] = useState<Exercise[]>([]);
  const [publicOverrides, setPublicOverrides] = useState<Map<string, boolean>>(new Map());
  const [isPending, startTransition] = useTransition();
  const [createTab, setCreateTab] = useState<"ai" | "manual">("ai");

  const [aiForm, setAiForm] = useState(emptyFormShape());
  const [aiVideoUrl, setAiVideoUrl] = useState("");
  const [aiVideoMode, setAiVideoMode] = useState<"paste" | "search">("search");
  const [aiContext, setAiContext] = useState<"CLINICAL" | "PERFORMANCE">("CLINICAL");
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);

  const [manualForm, setManualForm] = useState(emptyFormShape());
  const [manualVideoMode, setManualVideoMode] = useState<"paste" | "search">("search");

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

  const filteredUniversal = useMemo(() => applyFilters(universalExercises), [universalExercises, search, phase, bodyRegions]);
  const filteredMyOrganization  = useMemo(() => applyFilters(myOrganizationExercises),  [myOrganizationExercises,  search, phase, bodyRegions]);

  const { showUniversal, showOrganization } = resolvePickerTabs(
    exerciseSourcePreference,
    !!organizationOrganizationId
  );

  async function handleGenerateWithAi() {
    setAiStatus("loading");
    setAiError(null);
    try {
      const res = await fetch("/api/ai/generate-exercise-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: aiVideoUrl, context: aiContext }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to generate exercise metadata");
      }
      const d = json.data;
      setAiForm({
        name: d.exerciseName ?? "",
        description: d.description ?? "",
        bodyRegion: d.bodyRegion ?? [],
        difficultyLevel: d.difficultyLevel ?? "",
        exercisePhases: d.exercisePhases ?? [],
        videoUrl: d.videoUrl ?? aiVideoUrl,
        isPublic: true,
      });
      setAiStatus("done");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Failed to generate exercise metadata");
      setAiStatus("error");
    }
  }

  function handleClose() {
    setView("list");
    setCreateTab("ai");
    setAiForm(emptyFormShape());
    setAiVideoUrl("");
    setAiContext("CLINICAL");
    setAiStatus("idle");
    setAiError(null);
    setManualForm(emptyFormShape());
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const form = createTab === "ai" ? aiForm : manualForm;
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    startTransition(async () => {
      const result = await createOrganizationExerciseAction({
        name: form.name,
        description: form.description || undefined,
        bodyRegion: form.bodyRegion.length ? form.bodyRegion : undefined,
        difficultyLevel: form.difficultyLevel || undefined,
        exercisePhases: form.exercisePhases,
        videoUrl: form.videoUrl || undefined,
        isPublic: form.isPublic,
      });

      if (result.success) {
        const newEx: Exercise = {
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
        };
        setLocalExercises((prev) => [...prev, newEx]);
        toast.success("Exercise created and added");
        onSelect(newEx);
        handleClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xl h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between">
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
              {view === "list" && organizationOrganizationId && (
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setView("create")}>
                  <Plus className="h-3.5 w-3.5" />
                  Create New
                </Button>
              )}
            </div>
          </DialogHeader>

          {view === "create" ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as "ai" | "manual")}>
                <TabsList className="grid grid-cols-2 mb-4">
                  <TabsTrigger value="ai">AI Generate</TabsTrigger>
                  <TabsTrigger value="manual">Manual</TabsTrigger>
                </TabsList>

                <TabsContent value="ai" className="mt-0">
                  <form onSubmit={handleCreate} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Exercise Context</Label>
                      <div className="flex gap-1 rounded-md border bg-muted/40 p-1 w-fit">
                        <button
                          type="button"
                          onClick={() => setAiContext("CLINICAL")}
                          className={[
                            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                            aiContext === "CLINICAL" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                          ].join(" ")}
                        >
                          Rehab / Clinical
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiContext("PERFORMANCE")}
                          className={[
                            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                            aiContext === "PERFORMANCE" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                          ].join(" ")}
                        >
                          Athletic / Performance
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Video</Label>
                      <Tabs value={aiVideoMode} onValueChange={(v) => setAiVideoMode(v as "paste" | "search")}>
                        <TabsList className="grid grid-cols-2 h-7">
                          <TabsTrigger value="search" className="text-xs">Search YouTube</TabsTrigger>
                          <TabsTrigger value="paste" className="text-xs">Paste URL</TabsTrigger>
                        </TabsList>
                        <TabsContent value="search" className="mt-2">
                          <YouTubeVideoSearch
                            onSelect={(v) => setAiVideoUrl(v.videoUrl)}
                          />
                          {aiVideoUrl && isYouTubeUrl(aiVideoUrl) && (
                            <p className="text-xs text-muted-foreground mt-1">Selected: {aiVideoUrl}</p>
                          )}
                        </TabsContent>
                        <TabsContent value="paste" className="mt-2">
                          <Input
                            id="ai-video"
                            value={aiVideoUrl}
                            onChange={(e) => setAiVideoUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="h-8 text-sm"
                          />
                        </TabsContent>
                      </Tabs>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 text-xs w-full"
                        disabled={!isYouTubeUrl(aiVideoUrl) || aiStatus === "loading"}
                        onClick={handleGenerateWithAi}
                      >
                        {aiStatus === "loading" ? "Generating..." : "Generate with AI"}
                      </Button>
                      {aiStatus === "error" && (
                        <p className="text-xs text-destructive">{aiError} — check the link and try again.</p>
                      )}
                    </div>

                    {aiStatus === "done" && (
                      <>
                        <CreateExerciseFields form={aiForm} setForm={setAiForm} />
                        <div className="flex gap-2 pt-2">
                          <Button type="button" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setView("list")}>Cancel</Button>
                          <Button type="submit" className="flex-1 h-8 text-xs" disabled={isPending}>
                            {isPending ? "Creating..." : "Create & Add to Program"}
                          </Button>
                        </div>
                      </>
                    )}
                  </form>
                </TabsContent>

                <TabsContent value="manual" className="mt-0">
                  <form onSubmit={handleCreate} className="space-y-4">
                    <CreateExerciseFields form={manualForm} setForm={setManualForm} />
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Video</Label>
                      <Tabs value={manualVideoMode} onValueChange={(v) => setManualVideoMode(v as "paste" | "search")}>
                        <TabsList className="grid grid-cols-2 h-7">
                          <TabsTrigger value="search" className="text-xs">Search YouTube</TabsTrigger>
                          <TabsTrigger value="paste" className="text-xs">Paste URL</TabsTrigger>
                        </TabsList>
                        <TabsContent value="search" className="mt-2">
                          <YouTubeVideoSearch
                            onSelect={(v) => setManualForm((f) => ({ ...f, videoUrl: v.videoUrl }))}
                          />
                          {manualForm.videoUrl && (
                            <p className="text-xs text-muted-foreground mt-1">Selected: {manualForm.videoUrl}</p>
                          )}
                        </TabsContent>
                        <TabsContent value="paste" className="mt-2">
                          <Input
                            id="ex-video"
                            value={manualForm.videoUrl}
                            onChange={(e) => setManualForm((f) => ({ ...f, videoUrl: e.target.value }))}
                            placeholder="YouTube or Vimeo URL"
                            className="h-8 text-sm"
                          />
                        </TabsContent>
                      </Tabs>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button type="button" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setView("list")}>Cancel</Button>
                      <Button type="submit" className="flex-1 h-8 text-xs" disabled={isPending}>
                        {isPending ? "Creating..." : "Create & Add to Program"}
                      </Button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
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
              {showUniversal && showOrganization ? (
                <Tabs defaultValue="universal" className="flex flex-col flex-1 overflow-hidden">
                  <TabsList className="shrink-0 mx-4 mt-2 mb-1 h-8 text-xs">
                    <TabsTrigger value="universal" className="flex-1 text-xs h-6">Universal</TabsTrigger>
                    <TabsTrigger value="my-organization" className="flex-1 text-xs h-6">My Organization</TabsTrigger>
                  </TabsList>
                  <TabsContent value="universal" className="flex-1 overflow-hidden flex flex-col mt-0">
                    <ExerciseList
                      list={filteredUniversal}
                      phase={phase}
                      setPhase={setPhase}
                      bodyRegions={bodyRegions}
                      setRegions={setRegions}
                      onSelect={onSelect}
                      onClose={handleClose}
                      onPreview={setVideoPreview}
                      onTogglePublic={handleTogglePublic}
                    />
                  </TabsContent>
                  <TabsContent value="my-organization" className="flex-1 overflow-hidden flex flex-col mt-0">
                    <ExerciseList
                      list={filteredMyOrganization}
                      showOrganizationControls
                      phase={phase}
                      setPhase={setPhase}
                      bodyRegions={bodyRegions}
                      setRegions={setRegions}
                      onSelect={onSelect}
                      onClose={handleClose}
                      onPreview={setVideoPreview}
                      onTogglePublic={handleTogglePublic}
                    />
                  </TabsContent>
                </Tabs>
              ) : showOrganization ? (
                <ExerciseList
                  list={filteredMyOrganization}
                  showOrganizationControls
                  phase={phase}
                  setPhase={setPhase}
                  bodyRegions={bodyRegions}
                  setRegions={setRegions}
                  onSelect={onSelect}
                  onClose={handleClose}
                  onPreview={setVideoPreview}
                  onTogglePublic={handleTogglePublic}
                />
              ) : (
                <ExerciseList
                  list={filteredUniversal}
                  phase={phase}
                  setPhase={setPhase}
                  bodyRegions={bodyRegions}
                  setRegions={setRegions}
                  onSelect={onSelect}
                  onClose={handleClose}
                  onPreview={setVideoPreview}
                  onTogglePublic={handleTogglePublic}
                />
              )}
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
    </>
  );
}
