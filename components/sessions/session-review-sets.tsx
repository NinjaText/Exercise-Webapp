import { StatusBadge } from "@/components/shared/status-badge";

/** The ExerciseSet fields the review reads. */
export interface ReviewExerciseSet {
  targetReps: number | null;
  targetDuration: number | null;
}

/** The SetLog fields the review reads. `setIndex` is 0-based. */
export interface ReviewSetLog {
  setIndex: number;
  actualReps: number | null;
  actualDuration: number | null;
  actualWeight: number | null;
  notes: string | null;
}

export type SetReviewStatus = "not-logged" | "couldnt-complete" | "done";

export interface SetReviewRow {
  index: number;
  /** "Set 1", or "Round 1" in circuit-style blocks. */
  label: string;
  target: string;
  actual: string;
  weight: string;
  status: SetReviewStatus;
  /** The client's note on a set they couldn't complete. */
  note: string | null;
}

/** A logged set with zero reps and no duration: the client tried and couldn't. */
export function isCouldntComplete(log: Pick<ReviewSetLog, "actualReps" | "actualDuration">): boolean {
  return log.actualReps === 0 && log.actualDuration == null;
}

/**
 * One row per prescribed set (indices 0..setCount-1), pairing the target
 * with what the client logged. Shared by the table (sm+) and the phone cards.
 */
export function buildSetReviewRows({
  isCircuit,
  setCount,
  exerciseSets,
  setLogs,
}: {
  isCircuit: boolean;
  setCount: number;
  exerciseSets: ReviewExerciseSet[];
  setLogs: ReviewSetLog[];
}): SetReviewRow[] {
  const indexLabel = isCircuit ? "Round" : "Set";
  const logByIndex = new Map<number, ReviewSetLog>();
  for (const log of setLogs) logByIndex.set(log.setIndex, log);

  return Array.from({ length: setCount }, (_, index) => {
    const exerciseSet: ReviewExerciseSet | undefined = exerciseSets[index];
    const log = logByIndex.get(index);

    const target = exerciseSet
      ? exerciseSet.targetReps != null
        ? `${exerciseSet.targetReps} reps`
        : exerciseSet.targetDuration != null
        ? `${exerciseSet.targetDuration}s`
        : "—"
      : "—";

    let actual = "—";
    if (log) {
      if (log.actualReps != null && log.actualReps > 0) {
        actual = String(log.actualReps);
      } else if (log.actualDuration != null) {
        actual = `${log.actualDuration}s`;
      } else if (log.actualReps === 0) {
        actual = "0";
      }
    }

    const weight = log && log.actualWeight != null ? `${log.actualWeight} lbs` : "—";

    let status: SetReviewStatus = "not-logged";
    let note: string | null = null;
    if (log) {
      if (isCouldntComplete(log)) {
        status = "couldnt-complete";
        note = log.notes || null;
      } else {
        status = "done";
      }
    }

    return { index, label: `${indexLabel} ${index + 1}`, target, actual, weight, status, note };
  });
}

function SetStatusBadge({ status }: { status: SetReviewStatus }) {
  if (status === "not-logged") {
    return <StatusBadge status="not-logged" role="neutral" size="sm" label="Not logged" />;
  }
  if (status === "couldnt-complete") {
    return <StatusBadge status="couldnt-complete" role="warning" size="sm" label="Couldn't complete" />;
  }
  return <StatusBadge status="done" role="success" size="sm" label="Done" />;
}

/**
 * The per-exercise sets: a compact card per set below `sm`, the 5-column
 * table from `sm` up.
 */
export function SessionReviewSets({ rows }: { rows: SetReviewRow[] }) {
  return (
    <>
      <ul data-slot="set-cards" className="divide-y divide-border/60 sm:hidden">
        {rows.map((row) => (
          <li key={row.index} className="flex flex-col gap-1 px-5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{row.label}</span>
              <SetStatusBadge status={row.status} />
            </div>
            <p className="truncate text-caption">
              Target {row.target} · Actual <span className="text-foreground">{row.actual}</span> · {row.weight}
            </p>
            {row.note && <p className="text-caption">{row.note}</p>}
          </li>
        ))}
      </ul>

      <div data-slot="set-table" className="hidden overflow-x-auto sm:block">
        <table className="w-full text-body">
          <thead className="bg-surface-muted text-caption font-medium">
            <tr>
              <th className="h-9 px-5 text-left font-medium">#</th>
              <th className="h-9 px-3 text-left font-medium">Target</th>
              <th className="h-9 px-3 text-left font-medium">Actual</th>
              <th className="h-9 px-3 text-left font-medium">Weight</th>
              <th className="h-9 px-5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.index} className="border-t border-border">
                <td className="px-5 py-2.5 font-medium text-foreground tabular-nums">{row.label}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{row.target}</td>
                <td className="px-3 py-2.5 text-foreground tabular-nums">{row.actual}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{row.weight}</td>
                <td className="px-5 py-2.5">
                  <div className="flex flex-col gap-1">
                    <SetStatusBadge status={row.status} />
                    {row.note && <span className="text-caption">{row.note}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
