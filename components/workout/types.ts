export type SetLogEntry = {
  actualReps?: number;
  actualWeight?: number;
  actualDuration?: number;
  actualDistance?: number;
  actualRPE?: number;
  completed: boolean;
};

// blockExerciseId -> setIndex -> entry
export type SetLogCache = Record<string, Record<number, SetLogEntry>>;

/** Reasons offered when a client skips an exercise; saved on the set log's notes for the trainer. */
export const SKIP_REASONS = ["Too painful", "Too difficult", "No equipment", "Too tired", "Other"] as const;
