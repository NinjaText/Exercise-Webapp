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

/**
 * Single canonical client-profile-to-prompt-text builder, shared by both
 * generateClinicalPlan and generateWorkoutPlan so the two prompts can't drift.
 */
export function buildClientContextBlock(
  client: ClientContextClient | null | undefined,
  profile: ClientContextProfile | null | undefined
): string {
  if (!client) {
    return 'No specific client assigned. Create a general program suitable for the parameters below.'
  }

  const injuryDate = profile?.injuryDate ? new Date(profile.injuryDate) : null

  return `CLIENT PROFILE:
Name: ${client.firstName} ${client.lastName}
Primary Diagnosis / Goal: ${profile?.primaryDiagnosis ?? 'Not specified'}
Secondary Conditions: ${hasItems(profile?.secondaryDiagnoses) ? profile!.secondaryDiagnoses!.join(', ') : 'None'}
Current Pain Score: ${profile?.painScore != null ? `${profile.painScore}/10` : 'Not assessed'}
Activity Level: ${profile?.activityLevel ?? 'Not assessed'}
Physical Limitations: ${profile?.limitations ?? 'None documented'}
Comorbidities: ${profile?.comorbidities ?? 'None'}
Functional Challenges: ${profile?.functionalChallenges ?? 'None'}
History: ${profile?.surgeryHistory ?? 'None documented'}
Occupation: ${profile?.occupation ?? 'Not specified'}
Time Since Injury/Surgery: ${injuryDate ? `${weeksSince(injuryDate)} weeks ago` : 'Not specified'}
Prior Injuries: ${hasItems(profile?.priorInjuries) ? profile!.priorInjuries!.join(', ') : 'None'}
Available Equipment: ${hasItems(profile?.availableEquipment) ? profile!.availableEquipment!.join(', ') : 'Bodyweight only'}
Goals: ${hasItems(profile?.fitnessGoals) ? profile!.fitnessGoals!.join(', ') : 'General fitness'}`
}
