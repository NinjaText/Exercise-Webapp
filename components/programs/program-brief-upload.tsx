"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  generateProgramBriefUploadUrlAction,
  extractProgramMetadataFromBriefAction,
  extractProgramChunksAction,
  matchProgramExercisesAction,
  saveGeneratedProgramAction,
} from "@/actions/program-actions";
import type { BriefMetadata, ProgramBriefParsed } from "@/lib/services/program-brief.service";
import type { PreviewWorkout, PreviewExercise } from "@/lib/services/ai.service";
import { MissingFieldsDialog, type MissingFieldsValues } from "@/components/programs/missing-fields-dialog";
import { FlaggedExerciseRow } from "@/components/programs/flagged-exercise-row";
import { ExercisePickerDialog } from "@/components/programs/exercise-picker-dialog";
import type { ExerciseSourcePreference } from "@/lib/utils/exercise-picker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";

const NO_CLIENT_VALUE = "__none__";

interface PickerExercise {
  id: string;
  name: string;
  bodyRegion: string[];
  difficultyLevel: string | null;
  defaultReps: number | null;
  musclesTargeted: string[];
  description: string | null;
  videoUrl: string | null;
  videoProvider: string | null;
  exercisePhases: string[];
  source: string;
  organizationId: string | null;
  isPublic: boolean;
}

interface Props {
  clients: { id: string; firstName: string; lastName: string }[];
  exercises: PickerExercise[];
  organizationOrganizationId?: string | null;
  exerciseSourcePreference?: ExerciseSourcePreference;
}

type PreviewState = {
  aiPlan: { name: string; description?: string; workouts: PreviewWorkout[] };
  params: Record<string, unknown>;
  parsed: {
    programTitle: string;
    focusAreas: string[];
    difficultyLevel: string;
    durationMinutes: number;
    daysPerWeek: number;
    preferredWeekdays: string[];
    circuits: { name: string; focusType: string; exerciseCount: number }[];
    inferredFields?: string[];
  };
  warnings: string[];
};

type Resolution = { exerciseId: string; exerciseName: string } | { skip: true };

type Stage = "idle" | "reading" | "extracting" | "matching" | "ready";

const STAGE_ORDER: Stage[] = ["reading", "extracting", "matching"];
const STAGE_LABELS: Record<string, string> = {
  reading: "Reading document",
  extracting: "Extracting weeks & sessions",
  matching: "Matching exercises",
};

const DIFFICULTY_OPTIONS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

// Schedule is deliberately NOT in here — it gets baked into the generated
// program's day assignments during generation, so it must be confirmed
// BEFORE generation (see the missing-fields dialog), not edited after the fact.
type EditableFields = {
  programTitle: string;
  difficultyLevel: string;
  durationMinutes: string;
  focusAreas: string;
};

function toEditableFields(parsed: PreviewState["parsed"]): EditableFields {
  return {
    programTitle: parsed.programTitle,
    difficultyLevel: parsed.difficultyLevel,
    durationMinutes: String(parsed.durationMinutes),
    focusAreas: parsed.focusAreas.join(", "),
  };
}

type PendingMetadata = {
  rawText: string;
  metadata: BriefMetadata;
  missingRequiredFields: string[];
};

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

function formatFileName(name: string) {
  return name.length > 48 ? `${name.slice(0, 45)}...` : name;
}

function isAllowedFile(file: File) {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function flagKey(workoutIdx: number, blockIdx: number, exIdx: number) {
  return `${workoutIdx}-${blockIdx}-${exIdx}`;
}

function normalizeExerciseName(name: string | undefined) {
  return (name ?? "").trim().toLowerCase();
}

function ProgressStepper({ stage }: { stage: Stage }) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  if (currentIndex === -1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {STAGE_ORDER.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-1.5",
              i < currentIndex ? "text-emerald-600" : i === currentIndex ? "font-medium text-blue-600" : "text-muted-foreground"
            )}
          >
            {i < currentIndex ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : i === currentIndex ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="h-4 w-4 rounded-full border" />
            )}
            {STAGE_LABELS[s]}
          </div>
          {i < STAGE_ORDER.length - 1 && <div className="h-px w-6 bg-border" />}
        </div>
      ))}
    </div>
  );
}

export function ProgramBriefUpload({
  clients,
  exercises,
  organizationOrganizationId,
  exerciseSourcePreference,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [editableFields, setEditableFields] = useState<EditableFields | null>(null);
  const [pendingMetadata, setPendingMetadata] = useState<PendingMetadata | null>(null);
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map());
  const [applyToAllKeys, setApplyToAllKeys] = useState<Set<string>>(new Set());
  const [pendingApplyAll, setPendingApplyAll] = useState<{
    key: string;
    resolution: Resolution;
    matches: string[];
    exerciseName: string;
  } | null>(null);
  const [resolverKey, setResolverKey] = useState<string | null>(null);
  const [confirmedInferredFields, setConfirmedInferredFields] = useState<Set<string>>(new Set());
  // Single-open accordion: null means every week is collapsed. A week index
  // (not a Set) so opening one week always closes whichever other week was open.
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [assignClientId, setAssignClientId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState<"template" | "assign" | null>(null);

  const flaggedSlots = useMemo(() => {
    if (!preview) return [];
    const slots: { key: string; exercise: PreviewExercise }[] = [];
    preview.aiPlan.workouts.forEach((w, wi) =>
      w.blocks.forEach((b, bi) =>
        b.exercises.forEach((e, ei) => {
          if (e.flags && e.flags.length > 0) {
            slots.push({ key: flagKey(wi, bi, ei), exercise: e });
          }
        })
      )
    );
    return slots;
  }, [preview]);

  const unresolvedCount = flaggedSlots.filter((s) => !resolutions.has(s.key)).length;

  // Groups flagged slots by normalized exercise name so a resolution made on
  // one occurrence can optionally be propagated to every other occurrence of
  // the same exercise elsewhere in the plan (see applyResolution below).
  const flaggedByName = useMemo(() => {
    const map = new Map<string, string[]>();
    flaggedSlots.forEach(({ key, exercise }) => {
      const norm = normalizeExerciseName(exercise.exerciseName);
      if (!norm) return;
      if (!map.has(norm)) map.set(norm, []);
      map.get(norm)!.push(key);
    });
    return map;
  }, [flaggedSlots]);

  function otherUnresolvedMatches(key: string, exerciseName: string | undefined) {
    const norm = normalizeExerciseName(exerciseName);
    if (!norm) return [];
    return (flaggedByName.get(norm) ?? []).filter((k) => k !== key && !resolutions.has(k));
  }

  // Groups sessions by week for the accordion, while keeping each session's
  // original index into preview.aiPlan.workouts — flagKey/resolutions/flaggedSlots
  // are all keyed off that flat index, so it must survive the regrouping.
  const weekGroups = useMemo(() => {
    if (!preview) return [];
    const byWeek = new Map<number, { workout: PreviewWorkout; index: number }[]>();
    preview.aiPlan.workouts.forEach((workout, index) => {
      const week = workout.weekIndex;
      if (!byWeek.has(week)) byWeek.set(week, []);
      byWeek.get(week)!.push({ workout, index });
    });
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a - b)
      .map(([weekIndex, items]) => ({
        weekIndex,
        items: [...items].sort((a, b) => a.workout.dayIndex - b.workout.dayIndex),
      }));
  }, [preview]);

  function toggleWeek(weekIndex: number) {
    setExpandedWeek((prev) => (prev === weekIndex ? null : weekIndex));
  }

  function sessionDayLabel(workout: PreviewWorkout) {
    return preview?.parsed.preferredWeekdays?.[workout.dayIndex] ?? `Day ${workout.dayIndex + 1}`;
  }

  const inferredFieldsSet = useMemo(
    () => new Set(preview?.parsed.inferredFields ?? []),
    [preview]
  );
  const unconfirmedInferredCount = useMemo(
    () => Array.from(inferredFieldsSet).filter((f) => !confirmedInferredFields.has(f)).length,
    [inferredFieldsSet, confirmedInferredFields]
  );

  function confirmInferredField(field: string) {
    setConfirmedInferredFields((prev) => new Set(prev).add(field));
  }

  // MissingFieldsDialog resets its local state whenever `initialValues`
  // changes identity while open — memoizing here (keyed on pendingMetadata,
  // which only changes once per upload cycle) keeps that identity stable
  // across unrelated re-renders so the trainer's in-progress edits in the
  // dialog are never silently discarded.
  const missingFieldsInitialValues = useMemo(() => {
    if (!pendingMetadata) return null;
    return {
      programTitle: pendingMetadata.metadata.programTitle,
      daysPerWeek: pendingMetadata.metadata.estimatedDaysPerWeek,
      preferredWeekdays: pendingMetadata.metadata.preferredWeekdays,
    };
  }, [pendingMetadata]);

  function handleFileChange(files: FileList | null) {
    if (!files || !files.length) return;
    const next = files[0];
    if (!isAllowedFile(next)) {
      toast.error("Only PDF, DOCX, TXT, or Markdown files are supported");
      return;
    }
    setFile(next);
    setPreview(null);
    setPendingMetadata(null);
    setResolutions(new Map());
    setApplyToAllKeys(new Set());
  }

  async function runExtractionAndMatching(rawText: string, metadata: BriefMetadata) {
    setStage("extracting");
    const chunksResult = await extractProgramChunksAction({ rawText, metadata });
    if (!chunksResult.success || !chunksResult.data) {
      toast.error(chunksResult.error ?? "Failed to extract program structure");
      setStage("idle");
      return;
    }

    setStage("matching");
    const matchResult = await matchProgramExercisesAction({ brief: chunksResult.data as ProgramBriefParsed });
    if (!matchResult.success || !matchResult.data) {
      toast.error(matchResult.error ?? "Failed to match exercises");
      setStage("idle");
      return;
    }

    setPreview({
      aiPlan: matchResult.data.preview,
      params: matchResult.data.params,
      parsed: matchResult.data.parsed,
      warnings: matchResult.data.warnings,
    });
    setEditableFields(toEditableFields(matchResult.data.parsed));
    setResolutions(new Map());
    setApplyToAllKeys(new Set());
    setConfirmedInferredFields(new Set());
    setExpandedWeek(null);
    setStage("ready");
    toast.success("Preview generated");
  }

  async function handleUploadAndGenerate() {
    if (!file) return;

    setStage("reading");
    try {
      const extension = file.name.toLowerCase().split(".").pop() ?? "";
      const presignResult = await generateProgramBriefUploadUrlAction(extension);
      if (!presignResult.success || !presignResult.data) {
        toast.error(presignResult.error ?? "Failed to get upload URL");
        setStage("idle");
        return;
      }
      const { presignedUrl, fileUrl, contentType } = presignResult.data;

      const uploadResp = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
      });
      if (!uploadResp.ok) {
        toast.error("Upload to storage failed. Please try again.");
        setStage("idle");
        return;
      }

      const metaResult = await extractProgramMetadataFromBriefAction({
        fileUrl,
        fileName: file.name,
      });
      if (!metaResult.success || !metaResult.data) {
        toast.error(metaResult.error ?? "Failed to read this document");
        setStage("idle");
        return;
      }

      const { metadata, rawText, missingRequiredFields } = metaResult.data;

      if (missingRequiredFields.length > 0) {
        setPendingMetadata({ rawText, metadata, missingRequiredFields });
        setStage("idle");
        return;
      }

      await runExtractionAndMatching(rawText, metadata);
    } catch (err) {
      console.error("[program-brief-upload]", err);
      toast.error("Upload failed. Please try again.");
      setStage("idle");
    }
  }

  async function handleMissingFieldsConfirm(values: MissingFieldsValues) {
    if (!pendingMetadata) return;
    const confirmedMetadata: BriefMetadata = {
      ...pendingMetadata.metadata,
      programTitle: values.programTitle || pendingMetadata.metadata.programTitle,
      preferredWeekdays: values.preferredWeekdays,
      estimatedDaysPerWeek: values.daysPerWeek,
      inferredFields: pendingMetadata.metadata.inferredFields.filter(
        (f) => !["programTitle", "preferredWeekdays", "estimatedDaysPerWeek"].includes(f)
      ),
    };
    const rawText = pendingMetadata.rawText;
    setPendingMetadata(null);
    try {
      await runExtractionAndMatching(rawText, confirmedMetadata);
    } catch (err) {
      console.error("[program-brief-upload]", err);
      toast.error("Failed to process document. Please try again.");
      setStage("idle");
    }
  }

  // Resolves `key`, and — when that slot's "apply to all" checkbox is
  // checked — every other still-unresolved slot sharing the same exercise
  // name, so a trainer can fix one occurrence of a repeated exercise once
  // instead of hunting down every block/week it appears in. Propagating to
  // other slots is a multi-exercise change, so it's gated behind an
  // explicit confirmation instead of applying immediately.
  function applyResolution(key: string, resolution: Resolution, exerciseName: string | undefined) {
    const matches = applyToAllKeys.has(key) ? otherUnresolvedMatches(key, exerciseName) : [];
    if (matches.length > 0) {
      setPendingApplyAll({ key, resolution, matches, exerciseName: exerciseName ?? "this exercise" });
      return;
    }
    setResolutions((prev) => new Map(prev).set(key, resolution));
  }

  function confirmApplyAll() {
    if (!pendingApplyAll) return;
    const { key, resolution, matches } = pendingApplyAll;
    setResolutions((prev) => {
      const next = new Map(prev);
      next.set(key, resolution);
      matches.forEach((k) => next.set(k, resolution));
      return next;
    });
    setApplyToAllKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    toast.success(`Applied to ${matches.length + 1} matching exercises`);
    setPendingApplyAll(null);
  }

  function setApplyToAll(key: string, checked: boolean) {
    setApplyToAllKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function confirmSuggestion(key: string, exercise: PreviewExercise) {
    if (!exercise.exerciseId) return;
    applyResolution(key, { exerciseId: exercise.exerciseId, exerciseName: exercise.exerciseName ?? "" }, exercise.exerciseName);
  }

  function skipSlot(key: string, exercise: PreviewExercise) {
    applyResolution(key, { skip: true }, exercise.exerciseName);
  }

  function handlePickerSelect(exercise: { id: string; name: string }) {
    if (!resolverKey) return;
    const originalName = flaggedSlots.find((s) => s.key === resolverKey)?.exercise.exerciseName;
    applyResolution(resolverKey, { exerciseId: exercise.id, exerciseName: exercise.name }, originalName);
    setResolverKey(null);
  }

  // Block-scoped bulk actions. `entries` is that block's currently-unresolved
  // flagged slots — confirmAllInBlock only touches ones with a suggested
  // match; slots without one (not_in_library) still need a manual pick.
  function confirmAllInBlock(entries: { key: string; exercise: PreviewExercise }[]) {
    const confirmable = entries.filter((e) => e.exercise.exerciseId);
    if (confirmable.length === 0) {
      toast.error("None of these have a suggested match — pick one manually");
      return;
    }
    setResolutions((prev) => {
      const next = new Map(prev);
      confirmable.forEach(({ key, exercise }) => {
        next.set(key, { exerciseId: exercise.exerciseId!, exerciseName: exercise.exerciseName ?? "" });
      });
      return next;
    });
    const skipped = entries.length - confirmable.length;
    toast.success(
      skipped > 0
        ? `Confirmed ${confirmable.length} of ${entries.length} — ${skipped} have no suggested match`
        : `Confirmed ${confirmable.length} exercise${confirmable.length === 1 ? "" : "s"}`
    );
  }

  function skipAllInBlock(entries: { key: string; exercise: PreviewExercise }[]) {
    setResolutions((prev) => {
      const next = new Map(prev);
      entries.forEach(({ key }) => next.set(key, { skip: true }));
      return next;
    });
    toast.success(`Skipped ${entries.length} exercise${entries.length === 1 ? "" : "s"}`);
  }

  function resolutionLabel(resolution: Resolution | undefined) {
    if (!resolution) return undefined;
    if ("skip" in resolution) return "Skipped";
    return resolution.exerciseName;
  }

  function pendingApplyAllDescription() {
    if (!pendingApplyAll) return "";
    const { resolution, matches, exerciseName } = pendingApplyAll;
    const placement = `${matches.length} other place${matches.length === 1 ? "" : "s"}`;
    if ("skip" in resolution) {
      return `This will skip "${exerciseName}" here and in ${placement} in this plan.`;
    }
    return `This will resolve "${exerciseName}" to "${resolution.exerciseName}" here and in ${placement} in this plan.`;
  }

  function buildResolvedPlan() {
    if (!preview) return null;
    const workouts = preview.aiPlan.workouts
      .map((w, wi) => ({
        name: w.name,
        dayIndex: w.dayIndex,
        weekIndex: w.weekIndex,
        blocks: w.blocks
          .map((b, bi) => ({
            name: b.name,
            type: b.type,
            circuitIndex: b.circuitIndex,
            orderIndex: b.orderIndex,
            rounds: b.rounds,
            restBetweenRounds: b.restBetweenRounds,
            exercises: b.exercises
              .map((e, ei) => {
                const key = flagKey(wi, bi, ei);
                const resolution = resolutions.get(key);
                if (resolution && "skip" in resolution) return null;
                const exerciseId = resolution && "exerciseId" in resolution ? resolution.exerciseId : e.exerciseId;
                const exerciseName = resolution && "exerciseName" in resolution ? resolution.exerciseName : e.exerciseName;
                if (!exerciseId) return null;
                return {
                  exerciseId,
                  exerciseName,
                  orderIndex: e.orderIndex,
                  sets: e.sets,
                  reps: e.reps,
                  notes: e.notes,
                  restSeconds: e.restSeconds,
                };
              })
              .filter((e): e is NonNullable<typeof e> => e !== null),
          }))
          .filter((b) => b.exercises.length > 0),
      }))
      .filter((w) => w.blocks.length > 0);

    return { name: preview.aiPlan.name, description: preview.aiPlan.description, workouts };
  }

  async function handleSave(isTemplate: boolean) {
    if (!preview || !editableFields) return;
    if (unresolvedCount > 0) {
      toast.error(`Resolve ${unresolvedCount} flagged exercise${unresolvedCount === 1 ? "" : "s"} before saving`);
      return;
    }
    if (unconfirmedInferredCount > 0) {
      toast.error(
        `Confirm ${unconfirmedInferredCount} field${unconfirmedInferredCount === 1 ? "" : "s"} not stated in the document before saving`
      );
      return;
    }
    if (!isTemplate && !assignClientId) {
      toast.error("Select a client to assign");
      return;
    }

    const resolvedPlan = buildResolvedPlan();
    if (!resolvedPlan || resolvedPlan.workouts.length === 0) {
      toast.error("No exercises remain in this program — nothing to save");
      return;
    }

    setSaving(isTemplate ? "template" : "assign");
    try {
      const editedTitle = editableFields.programTitle.trim() || preview.parsed.programTitle;
      const editedFocusAreas = editableFields.focusAreas
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const editedDuration = Number.parseInt(editableFields.durationMinutes, 10);

      const result = await saveGeneratedProgramAction({
        aiPlan: { ...resolvedPlan, name: editedTitle },
        params: {
          ...preview.params,
          programTitle: editedTitle,
          difficultyLevel: editableFields.difficultyLevel,
          durationMinutes: Number.isFinite(editedDuration) ? editedDuration : preview.parsed.durationMinutes,
          focusAreas: editedFocusAreas.length ? editedFocusAreas : preview.parsed.focusAreas,
        },
        isTemplate,
        clientId: isTemplate ? null : assignClientId,
        startDate: isTemplate ? undefined : assignStartDate,
      });

      if (result.success) {
        toast.success(isTemplate ? "Program saved" : "Program assigned and saved");
        router.push(`/programs/${result.data}`);
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(null);
    }
  }

  const processing = stage !== "idle" && stage !== "ready";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Upload Program Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Any format works — tables, bullet lists, or plain prose. Not sure where to start?
              </p>
              <Link
                className="text-sm text-blue-600 hover:underline"
                href="/templates/program-brief-template.txt"
                target="_blank"
              >
                See an example document
              </Link>
            </div>
            <Badge variant="outline" className="w-fit">
              Supported: PDF, DOCX, TXT, MD
            </Badge>
          </div>

          <div className="border border-dashed rounded-lg p-6 text-center space-y-3">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files)}
            />
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="text-sm">
              {file ? (
                <span className="font-medium">{formatFileName(file.name)}</span>
              ) : (
                "Choose a program brief file"
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={processing}>
                Select File
              </Button>
              <Button onClick={handleUploadAndGenerate} disabled={!file || processing} className="gap-2">
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Preview
              </Button>
            </div>
            {processing && (
              <div className="pt-2">
                <ProgressStepper stage={stage} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {pendingMetadata && (
        <MissingFieldsDialog
          open
          missingFields={pendingMetadata.missingRequiredFields}
          initialValues={missingFieldsInitialValues!}
          onConfirm={handleMissingFieldsConfirm}
        />
      )}

      {preview && editableFields && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Review Generated Program
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Review before saving
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {preview.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {(() => {
              const inferred = inferredFieldsSet;
              const inferredNote = (field: string) => {
                const confirmed = confirmedInferredFields.has(field);
                if (confirmed) {
                  return (
                    <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Confirmed
                    </p>
                  );
                }
                return (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Not stated in the document — please confirm.
                    </p>
                    <button
                      type="button"
                      onClick={() => confirmInferredField(field)}
                      className="whitespace-nowrap text-xs font-medium text-amber-800 underline hover:text-amber-900 dark:text-amber-300"
                    >
                      Confirm
                    </button>
                  </div>
                );
              };
              return (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Program Title</Label>
                    <Input
                      value={editableFields.programTitle}
                      onChange={(e) => {
                        setEditableFields((f) => (f ? { ...f, programTitle: e.target.value } : f));
                        if (inferred.has("programTitle")) confirmInferredField("programTitle");
                      }}
                      className={
                        inferred.has("programTitle") && !confirmedInferredFields.has("programTitle")
                          ? "border-amber-400"
                          : undefined
                      }
                    />
                    {inferred.has("programTitle") && inferredNote("programTitle")}
                  </div>
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select
                      value={editableFields.difficultyLevel}
                      onValueChange={(v) => {
                        setEditableFields((f) => (f ? { ...f, difficultyLevel: v ?? f.difficultyLevel } : f));
                        if (inferred.has("difficultyLevel")) confirmInferredField("difficultyLevel");
                      }}
                    >
                      <SelectTrigger
                        className={
                          inferred.has("difficultyLevel") && !confirmedInferredFields.has("difficultyLevel")
                            ? "border-amber-400"
                            : undefined
                        }
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIFFICULTY_OPTIONS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {inferred.has("difficultyLevel") && inferredNote("difficultyLevel")}
                  </div>
                  <div className="space-y-2">
                    <Label>Focus Areas (comma separated)</Label>
                    <Input
                      value={editableFields.focusAreas}
                      onChange={(e) => {
                        setEditableFields((f) => (f ? { ...f, focusAreas: e.target.value } : f));
                        if (inferred.has("focusAreas")) confirmInferredField("focusAreas");
                      }}
                      className={
                        inferred.has("focusAreas") && !confirmedInferredFields.has("focusAreas")
                          ? "border-amber-400"
                          : undefined
                      }
                    />
                    {inferred.has("focusAreas") && inferredNote("focusAreas")}
                  </div>
                  <div className="space-y-2">
                    <Label>Schedule</Label>
                    <div className="text-sm font-medium">
                      {preview.parsed.daysPerWeek} days/week — {preview.parsed.preferredWeekdays.join(", ")}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Confirmed before generation — already reflected in the sessions below.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Session Length (minutes)</Label>
                    <Input
                      type="number"
                      value={editableFields.durationMinutes}
                      onChange={(e) => {
                        setEditableFields((f) => (f ? { ...f, durationMinutes: e.target.value } : f));
                        if (inferred.has("durationMinutes")) confirmInferredField("durationMinutes");
                      }}
                      className={
                        inferred.has("durationMinutes") && !confirmedInferredFields.has("durationMinutes")
                          ? "border-amber-400"
                          : undefined
                      }
                    />
                    {inferred.has("durationMinutes") && inferredNote("durationMinutes")}
                  </div>
                </div>
              );
            })()}

            {unconfirmedInferredCount > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {unconfirmedInferredCount} field{unconfirmedInferredCount === 1 ? "" : "s"} above{" "}
                {unconfirmedInferredCount === 1 ? "was" : "were"} not stated in the document and need your
                confirmation before this program can be saved.
              </div>
            )}

            {unresolvedCount > 0 && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {unresolvedCount} exercise{unresolvedCount === 1 ? "" : "s"} need{unresolvedCount === 1 ? "s" : ""}{" "}
                your review before this program can be saved.
              </div>
            )}

            <div className="space-y-2">
              <Label>Generated Sessions</Label>
              <div className="space-y-3">
                {weekGroups.map(({ weekIndex, items }) => {
                  const isOpen = expandedWeek === weekIndex;
                  return (
                    <div key={weekIndex} className="rounded-lg border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleWeek(weekIndex)}
                        className="flex w-full items-center justify-between gap-2 p-4 text-left hover:bg-muted/50"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          Week {weekIndex + 1}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {items.length} session{items.length === 1 ? "" : "s"}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="divide-y border-t">
                          {items.map(({ workout, index: wIdx }) => (
                            <div key={`${workout.name}-${wIdx}`} className="p-4">
                              <div className="flex items-center gap-2 font-medium">
                                <Badge variant="secondary" className="shrink-0">
                                  {sessionDayLabel(workout)}
                                </Badge>
                                <span>{workout.name}</span>
                              </div>
                              <div className="mt-3 space-y-3">
                                {workout.blocks.map((block, bIdx) => {
                                  const blockUnresolved = block.exercises
                                    .map((exercise, exIdx) => ({ key: flagKey(wIdx, bIdx, exIdx), exercise }))
                                    .filter(
                                      ({ key, exercise }) =>
                                        (exercise.flags?.length ?? 0) > 0 && !resolutions.has(key)
                                    );
                                  return (
                                    <div key={`${block.name || block.type}-${bIdx}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-sm font-semibold flex items-center gap-2">
                                          <span>{block.name || "Block"}</span>
                                          {block.type !== "NORMAL" && <Badge variant="outline">{block.type}</Badge>}
                                        </div>
                                        {blockUnresolved.length > 1 && (
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                              {blockUnresolved.length} need review
                                            </span>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-6 text-xs"
                                              onClick={() => confirmAllInBlock(blockUnresolved)}
                                            >
                                              Confirm all
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-6 text-xs text-muted-foreground"
                                              onClick={() => skipAllInBlock(blockUnresolved)}
                                            >
                                              Skip all
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                      <div className="mt-2 space-y-1.5">
                                        {block.exercises.map((ex, eIdx) => {
                                          const key = flagKey(wIdx, bIdx, eIdx);
                                          const flags = ex.flags ?? [];
                                          if (flags.length === 0) {
                                            return (
                                              <div key={key} className="text-sm text-muted-foreground">
                                                {ex.exerciseName || ex.exerciseId} — {ex.sets} x {ex.reps}
                                              </div>
                                            );
                                          }
                                          const resolution = resolutions.get(key);
                                          return (
                                            <FlaggedExerciseRow
                                              key={key}
                                              exerciseName={ex.exerciseName}
                                              sets={ex.sets}
                                              reps={ex.reps}
                                              flags={flags}
                                              hasSuggestion={!!ex.exerciseId}
                                              resolved={!!resolution}
                                              resolvedLabel={resolutionLabel(resolution)}
                                              duplicateCount={otherUnresolvedMatches(key, ex.exerciseName).length}
                                              applyToAll={applyToAllKeys.has(key)}
                                              onApplyToAllChange={(checked) => setApplyToAll(key, checked)}
                                              onConfirm={() => confirmSuggestion(key, ex)}
                                              onPickAlternative={() => setResolverKey(key)}
                                              onSkip={() => skipSlot(key, ex)}
                                            />
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Assign to Client (optional)</Label>
                  <Select
                    value={assignClientId || NO_CLIENT_VALUE}
                    onValueChange={(v) => setAssignClientId(!v || v === NO_CLIENT_VALUE ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client">
                        {(value: string | null) => {
                          if (!value || value === NO_CLIENT_VALUE) return "No client — save as template";
                          const client = clients.find((c) => c.id === value);
                          return client ? `${client.firstName} ${client.lastName}` : "Select a client";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CLIENT_VALUE}>No client — save as template</SelectItem>
                      {clients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={assignStartDate} onChange={(e) => setAssignStartDate(e.target.value)} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleSave(true)}
                  disabled={saving !== null || unresolvedCount > 0 || unconfirmedInferredCount > 0}
                >
                  {saving === "template" ? "Saving..." : "Save as Template"}
                </Button>
                <Button
                  onClick={() => handleSave(false)}
                  disabled={saving !== null || unresolvedCount > 0 || unconfirmedInferredCount > 0}
                >
                  {saving === "assign" ? "Assigning..." : "Save & Assign"}
                </Button>
                {unresolvedCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {unresolvedCount} unresolved exercise{unresolvedCount === 1 ? "" : "s"}
                  </span>
                )}
                {unconfirmedInferredCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {unconfirmedInferredCount} unconfirmed field{unconfirmedInferredCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ExercisePickerDialog
        open={!!resolverKey}
        onOpenChange={(open) => {
          if (!open) setResolverKey(null);
        }}
        exercises={exercises}
        onSelect={handlePickerSelect}
        organizationOrganizationId={organizationOrganizationId}
        exerciseSourcePreference={exerciseSourcePreference}
      />

      <AlertDialog open={!!pendingApplyAll} onOpenChange={(open) => !open && setPendingApplyAll(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apply to {pendingApplyAll ? pendingApplyAll.matches.length + 1 : 0} exercises?
            </AlertDialogTitle>
            <AlertDialogDescription>{pendingApplyAllDescription()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmApplyAll}>Apply to all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
