import { Badge } from "@/components/ui/badge";
import { Clock, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasRealVideoUrl } from "@/lib/utils/video";

export interface ExerciseSet {
  id: string;
  orderIndex: number;
  setType: string;
  targetReps: number | null;
  targetDuration: number | null;
  targetDurationUnit: string | null;
  targetWeight: number | null;
}

export interface ExerciseInfo {
  id: string;
  name: string;
  videoUrl?: string | null;
  videoProvider?: string | null;
  description?: string | null;
  musclesTargeted?: string[];
}

export interface BlockExercise {
  id: string;
  orderIndex: number;
  notes?: string | null;
  restSeconds?: number | null;
  exercise: ExerciseInfo;
  sets: ExerciseSet[];
}

export interface WorkoutBlock {
  id: string;
  name?: string | null;
  type: string;
  orderIndex: number;
  rounds: number;
  exercises: BlockExercise[];
}

export interface WorkoutData {
  id: string;
  name: string;
  dayIndex: number;
  weekIndex: number;
  estimatedMinutes?: number | null;
  blocks: WorkoutBlock[];
}

export interface SessionData {
  id: string;
  scheduledDate: string | Date;
  status: string;
  workout: WorkoutData;
}

export const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  SCHEDULED:   { dot: "#3b82f6", label: "Scheduled"   },
  IN_PROGRESS: { dot: "#f59e0b", label: "In Progress" },
  COMPLETED:   { dot: "#22c55e", label: "Completed"   },
  MISSED:      { dot: "#ef4444", label: "Missed"      },
  SKIPPED:     { dot: "#94a3b8", label: "Skipped"     },
  TEMPLATE:    { dot: "#94a3b8", label: "Planned"     },
};

export const BLOCK_BADGE: Record<string, string> = {
  WARMUP:   "bg-muted text-muted-foreground border-border",
  COOLDOWN: "bg-muted text-muted-foreground border-border",
  CIRCUIT:  "bg-muted text-muted-foreground border-border",
  SUPERSET: "bg-muted text-muted-foreground border-border",
  AMRAP:    "bg-muted text-muted-foreground border-border",
  EMOM:     "bg-muted text-muted-foreground border-border",
  NORMAL:   "bg-muted text-muted-foreground border-border",
};

export function castWorkout(raw: Record<string, unknown>): WorkoutData {
  const blocks = ((raw.blocks as Record<string, unknown>[]) || []).map((b) => ({
    id: b.id as string,
    name: b.name as string | null,
    type: (b.type as string) || "NORMAL",
    orderIndex: (b.orderIndex as number) || 0,
    rounds: (b.rounds as number) || 1,
    exercises: ((b.exercises as Record<string, unknown>[]) || []).map((be) => {
      const ex = (be.exercise as Record<string, unknown>) || {};
      return {
        id: be.id as string,
        orderIndex: (be.orderIndex as number) || 0,
        notes: be.notes as string | null,
        restSeconds: be.restSeconds as number | null,
        exercise: {
          id: ex.id as string,
          name: (ex.name as string) || "Exercise",
          videoUrl: ex.videoUrl as string | null,
          videoProvider: ex.videoProvider as string | null,
          description: ex.description as string | null,
          musclesTargeted: (ex.musclesTargeted as string[]) || [],
        },
        sets: ((be.sets as Record<string, unknown>[]) || []).map((s) => ({
          id: s.id as string,
          orderIndex: (s.orderIndex as number) || 0,
          setType: (s.setType as string) || "NORMAL",
          targetReps: s.targetReps as number | null,
          targetDuration: s.targetDuration as number | null,
          targetDurationUnit: (s.targetDurationUnit as string | null) ?? null,
          targetWeight: s.targetWeight as number | null,
        })),
      };
    }),
  }));
  return {
    id: raw.id as string,
    name: (raw.name as string) || "Workout",
    dayIndex: (raw.dayIndex as number) || 0,
    weekIndex: (raw.weekIndex as number) || 0,
    estimatedMinutes: raw.estimatedMinutes as number | null,
    blocks,
  };
}

export function castSession(raw: Record<string, unknown>): SessionData {
  const workoutRaw = (raw.workout as Record<string, unknown>) || {};
  return {
    id: raw.id as string,
    scheduledDate: raw.scheduledDate as string | Date,
    status: (raw.status as string) || "SCHEDULED",
    workout: castWorkout(workoutRaw),
  };
}

export function formatPrescription(sets: ExerciseSet[]): string {
  if (!sets.length) return "";
  const n = sets.length;
  const s = sets[0];
  if (s.targetDuration) {
    const weight = s.targetWeight ? ` @ ${s.targetWeight}lb` : "";
    return `${n} × ${s.targetDuration}${s.targetDurationUnit === "MIN" ? "min" : "s"}${weight}`;
  }
  if (s.targetReps) {
    const weight = s.targetWeight ? ` @ ${s.targetWeight}lb` : "";
    return `${n} × ${s.targetReps} reps${weight}`;
  }
  return `${n} set${n !== 1 ? "s" : ""}`;
}

export function ReadOnlyPanel({
  workout,
  status,
}: {
  workout: WorkoutData;
  status?: string;
}) {
  const totalExercises = workout.blocks.reduce(
    (s, b) => s + b.exercises.length,
    0
  );
  const statusCfg = status ? (STATUS_CONFIG[status] ?? STATUS_CONFIG.SCHEDULED) : null;

  return (
    <>
      <div className="border-b px-4 py-3">
        <p className="font-semibold text-sm leading-snug">{workout.name}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {workout.estimatedMinutes && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              ~{workout.estimatedMinutes} min
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {totalExercises} exercise{totalExercises !== 1 ? "s" : ""}
          </span>
          {statusCfg && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: statusCfg.dot }} />
              {statusCfg.label}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 max-h-[60vh] overflow-y-auto">
        <div className="p-3 space-y-4">
          {workout.blocks.map((block) => (
            <div key={block.id}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {block.name || block.type}
                </span>
                {block.type !== "NORMAL" && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1 py-0 h-4",
                      BLOCK_BADGE[block.type] ?? BLOCK_BADGE.NORMAL
                    )}
                  >
                    {block.type}
                  </Badge>
                )}
                {block.rounds > 1 && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <RotateCcw className="h-2.5 w-2.5" />
                    {block.rounds}×
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {block.exercises.map((be, idx) => (
                  <div
                    key={be.id}
                    className="rounded-lg border bg-muted/30 p-2.5"
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5 text-[10px] text-muted-foreground w-4 shrink-0 text-right">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-xs font-medium leading-snug">
                            {be.exercise.name}
                          </span>
                          {hasRealVideoUrl(be.exercise.videoUrl) && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1 py-0 rounded-sm font-medium">
                              <Play className="h-2 w-2" />
                              Video
                            </span>
                          )}
                        </div>
                        {be.sets.length > 0 && (
                          <p className="text-[11px] font-medium text-foreground/80 mt-0.5">
                            {formatPrescription(be.sets)}
                          </p>
                        )}
                        {be.notes && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground italic leading-snug">
                            {be.notes}
                          </p>
                        )}
                        {be.exercise.musclesTargeted?.length ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight">
                            {be.exercise.musclesTargeted.slice(0, 3).join(", ")}
                            {be.exercise.musclesTargeted.length > 3 ? "…" : ""}
                          </p>
                        ) : null}
                        {be.restSeconds ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            Rest {be.restSeconds}s
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
