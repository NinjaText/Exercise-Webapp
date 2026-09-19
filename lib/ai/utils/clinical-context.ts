export type ProgramMode = 'CLINICAL' | 'PERFORMANCE'

export interface ClinicalSignalProfile {
  primaryDiagnosis?: string | null
  secondaryDiagnoses?: string[] | null
  painScore?: number | null
  limitations?: string | null
  comorbidities?: string | null
  functionalChallenges?: string | null
  surgeryHistory?: string | null
  injuryDate?: Date | string | null
  priorInjuries?: string[] | null
}

function hasText(value?: string | null): boolean {
  return !!value && value.trim().length > 0
}

function hasItems(value?: string[] | null): boolean {
  return !!value && value.length > 0
}

/**
 * True iff the client's profile documents any clinical/rehab-relevant signal.
 * Purely inferred from existing ClientProfile fields — no separate flag exists.
 * A `painScore` of 0 does not count as documented pain.
 */
export function hasDocumentedClinicalNeed(
  profile: ClinicalSignalProfile | null | undefined
): boolean {
  if (!profile) return false
  return (
    hasText(profile.primaryDiagnosis) ||
    hasItems(profile.secondaryDiagnoses) ||
    (profile.painScore != null && profile.painScore > 0) ||
    hasText(profile.limitations) ||
    hasText(profile.comorbidities) ||
    hasText(profile.functionalChallenges) ||
    hasText(profile.surgeryHistory) ||
    profile.injuryDate != null ||
    hasItems(profile.priorInjuries)
  )
}

export function determineProgramMode(
  profile: ClinicalSignalProfile | null | undefined
): ProgramMode {
  return hasDocumentedClinicalNeed(profile) ? 'CLINICAL' : 'PERFORMANCE'
}

export interface ClientContextProfile extends ClinicalSignalProfile {
  activityLevel?: string | null
  occupation?: string | null
  fitnessGoals?: string[] | null
  availableEquipment?: string[] | null
}

export interface ClientContextClient {
  firstName: string
  lastName: string
}

function weeksSince(date: Date): number {
  return Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 7))
}

export interface ClientContextOptions {
  /** Equipment the trainer selected for THIS program. When present it is
   *  authoritative over whatever the stored client profile lists. */
  trainerSelectedEquipment?: string[] | null
}

function describeTrainerEquipment(selected: string[]): string {
  const real = selected.map(e => e.trim()).filter(e => e && e.toLowerCase() !== 'none')
  return real.length > 0
    ? `${real.join(', ')} (selected by the trainer for this program — authoritative)`
    : 'Bodyweight only (selected by the trainer for this program — authoritative)'
}

/**
 * Single canonical client-profile-to-prompt-text builder, shared by both
 * generateClinicalPlan and generateWorkoutPlan so the two prompts can't drift.
 *
 * Structure follows Layer 2 of the Inmotus AI Exercise Program Generation
 * Backend Prompt Specification. Only fields actually present in
 * ClientProfile are included — the spec's template names several fields
 * (e.g. romRestrictions, strengthDeficits, toleratedExercises) that have no
 * backing column yet; per the spec's own "omit unavailable fields rather
 * than treating missing data as a confirmed negative finding" rule, those
 * are left out rather than faked.
 */
export function buildClientContextBlock(
  client: ClientContextClient | null | undefined,
  profile: ClientContextProfile | null | undefined,
  options: ClientContextOptions = {}
): string {
  const trainerEquipment = options.trainerSelectedEquipment ?? []
  if (!client) {
    const equipmentLine = trainerEquipment.length > 0
      ? `
Available Equipment: ${describeTrainerEquipment(trainerEquipment)}`
      : ''
    return `No specific client assigned. Create a general program suitable for the parameters below.${equipmentLine}`
  }

  const equipmentDescription = trainerEquipment.length > 0
    ? describeTrainerEquipment(trainerEquipment)
    : hasItems(profile?.availableEquipment)
      ? `${profile!.availableEquipment!.join(', ')} (from client profile)`
      : 'Not specified — assume bodyweight only unless the program parameters list equipment'

  const injuryDate = profile?.injuryDate ? new Date(profile.injuryDate) : null

  return `CLIENT CONTEXT
Name: ${client.firstName} ${client.lastName}
Activity Level: ${profile?.activityLevel ?? 'Not assessed'}
Occupation: ${profile?.occupation ?? 'Not specified'}

CLIENT GOALS
${hasItems(profile?.fitnessGoals) ? profile!.fitnessGoals!.join(', ') : 'General fitness'}

CURRENT CLINICAL STATUS
Primary Diagnosis / Goal: ${profile?.primaryDiagnosis ?? 'Not specified'}
Secondary Conditions: ${hasItems(profile?.secondaryDiagnoses) ? profile!.secondaryDiagnoses!.join(', ') : 'None documented'}
Current Pain Score: ${profile?.painScore != null ? `${profile.painScore}/10` : 'Not assessed'}
Current Functional Challenges: ${profile?.functionalChallenges ?? 'None documented'}
Relevant Medical / Surgical History: ${profile?.surgeryHistory ?? 'None documented'}
Comorbidities: ${profile?.comorbidities ?? 'None documented'}
Time Since Injury/Surgery: ${injuryDate ? `${weeksSince(injuryDate)} weeks ago` : 'Not specified'}
Relevant Previous Injuries: ${hasItems(profile?.priorInjuries) ? profile!.priorInjuries!.join(', ') : 'None documented'}

CONTRAINDICATIONS & PRECAUTIONS
Exercise / Movement Restrictions: ${profile?.limitations ?? 'None documented'}

AVAILABLE TRAINING RESOURCES
Available Equipment: ${equipmentDescription}

CONTEXT RULES:
- Use only the populated information above.
- Do not interpret blank, null, missing, or "None documented" fields as confirmed restrictions or confirmed absence of a problem.
- Do not invent missing client information.
- Distinguish CURRENT problems from HISTORICAL problems — historical injuries influence programming only when still relevant to current function, safety, performance, or trainer instructions.
- Current symptoms, current restrictions, Trainer Subjective, and Trainer Instructions receive greater weight than historical information.`
}
