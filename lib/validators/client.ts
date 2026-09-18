import { z } from "zod";

export const clientProfileSchema = z.object({
  limitations: z.string().max(2000, "Limitations must be less than 2000 characters").optional().nullable(),
  comorbidities: z.string().max(2000, "Comorbidities must be less than 2000 characters").optional().nullable(),
  functionalChallenges: z
    .string()
    .max(2000, "Functional challenges must be less than 2000 characters")
    .optional()
    .nullable(),
  availableEquipment: z.array(z.string()).optional().nullable(),
  fitnessGoals: z.array(z.string()).optional().nullable(),
  preferredDurationMinutes: z.number().int().min(10).max(90).optional().nullable(),
  preferredDaysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
});

export type ClientProfileInput = z.infer<typeof clientProfileSchema>;

/**
 * Optional free text. Zod trims it; the action turns what is left of a blank
 * field into null, so "nothing on file" is one value in the database rather
 * than a mix of null, "" and "   ".
 */
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be less than ${max} characters`).nullish();

const textList = z.array(z.string().trim().min(1)).max(50).optional();

/**
 * Everything a trainer may set on a client's intake record, spanning both the
 * `User` row (the personal fields) and `ClientProfile` (the rest).
 *
 * This is the trainer-side counterpart to the client's own onboarding form: a
 * client who clicked straight through it leaves all of this empty, and the
 * trainer fills in what they know from the first session.
 */
export const updateClientProfileSchema = z.object({
  // --- Personal (User) ---
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().max(100).optional().default(""),
  phone: optionalText(40, "Phone"),
  /** Stored as a plain `YYYY-MM-DD` string on User, matching onboarding. */
  dateOfBirth: optionalText(40, "Date of birth"),

  // --- Clinical (ClientProfile) ---
  primaryDiagnosis: optionalText(200, "Primary diagnosis"),
  secondaryDiagnoses: textList,
  painScore: z
    .number()
    .int()
    .min(0, "Pain score runs from 0 to 10")
    .max(10, "Pain score runs from 0 to 10")
    .nullish(),
  activityLevel: optionalText(60, "Activity level"),
  /** `YYYY-MM-DD`; converted to a Date by the action, since the column is a DateTime. */
  injuryDate: optionalText(40, "Injury date"),
  surgeryHistory: optionalText(2000, "Surgery history"),
  occupation: optionalText(200, "Occupation"),
  priorInjuries: textList,

  // --- Function & lifestyle ---
  limitations: optionalText(2000, "Limitations"),
  comorbidities: optionalText(2000, "Comorbidities"),
  functionalChallenges: optionalText(2000, "Functional challenges"),

  // --- Equipment, goals & preferences ---
  availableEquipment: textList,
  fitnessGoals: textList,
  preferredDurationMinutes: z
    .number()
    .int()
    .min(10, "Session length must be 10-90 minutes")
    .max(90, "Session length must be 10-90 minutes")
    .nullish(),
  preferredDaysPerWeek: z
    .number()
    .int()
    .min(1, "Days per week must be 1-7")
    .max(7, "Days per week must be 1-7")
    .nullish(),
});

export type UpdateClientProfileInput = z.input<typeof updateClientProfileSchema>;

export const linkClientSchema = z.object({
  clientEmail: z.string().email("Please enter a valid client email address"),
});

export type LinkClientInput = z.infer<typeof linkClientSchema>;
