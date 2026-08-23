export interface CircuitCountPoolItem {
  id: string
  name: string
  bodyRegion: string[]
  exercisePhases: string[]
  defaultSets: number | null
  defaultReps: number | null
  defaultHoldSeconds: number | null
}

export interface CircuitCountConfig {
  exerciseCount: number
  focusType: string
}

export interface CircuitCountableExercise {
  exerciseId: string
  circuitIndex?: number
  orderIndex: number
}

// Mirrors the "Circuit focus guidelines" natural-language mapping given to the
// LLM in the generation prompt — used here to pick sensible backfill/trim
// candidates deterministically, since the prompt's guidance is not
// structurally enforced by the API (response_format: "json_object" doesn't
// constrain array length), so the model's actual per-circuit output can drift
// from what it was told.
const FOCUS_TYPE_MATCHERS: Record<string, (item: CircuitCountPoolItem) => boolean> = {
  WARMUP: (i) => i.exercisePhases.includes("WARMUP") || i.exercisePhases.includes("ACTIVATION"),
  LOWER_BODY: (i) => i.bodyRegion.includes("LOWER_BODY"),
  UPPER_BODY: (i) => i.bodyRegion.includes("UPPER_BODY"),
  CORE: (i) => i.bodyRegion.includes("CORE"),
  FLEXIBILITY: (i) => i.exercisePhases.includes("MOBILITY"),
  COOLDOWN: (i) => i.exercisePhases.includes("COOLDOWN") || i.exercisePhases.includes("MOBILITY"),
};

function matchesFocusType(item: CircuitCountPoolItem, focusType: string): boolean {
  const matcher = FOCUS_TYPE_MATCHERS[focusType];
  return matcher ? matcher(item) : true; // FULL_BODY, BALANCE, CARDIO: any exercise is a reasonable fit
}

/**
 * Deterministically corrects each day's per-circuit exercise count to match
 * the trainer-configured `exerciseCount` for that circuit. The generation
 * prompt tells the model "EXACTLY N exercises per circuit", but that's a
 * soft natural-language instruction under `response_format: "json_object"` —
 * there is no structural (JSON Schema array-length) guarantee, and the
 * existing invalid-ID filter can only ever reduce counts further, never
 * restore them. This trims any circuit that came back with too many
 * exercises and backfills any that came back short, preferring pool
 * exercises matching the circuit's focusType and not already used elsewhere
 * in the plan (preserving the "no repeat exerciseId across days" rule).
 */
export function enforceCircuitExerciseCounts<T extends CircuitCountableExercise>(
  exercisesByDay: Map<number, T[]>,
  circuits: CircuitCountConfig[],
  pool: CircuitCountPoolItem[],
  createExercise: (poolItem: CircuitCountPoolItem, circuitIndex: number, orderIndex: number, dayOfWeek: number) => T
): Map<number, T[]> {
  const usedIds = new Set<string>();
  for (const dayExercises of exercisesByDay.values()) {
    for (const ex of dayExercises) usedIds.add(ex.exerciseId);
  }

  const result = new Map<number, T[]>();
  for (const [day, dayExercises] of exercisesByDay) {
    const byCircuit = new Map<number, T[]>();
    const uncategorized: T[] = [];
    for (const ex of dayExercises) {
      if (ex.circuitIndex == null) {
        uncategorized.push(ex);
        continue;
      }
      if (!byCircuit.has(ex.circuitIndex)) byCircuit.set(ex.circuitIndex, []);
      byCircuit.get(ex.circuitIndex)!.push(ex);
    }

    const corrected: T[] = [...uncategorized];
    circuits.forEach((circuit, circuitIndex) => {
      let current = byCircuit.get(circuitIndex) ?? [];

      if (current.length > circuit.exerciseCount) {
        const trimmed = current.slice(circuit.exerciseCount);
        trimmed.forEach((ex) => usedIds.delete(ex.exerciseId));
        current = current.slice(0, circuit.exerciseCount);
      } else if (current.length < circuit.exerciseCount) {
        const dayUsedIds = new Set(current.map((e) => e.exerciseId));
        const needed = circuit.exerciseCount - current.length;
        const isAvailable = (p: CircuitCountPoolItem) => !usedIds.has(p.id) && !dayUsedIds.has(p.id);
        const focusMatches = pool.filter((p) => isAvailable(p) && matchesFocusType(p, circuit.focusType));
        const anyMatches = pool.filter(isAvailable);

        const picks: CircuitCountPoolItem[] = [];
        for (const source of [focusMatches, anyMatches]) {
          for (const item of source) {
            if (picks.length >= needed) break;
            if (picks.some((p) => p.id === item.id)) continue;
            picks.push(item);
          }
          if (picks.length >= needed) break;
        }

        picks.forEach((pick, i) => {
          usedIds.add(pick.id);
          dayUsedIds.add(pick.id);
          current.push(createExercise(pick, circuitIndex, current.length + i, day));
        });

        if (picks.length < needed) {
          console.warn(
            `[AI] Could not backfill circuit ${circuitIndex} on day ${day} to ${circuit.exerciseCount} exercises — pool exhausted (got ${current.length})`
          );
        }
      }

      corrected.push(...current);
    });

    result.set(day, corrected);
  }
  return result;
}
