export type ProgramMode = 'CLINICAL' | 'PERFORMANCE'

export type ClinicalRehabStage = 'EARLY_REHAB' | 'MID_REHAB' | 'LATE_REHAB' | 'MAINTENANCE'
export type PerformancePhase = 'BASE_BUILD' | 'BUILD' | 'PEAK' | 'TAPER' | 'GENERAL_FITNESS'
export type ProgramPhaseLabel = ClinicalRehabStage | PerformancePhase

export interface WeekPlan {
  week: number
  title: string
  /** This week's stage/phase label. Vocabulary depends on programMode:
   *  ClinicalRehabStage when CLINICAL, PerformancePhase when PERFORMANCE.
   *  Field name kept as `rehabStage` for compatibility with existing
   *  exercise-pool queries and UI display code. */
  rehabStage: ProgramPhaseLabel
  programMode: ProgramMode
  focusAreas: string[]
  difficultyLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  clinicalGuidance: string
  contraindicationsThisWeek: string[]
  progressionGoal: string
  derivedIndicationTags: string[]
}

export interface ClinicalPlan {
  clinicalAssessment: string
  programMode: ProgramMode
  weeklyPlan: WeekPlan[]
}

export interface ClinicalPlanParams {
  clientId?: string | null
  /** Explicit trainer override — when present, always wins over the automatic
   *  clinical-signal inference (determineProgramMode). */
  programMode?: ProgramMode
  programGoals: string[]
  availableEquipment?: string[]
  durationWeeks: number
  daysPerWeek: number
  difficultyLevel: string
  circuits: {
    name: string
    focusType: string
    exerciseCount: number
    rounds: number
    restBetweenRounds: number | null
  }[]
  preferredWeekdays?: string[]
  subjective?: string
  trainerPrompt?: string
  additionalNotes?: string
}

/** One contiguous run of weeks sharing the same (programMode, rehabStage). */
export interface ProgramPhaseGroup {
  phaseIndex: number
  label: ProgramPhaseLabel
  weeks: WeekPlan[]
  startWeek: number
  endWeek: number
}
