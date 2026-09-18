"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { SectionCard } from "@/components/shared/section-card";
import {
  Pencil,
  Copy,
  UserPlus,
  ChevronDown,
  ChevronRight,
  Play,
  Dumbbell,
  Download,
  Printer,
  Tag,
  Mic,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { duplicateProgramAction } from "@/actions/program-actions";
import { startOnDemandWorkoutAction } from "@/actions/session-v2-actions";
import { ProgramActionsMenu } from "@/components/admin/program-actions-menu";
import { AssignProgramDialog } from "@/components/programs/assign-program-dialog";
import { SellProgramDialog } from "@/components/programs/sell-program-dialog";
import { ProgramScheduleView } from "@/components/programs/program-schedule-view";
import { ClientProgramScheduleView } from "@/components/programs/client-program-schedule-view";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { aggregateProgramEquipment } from "@/lib/utils/program-equipment";
import { pickStartableSession } from "@/lib/utils/session-picker";
import { VoiceMemoRecorder } from "@/components/voice-memo/VoiceMemoRecorder";
import { VoiceMemoPlayer } from "@/components/voice-memo/VoiceMemoPlayer";
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions";
import type { VoiceMemoData } from "@/actions/voice-memo-actions";
import { cn } from "@/lib/utils";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";


interface ProgramDetailViewProps {
  program: Record<string, unknown>;
  isTrainer: boolean;
  clients: { id: string; firstName: string; lastName: string }[];
  sessions: Record<string, unknown>[];
  showAssignDialog?: boolean;
  /** Pre-selects a client in the assign dialog, e.g. when arriving from that client's profile. */
  initialAssignClientId?: string;
  trainerName?: string;
  adminMode?: boolean;
  editHref?: string;
  initialWorkoutId?: string;
  // startDate is optional because an on-demand Resource has no schedule —
  // the action resolves the program's type and enforces the requirement.
  assignAction?: (input: {
    programId: string;
    clientId: string;
    startDate?: string | null;
  }) => Promise<{ success: boolean; error?: string; data?: unknown }>;
}

export function ProgramDetailView({
  program,
  isTrainer,
  clients,
  sessions,
  showAssignDialog = false,
  initialAssignClientId,
  trainerName: trainerNameProp,
  adminMode = false,
  editHref,
  initialWorkoutId,
  assignAction,
}: ProgramDetailViewProps) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(showAssignDialog);
  const [sellOpen, setSellOpen] = useState(false);
  const [detailExercise, setDetailExercise] = useState<Record<string, unknown> | null>(null);
  const [startingWorkoutId, setStartingWorkoutId] = useState<string | null>(null);
  const workouts = (program.workouts as Record<string, unknown>[]) || [];
  const isResource = getProgramSchedulingType(program) === "ON_DEMAND";

  const trainerData = program.trainer as { firstName?: string; lastName?: string } | null;
  const trainerName = trainerNameProp ?? (trainerData ? `${trainerData.firstName ?? ""} ${trainerData.lastName ?? ""}`.trim() : "Trainer");
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(
    new Set(initialWorkoutId ? [initialWorkoutId] : [])
  );
  const [highlightedWorkoutId, setHighlightedWorkoutId] = useState<string | null>(
    initialWorkoutId ?? null
  );

  function summarizeSets(sets: Record<string, unknown>[]): string {
    if (sets.length === 0) return "";
    const first = sets[0];
    const allSame = sets.every(
      (s) =>
        s.targetReps === first.targetReps &&
        s.targetWeight === first.targetWeight &&
        s.targetDuration === first.targetDuration &&
        s.targetRPE === first.targetRPE &&
        s.setType === first.setType
    );
    const count = allSame ? sets.length : 1;
    const base = allSame ? first : sets[0];
    const prefix = (base.setType as string) !== "NORMAL" ? `${base.setType as string} ` : "";
    const reps = (base.targetReps as number) ? `${base.targetReps as number} reps` : "";
    const weight = (base.targetWeight as number) ? ` @ ${base.targetWeight as number}lb` : "";
    const dur = (base.targetDuration as number)
      ? ` ${base.targetDuration as number}${(base.targetDurationUnit as string) === "MIN" ? "min" : "s"}`
      : "";
    const rpe = (base.targetRPE as number) ? ` RPE ${base.targetRPE as number}` : "";
    const detail = `${prefix}${reps}${weight}${dur}${rpe}`.trim();
    if (allSame && sets.length > 1) return `${count} × ${detail}`;
    if (sets.length === 1) return detail;
    return sets
      .map((s) => {
        const p = (s.setType as string) !== "NORMAL" ? `${s.setType as string} ` : "";
        const r = (s.targetReps as number) ? `${s.targetReps as number} reps` : "";
        const w = (s.targetWeight as number) ? ` @ ${s.targetWeight as number}lb` : "";
        const d = (s.targetDuration as number)
          ? ` ${s.targetDuration as number}${(s.targetDurationUnit as string) === "MIN" ? "min" : "s"}`
          : "";
        return `${p}${r}${w}${d}`.trim();
      })
      .join(" | ");
  }

  function toggleWorkout(id: string) {
    setExpandedWorkouts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(() => {
    if (initialWorkoutId) {
      const target = workouts.find((w) => (w.id as string) === initialWorkoutId);
      if (target) return new Set([(target.weekIndex as number) ?? 0]);
    }
    return new Set([0]);
  });

  function toggleWeek(week: number) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      next.has(week) ? next.delete(week) : next.add(week);
      return next;
    });
  }

  const weekGroups = workouts.reduce<Record<number, typeof workouts>>((acc, w) => {
    const week = (w.weekIndex as number) ?? 0;
    if (!acc[week]) acc[week] = [];
    acc[week].push(w);
    return acc;
  }, {});
  const weekNumbers = Object.keys(weekGroups).map(Number).sort((a, b) => a - b);

  useEffect(() => {
    if (!initialWorkoutId) return;
    // Delay so this runs after Next.js' own post-navigation scroll reset,
    // which otherwise races this scroll and wins.
    const scrollTimer = setTimeout(() => {
      document
        .getElementById(`workout-${initialWorkoutId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const timer = setTimeout(() => setHighlightedWorkoutId(null), 3000);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWorkoutId]);

  const client = program.client as Record<string, string> | null;
  const clientId = program.clientId as string | null;
  // Use the trainer-curated program equipment list when available;
  // fall back to auto-detecting from exercises if the list is empty.
  const savedEquipment = (program.equipmentRequired as string[] | undefined) ?? [];
  const equipmentNeeded = savedEquipment.length > 0
    ? savedEquipment
    : aggregateProgramEquipment(workouts);
  const startableSession = !isTrainer && !isResource ? pickStartableSession(sessions, new Date()) : null;

  const [voiceMemoWorkout, setVoiceMemoWorkout] = useState<{ id: string; name: string } | null>(null);
  const [trainerMemo, setTrainerMemo] = useState<VoiceMemoData | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);

  async function handleStartResourceWorkout(workoutId: string) {
    if (!isResource || isTrainer || startingWorkoutId) return;
    setStartingWorkoutId(workoutId);
    try {
      const result = await startOnDemandWorkoutAction(workoutId);
      if (result.success) {
        router.push(`/sessions/${result.data.id}`);
        return;
      }
      toast.error(result.error);
    } catch {
      toast.error("Could not start this resource. Please try again.");
    } finally {
      setStartingWorkoutId(null);
    }
  }

  useEffect(() => {
    if (!voiceMemoWorkout) return;
    setMemoLoading(true);
    setTrainerMemo(null);
    getWorkoutVoiceMemos(voiceMemoWorkout.id).then((result) => {
      if (result.success && result.data) setTrainerMemo(result.data.trainer);
      setMemoLoading(false);
    });
  }, [voiceMemoWorkout?.id]);

  async function handleDownloadPdf() {
    const res = await fetch(`/api/programs/${program.id as string}/pdf`);
    if (!res.ok) { toast.error("Failed to generate PDF"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(program.name as string).replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDuplicate() {
    const r = await duplicateProgramAction(program.id as string);
    if (r.success) {
      toast.success("Duplicated");
      router.refresh();
    } else toast.error(r.error);
  }

  const isTemplate = program.isTemplate as boolean;
  const pdfUrl = `/api/programs/${program.id as string}/pdf`;

  const shareOverflow = [
    { label: "Duplicate", icon: Copy, onSelect: handleDuplicate },
    ...(isTemplate && !clientId
      ? [{ label: "Sell this program", icon: Tag, onSelect: () => setSellOpen(true) }]
      : []),
    { label: "Download PDF", icon: Download, onSelect: () => void handleDownloadPdf() },
    { label: "Print", icon: Printer, onSelect: () => window.open(pdfUrl) },
  ];

  const editButton = (
    <Button variant="outline" asChild>
      <Link href={editHref ?? `/programs/${program.id}/edit`}>
        <Pencil className="size-4" /> Edit
      </Link>
    </Button>
  );

  const primaryEditButton = (
    <Button asChild>
      <Link href={editHref ?? `/programs/${program.id}/edit`}>
        <Pencil className="size-4" /> Edit
      </Link>
    </Button>
  );

  const assignIsPrimary = (isTrainer || adminMode) && !clientId;

  return (
    <>
      <Tabs defaultValue="overview" className="gap-6">
        <PageHeader
          breadcrumb={
            adminMode
              ? [
                  { label: "Admin", href: "/admin" },
                  { label: "All Programs", href: "/admin/programs" },
                  { label: program.name as string },
                ]
              : [
                  { label: isTrainer ? "Programs" : "My Programs", href: "/programs" },
                  { label: program.name as string },
                ]
          }
          back={adminMode ? { label: "Back to Programs", href: "/admin/programs" } : undefined}
          title={program.name as string}
          description={program.description as string | undefined}
          primaryAction={
            !isTrainer && !adminMode
              ? undefined
              : assignIsPrimary
                ? (
                  <Button onClick={() => setAssignOpen(true)}>
                    <UserPlus className="size-4" /> Assign
                  </Button>
                )
                : primaryEditButton
          }
          secondaryActions={
            isTrainer
              ? (assignIsPrimary ? editButton : undefined)
              : adminMode
                ? (
                  <>
                    {assignIsPrimary && editButton}
                    <ProgramActionsMenu
                      programId={program.id as string}
                      programName={(program.name as string) ?? "this program"}
                      isPublic={program.isPublic as boolean | undefined}
                      redirectTo="/admin/programs"
                    />
                  </>
                )
                : undefined
          }
          overflow={isTrainer ? shareOverflow : undefined}
          meta={
            <>
              <StatusBadge status={program.status as string} size="sm" />
              {isTemplate && <StatusBadge status="TEMPLATE" size="sm" dot={false} />}
              {client && (
                <span>
                  Assigned to {client.firstName} {client.lastName}
                </span>
              )}
              {!!program.startDate && (
                <span>
                  Starts {format(toLocalCalendarDate(program.startDate as string), "MMM d, yyyy")}
                </span>
              )}
              {adminMode && trainerName && <span>Owned by {trainerName}</span>}
            </>
          }
          tabs={
            <TabsList variant="line">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
            </TabsList>
          }
        />

        {startableSession && (
          <div className="rounded-xl bg-card p-4 ring-1 ring-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {((startableSession.workout as Record<string, unknown> | null)?.name as string) ?? "Next workout"}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(toLocalCalendarDate(startableSession.scheduledDate as string | Date), "EEEE, MMM d")}
              </p>
            </div>
            <Button size="default" className="shrink-0 font-semibold" asChild>
              <Link href={`/sessions/${startableSession.id as string}`}>
                <Play className="mr-2 h-4 w-4 fill-current" />
                Start Workout
              </Link>
            </Button>
          </div>
        )}

        <TabsContent value="overview" className="space-y-4 mt-4">
          {equipmentNeeded.length > 0 && (
            <SectionCard title="Equipment needed" icon={Dumbbell}>
              <div className="flex flex-wrap gap-2">
                {equipmentNeeded.map((eq) => (
                  <Badge key={eq} variant="secondary" className="text-xs">
                    {eq}
                  </Badge>
                ))}
              </div>
            </SectionCard>
          )}
          {workouts.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">
                No workouts yet. Edit this program to add workouts.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {weekNumbers.map((weekIdx) => {
                const weekWorkouts = weekGroups[weekIdx].slice().sort(
                  (a, b) => ((a.dayIndex as number) ?? 0) - ((b.dayIndex as number) ?? 0)
                );
                const isSingleWeek = weekNumbers.length === 1;
                const isWeekExpanded = isSingleWeek || expandedWeeks.has(weekIdx);
                const sessionCount = weekWorkouts.length;

                return (
                  <Card key={weekIdx} className="gap-0 overflow-hidden p-0 ring-1 ring-border shadow-none">
                    {!isSingleWeek && (
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/40 transition-colors text-left"
                        onClick={() => toggleWeek(weekIdx)}
                      >
                        {isWeekExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-semibold text-base">Week {weekIdx + 1}</span>
                        <span className="text-sm text-muted-foreground">
                          {sessionCount} session{sessionCount !== 1 ? "s" : ""}
                        </span>
                      </button>
                    )}

                    {/* Workouts for this week */}
                    {isWeekExpanded && (
                      <div className={cn(!isSingleWeek && "border-t", "divide-y")}>
                        {weekWorkouts.map((workout, dayPos) => {
                          const wId = workout.id as string;
                          const isExpanded = expandedWorkouts.has(wId);
                          const blocks = (workout.blocks as Record<string, unknown>[]) || [];
                          const scheduledDate = workout.scheduledDate as string | null | undefined;

                          return (
                            <div
                              key={wId}
                              id={`workout-${wId}`}
                              className={cn(
                                "transition-colors duration-1000",
                                highlightedWorkoutId === wId && "bg-primary/10 ring-1 ring-inset ring-primary/40"
                              )}
                            >
                              {/* Session row */}
                              <div className="flex items-center hover:bg-muted/30 transition-colors">
                                <button
                                  type="button"
                                  className="flex items-center gap-3 px-5 py-3.5 text-left flex-1 min-w-0"
                                  onClick={() => toggleWorkout(wId)}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                  )}
                                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                    {!(isResource && workouts.length === 1) && (
                                      <span className="text-xs font-medium text-muted-foreground bg-muted rounded-md px-2 py-0.5 shrink-0">
                                        Day {dayPos + 1}
                                      </span>
                                    )}
                                    <span className="font-medium text-sm truncate">
                                      {workout.name as string}
                                    </span>
                                    {scheduledDate && (
                                      <span className="text-xs text-muted-foreground shrink-0">
                                        {format(toLocalCalendarDate(scheduledDate), "MMM d")}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0 ml-auto">
                                    {!!workout.estimatedMinutes && (
                                      <span className="text-xs text-muted-foreground">
                                        ~{workout.estimatedMinutes as number} min
                                      </span>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                      {blocks.reduce((sum, b) => sum + ((b.exercises as unknown[]) || []).length, 0)} exercises
                                    </span>
                                  </div>
                                </button>
                                {isResource && !isTrainer && (
                                  <Button
                                    size="sm"
                                    className="mr-4 font-semibold"
                                    disabled={startingWorkoutId !== null}
                                    onClick={() => void handleStartResourceWorkout(wId)}
                                  >
                                    {startingWorkoutId === wId ? (
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
                                    )}
                                    {startingWorkoutId === wId ? "Starting..." : "Start Session"}
                                  </Button>
                                )}
                                {isTrainer && (
                                  <button
                                    type="button"
                                    className="px-4 py-3.5 shrink-0 text-muted-foreground hover:text-success transition-colors"
                                    title="Voice note"
                                    onClick={() => setVoiceMemoWorkout({ id: wId, name: workout.name as string })}
                                  >
                                    <Mic className="h-4 w-4" />
                                  </button>
                                )}
                              </div>

                              {/* Expanded blocks */}
                              {isExpanded && (
                                <div className="px-5 pb-4 pt-1 space-y-3 bg-muted/20">
                                  {blocks.map((block) => {
                                    const bExercises = (block.exercises as Record<string, unknown>[]) || [];
                                    return (
                                      <div key={block.id as string} className="border rounded-lg p-4 bg-card">
                                        <div className="flex items-center gap-2 mb-3">
                                          <span className="font-semibold text-sm">
                                            {(block.name as string) || "Block"}
                                          </span>
                                          {(block.type as string) !== "NORMAL" && (
                                            <Badge variant="outline" className="text-xs">
                                              {block.type as string}
                                            </Badge>
                                          )}
                                          {(block.rounds as number) > 1 && (
                                            <Badge variant="secondary" className="text-xs">
                                              {block.rounds as number} rounds
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="space-y-2">
                                          {bExercises.map((be) => {
                                            const exercise = be.exercise as Record<string, unknown>;
                                            const sets = (be.sets as Record<string, unknown>[]) || [];
                                            return (
                                              <div
                                                key={be.id as string}
                                                className="flex items-start gap-3 p-3 bg-muted/50 rounded-md"
                                              >
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center gap-2 flex-wrap">
                                                    <button
                                                      type="button"
                                                      className="font-medium text-sm text-left hover:underline focus:outline-none"
                                                      onClick={() => setDetailExercise(exercise)}
                                                    >
                                                      {exercise?.name as string}
                                                    </button>
                                                    {!!(exercise?.videoUrl) && (
                                                      <button
                                                        type="button"
                                                        className="inline-flex items-center gap-0.5 text-[10px] bg-info-soft text-info-foreground border border-info-border px-1.5 py-0.5 rounded-sm font-medium hover:bg-info-border transition-colors"
                                                        onClick={() => setDetailExercise(exercise)}
                                                      >
                                                        <Play className="h-2.5 w-2.5" /> Watch
                                                      </button>
                                                    )}
                                                  </div>
                                                  {!!(exercise?.description) && (
                                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                      {exercise.description as string}
                                                    </p>
                                                  )}
                                                  {!!be.notes && (
                                                    <p className="text-xs text-muted-foreground mt-0.5 italic">
                                                      {be.notes as string}
                                                    </p>
                                                  )}
                                                  {sets.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                      <Badge variant="secondary" className="text-xs">
                                                        {summarizeSets(sets)}
                                                      </Badge>
                                                      {!!be.restSeconds && (
                                                        <Badge variant="outline" className="text-xs text-muted-foreground">
                                                          Rest {be.restSeconds as number}s
                                                        </Badge>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="schedule" className="mt-4">
          {isTrainer || adminMode ? (
            <ProgramScheduleView
              rawWorkouts={workouts}
              rawSessions={sessions}
              trainerName={trainerName}
              readOnly={!isTrainer}
            />
          ) : (
            <ClientProgramScheduleView rawSessions={sessions} />
          )}
        </TabsContent>
      </Tabs>

      {/* Assign Dialog */}
      <AssignProgramDialog
        programId={program.id as string}
        programName={program.name as string}
        clients={clients}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        schedulingType={program.schedulingType as string | null | undefined}
        assignAction={assignAction}
        initialClientId={initialAssignClientId}
      />

      <SellProgramDialog
        programId={program.id as string}
        open={sellOpen}
        onOpenChange={setSellOpen}
      />

      {/* Exercise Detail Modal */}
      <Dialog open={!!detailExercise} onOpenChange={(open) => !open && setDetailExercise(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailExercise?.name as string}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!!(detailExercise?.videoUrl) ? (
              <div className="w-full aspect-video rounded-md overflow-hidden bg-black/10">
                <UniversalVideoPlayer
                  url={detailExercise.videoUrl as string}
                  provider={detailExercise.videoProvider as string | undefined}
                />
              </div>
            ) : (
              <div className="w-full flex items-center justify-center rounded-md bg-muted h-20">
                <p className="text-sm text-muted-foreground">No video available for this exercise</p>
              </div>
            )}
            {!!(detailExercise?.description) && (
              <p className="text-sm text-muted-foreground">{detailExercise.description as string}</p>
            )}
            {!!(detailExercise?.musclesTargeted) && (detailExercise.musclesTargeted as string[]).length > 0 && (
              <div className="text-sm">
                <span className="font-medium">Muscles targeted: </span>
                <span className="text-muted-foreground">{(detailExercise.musclesTargeted as string[]).join(", ")}</span>
              </div>
            )}
            {!!(detailExercise?.commonMistakes) && (
              <div className="text-sm">
                <span className="font-medium">Common mistakes: </span>
                <span className="text-muted-foreground">{detailExercise.commonMistakes as string}</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Voice Memo Dialog */}
      <Dialog open={!!voiceMemoWorkout} onOpenChange={(open) => !open && setVoiceMemoWorkout(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Voice note — {voiceMemoWorkout?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {memoLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {trainerMemo && (
                  <VoiceMemoPlayer memo={trainerMemo} authorName={trainerName} />
                )}
                <VoiceMemoRecorder
                  workoutId={voiceMemoWorkout?.id ?? ""}
                  role="TRAINER"
                  onSuccess={(memo) => setTrainerMemo(memo)}
                  existingMemo={trainerMemo ?? undefined}
                />
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
