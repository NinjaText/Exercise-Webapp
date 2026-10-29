/**
 * Prescription formatting shared by the workout trackers and the pre-start
 * exercise preview, so every screen describes a set the same way.
 */

export type PrescriptionSet = {
  setType?: string | null;
  targetReps?: number | null;
  targetDuration?: number | null;
  targetDurationUnit?: string | null;
  targetDistance?: number | null;
  targetPace?: string | null;
  targetHrZone?: string | null;
  repeatCount?: number | null;
};

export function isCircuitBlock(type: string): boolean {
  const t = type.toUpperCase();
  return t === "CIRCUIT" || t === "SUPERSET" || t === "WARMUP" || t === "COOLDOWN";
}

const SEGMENT_LABELS: Record<string, string> = {
  WARMUP: "Warm-up",
  WORK: "Work",
  RECOVERY: "Recovery",
  COOLDOWN: "Cool-down",
};

// Only meaningful for Run / Interval Run exercises — labels an interval
// segment by what it is (not "Set 1"), and folds in the repeat count so
// "6 x 400m" reads as one row instead of six identical ones.
export function segmentLabel(setType?: string | null, repeatCount?: number | null): string | null {
  if (!setType) return null;
  const base = SEGMENT_LABELS[setType];
  if (!base) return null;
  return setType === "WORK" && repeatCount ? `${base} ×${repeatCount}` : base;
}

// Renders a Run/Interval Run set's prescription as a single glance-able
// line — distance, duration, target pace, HR zone — since none of those
// are things a client fills in an input for the way reps/weight are.
export function prescriptionSummary(set: PrescriptionSet): string {
  const parts: string[] = [];
  if (set.targetDistance != null) parts.push(`${set.targetDistance} mi`);
  if (set.targetDuration != null) {
    parts.push(`${set.targetDuration}${set.targetDurationUnit === "MIN" ? "min" : "s"}`);
  }
  if (set.targetPace) parts.push(`@ ${set.targetPace}`);
  if (set.targetHrZone) parts.push(set.targetHrZone);
  return parts.join(" · ");
}

/** One-line prescription for an exercise in its block, e.g. "3 sets × 10 reps". */
export function getPrescriptionText(
  ex: { activityType?: string | null; sets: PrescriptionSet[] },
  block: { type: string; rounds?: number | null }
): string {
  const isCircuit = isCircuitBlock(block.type);
  const rounds = isCircuit ? Math.max(1, block.rounds ?? 1) : 1;
  const set = ex.sets[0];
  if (!set) return "";
  if ((ex.activityType || "STRENGTH") !== "STRENGTH") {
    return prescriptionSummary(set) || `${ex.sets.length} ${ex.sets.length === 1 ? "segment" : "segments"}`;
  }
  const setsLabel = isCircuit
    ? `${rounds} ${rounds === 1 ? "set" : "sets"}`
    : `${ex.sets.length} ${ex.sets.length === 1 ? "set" : "sets"}`;
  if (set.targetReps) return `${setsLabel} × ${set.targetReps} reps`;
  if (set.targetDuration) return `${setsLabel} × ${set.targetDuration}${set.targetDurationUnit === "MIN" ? "min" : "s"}`;
  return setsLabel;
}
