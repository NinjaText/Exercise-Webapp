"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Pencil,
  Copy,
  UserPlus,
  ChevronDown,
  ChevronRight,
  Play,
  Dumbbell,
  Share2,
  Download,
  Printer,
  Mic,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { duplicateProgramAction } from "@/actions/program-actions";
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
import { VoiceMemoRecorder } from "@/components/voice-memo/VoiceMemoRecorder";
import { VoiceMemoPlayer } from "@/components/voice-memo/VoiceMemoPlayer";
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions";
import type { VoiceMemoData } from "@/actions/voice-memo-actions";
import { cn } from "@/lib/utils";


interface ProgramDetailViewProps {
  program: Record<string, unknown>;
  isTrainer: boolean;
  clients: { id: string; firstName: string; lastName: string }[];
  sessions: Record<string, unknown>[];
  showAssignDialog?: boolean;
  trainerName?: string;
  adminMode?: boolean;
  editHref?: string;
  initialWorkoutId?: string;
  assignAction?: (input: {
    programId: string;
    clientId: string;
    startDate: string;
  }) => Promise<{ success: boolean; error?: string; data?: unknown }>;
}

export function ProgramDetailView({
  program,
  isTrainer,
  clients,
  sessions,
  showAssignDialog = false,
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
  const workouts = (program.workouts as Record<string, unknown>[]) || [];

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

  const [shareOpen, setShareOpen] = useState(false);
  const [voiceMemoWorkout, setVoiceMemoWorkout] = useState<{ id: string; name: string } | null>(null);
  const [trainerMemo, setTrainerMemo] = useState<VoiceMemoData | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {program.name as string}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge>{program.status as string}</Badge>
            {(program.isTemplate as boolean) && (
              <Badge variant="outline">Template</Badge>
            )}
            {client && (
              <span className="text-sm text-muted-foreground">
                Assigned to {client.firstName} {client.lastName}
              </span>
            )}
            {!!program.startDate && (
              <span className="text-sm text-muted-foreground">
                Starts{" "}
                {format(toLocalCalendarDate(program.startDate as string), "MMM d, yyyy")}
              </span>
            )}
          </div>
          {!!program.description && (
            <p className="text-muted-foreground mt-2">
              {program.description as string}
            </p>
          )}
        </div>
        {isTrainer && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/programs/${program.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const r = await duplicateProgramAction(
                  program.id as string
                );
                if (r.success) {
                  toast.success("Duplicated");
                  router.refresh();
                } else toast.error(r.error);
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </Button>
            {!clientId && (
              <Button onClick={() => setAssignOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Assign
              </Button>
            )}
            {(program.isTemplate as boolean) && !clientId && (
              <Button variant="outline" onClick={() => setSellOpen(true)}>
                Sell this program
              </Button>
            )}
            <Popover open={shareOpen} onOpenChange={setShareOpen}>
              <PopoverTrigger render={
                <Button variant="outline">
                  <Share2 className="mr-2 h-4 w-4" /> Share
                </Button>
              } />
              <PopoverContent className="w-80" align="end">
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Share Exercise Plan</p>
                  <Separator />
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => { setShareOpen(false); void handleDownloadPdf(); }}
                  >
                    <Download className="h-4 w-4" /> Download PDF
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      setShareOpen(false);
                      window.open(`/api/programs/${program.id as string}/pdf`);
                    }}
                  >
                    <Printer className="h-4 w-4" /> Print
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
        {adminMode && (
          <div className="flex items-center gap-2">
            {trainerName && (
              <span className="text-sm text-muted-foreground mr-2">
                Owned by {trainerName}
              </span>
            )}
            <Button variant="outline" asChild>
              <Link href={editHref ?? `/programs/${program.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Link>
            </Button>
            {!clientId && (
              <Button onClick={() => setAssignOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Assign
              </Button>
            )}
            <ProgramActionsMenu
              programId={program.id as string}
              programName={(program.name as string) ?? "this program"}
              redirectTo="/admin/programs"
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4 mt-4">
          {equipmentNeeded.length > 0 && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Dumbbell className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Equipment needed</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {equipmentNeeded.map((eq) => (
                    <Badge key={eq} variant="secondary" className="text-xs">
                      {eq}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
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
                const isWeekExpanded = expandedWeeks.has(weekIdx);
                const sessionCount = weekWorkouts.length;

                return (
                  <div key={weekIdx} className="rounded-xl border bg-card overflow-hidden">
                    {/* Week header */}
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

                    {/* Workouts for this week */}
                    {isWeekExpanded && (
                      <div className="border-t divide-y">
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
                                    <span className="text-xs font-medium text-muted-foreground bg-muted rounded-md px-2 py-0.5 shrink-0">
                                      Day {dayPos + 1}
                                    </span>
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
                                {isTrainer && (
                                  <button
                                    type="button"
                                    className="px-4 py-3.5 shrink-0 text-muted-foreground hover:text-emerald-600 transition-colors"
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
                                                        className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-sm font-medium hover:bg-blue-100 transition-colors"
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
                  </div>
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
        clients={clients}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        assignAction={assignAction}
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
    </div>
  );
}
