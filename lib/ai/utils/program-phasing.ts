import type { ProgramPhaseGroup, WeekPlan } from '@/lib/ai/types/program-generation'

/**
 * Groups contiguous weeks sharing the same rehabStage/phase label into phases.
 * Same mechanism for CLINICAL and PERFORMANCE — both modes populate
 * WeekPlan.rehabStage with the appropriate label vocabulary in Step 1.
 * A label that repeats non-contiguously (e.g. EARLY, MID, EARLY) produces
 * separate phases, not one merged phase.
 */
export function groupWeeksIntoPhases(weekPlans: WeekPlan[]): ProgramPhaseGroup[] {
  const phases: ProgramPhaseGroup[] = []

  for (const wp of weekPlans) {
    const last = phases[phases.length - 1]
    if (last && last.label === wp.rehabStage) {
      last.weeks.push(wp)
      last.endWeek = wp.week
    } else {
      phases.push({
        phaseIndex: phases.length,
        label: wp.rehabStage,
        weeks: [wp],
        startWeek: wp.week,
        endWeek: wp.week,
      })
    }
  }

  return phases
}
