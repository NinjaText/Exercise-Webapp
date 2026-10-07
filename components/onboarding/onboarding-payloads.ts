/**
 * Form values, per-step validation and server-action payloads for the
 * onboarding step forms. Pure and browser-safe.
 *
 * The payload builders reproduce, field for field, the objects the
 * pre-step-form components passed to their server actions. Validation keeps
 * the old required/optional semantics exactly: only names (and the trainer's
 * organization name) are required, and only the club-trainer form trims.
 */
import type { completeClientOnboarding, completeTrainerOnboarding } from "@/actions/onboarding-actions";
import type { completeClubTrainerOnboarding } from "@/actions/club-trainer-onboarding-actions";
import type { FieldErrors, StepValidator } from "./step-form-state";

// ── Client ────────────────────────────────────────────────────────────────

export interface ClientOnboardingValues {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  primaryDiagnosis: string;
  /** Raw input text; parsed only in the payload, as before. */
  painScore: string;
  activityLevel: string;
  injuryDate: string;
  surgeryHistory: string;
  occupation: string;
  limitations: string;
  comorbidities: string;
  functionalChallenges: string;
  availableEquipment: string[];
  /** Preset the equipment came from ("Home Gym"), or null when hand-picked. */
  equipmentSetupName?: string | null;
  fitnessGoals: string[];
}

export const EMPTY_CLIENT_ONBOARDING_VALUES: ClientOnboardingValues = {
  firstName: "",
  lastName: "",
  phone: "",
  dateOfBirth: "",
  primaryDiagnosis: "",
  painScore: "",
  activityLevel: "",
  injuryDate: "",
  surgeryHistory: "",
  occupation: "",
  limitations: "",
  comorbidities: "",
  functionalChallenges: "",
  availableEquipment: [],
  fitnessGoals: [],
};

export function buildClientOnboardingPayload(
  v: ClientOnboardingValues,
): Parameters<typeof completeClientOnboarding>[0] {
  return {
    firstName: v.firstName,
    lastName: v.lastName,
    phone: v.phone || undefined,
    dateOfBirth: v.dateOfBirth || undefined,
    limitations: v.limitations || undefined,
    comorbidities: v.comorbidities || undefined,
    functionalChallenges: v.functionalChallenges || undefined,
    availableEquipment: v.availableEquipment,
    ...(v.equipmentSetupName ? { equipmentSetupName: v.equipmentSetupName } : {}),
    fitnessGoals: v.fitnessGoals,
    primaryDiagnosis: v.primaryDiagnosis || undefined,
    painScore: v.painScore ? parseInt(v.painScore) : undefined,
    activityLevel: v.activityLevel || undefined,
    injuryDate: v.injuryDate || undefined,
    surgeryHistory: v.surgeryHistory || undefined,
    occupation: v.occupation || undefined,
  };
}

function requireNames(v: { firstName: string; lastName: string }, trim = false): FieldErrors {
  const errors: FieldErrors = {};
  if (!(trim ? v.firstName.trim() : v.firstName)) errors.firstName = "Enter your first name.";
  if (!(trim ? v.lastName.trim() : v.lastName)) errors.lastName = "Enter your last name.";
  return errors;
}

/** Steps: About you · Health & history · Training & goals · Review. */
export const CLIENT_STEP_VALIDATORS: readonly (StepValidator<ClientOnboardingValues> | undefined)[] = [
  (v) => requireNames(v),
  undefined,
  undefined,
  undefined,
];

// ── Trainer (trainer-org signup) ──────────────────────────────────────────

export interface TrainerOnboardingValues {
  firstName: string;
  lastName: string;
  phone: string;
  organizationName: string;
}

export const EMPTY_TRAINER_ONBOARDING_VALUES: TrainerOnboardingValues = {
  firstName: "",
  lastName: "",
  phone: "",
  organizationName: "",
};

export function buildTrainerOnboardingPayload(
  v: TrainerOnboardingValues,
): Parameters<typeof completeTrainerOnboarding>[0] {
  return {
    firstName: v.firstName,
    lastName: v.lastName,
    organizationName: v.organizationName,
    phone: v.phone || undefined,
  };
}

/** Steps: About you · Organization. */
export const TRAINER_STEP_VALIDATORS: readonly (StepValidator<TrainerOnboardingValues> | undefined)[] = [
  (v) => requireNames(v),
  (v): FieldErrors => (v.organizationName ? {} : { organizationName: "Enter your organization's name." }),
];

// ── Club trainer ──────────────────────────────────────────────────────────

export interface ClubTrainerOnboardingValues {
  firstName: string;
  lastName: string;
}

export function buildClubTrainerOnboardingPayload(
  v: ClubTrainerOnboardingValues,
): Parameters<typeof completeClubTrainerOnboarding>[0] {
  return { firstName: v.firstName, lastName: v.lastName };
}

export const validateClubTrainer: StepValidator<ClubTrainerOnboardingValues> = (v) => requireNames(v, true);
