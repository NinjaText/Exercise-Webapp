import { describe, it, expect } from "vitest";
import {
  EMPTY_CLIENT_ONBOARDING_VALUES,
  EMPTY_TRAINER_ONBOARDING_VALUES,
  buildClientOnboardingPayload,
  buildTrainerOnboardingPayload,
  CLIENT_STEP_VALIDATORS,
  TRAINER_STEP_VALIDATORS,
  type ClientOnboardingValues,
} from "../onboarding-payloads";

/**
 * Verbatim copy of the object the pre-redesign ClientOnboardingForm passed to
 * completeClientOnboarding (one useState per field). The step form must send
 * exactly this for the same entered values.
 */
function legacyClientPayload(s: ClientOnboardingValues) {
  const {
    firstName, lastName, phone, dateOfBirth, limitations, comorbidities, functionalChallenges,
    primaryDiagnosis, painScore, activityLevel, injuryDate, surgeryHistory, occupation,
  } = s;
  const selectedEquipment = s.availableEquipment;
  const selectedGoals = s.fitnessGoals;
  return {
    firstName,
    lastName,
    phone: phone || undefined,
    dateOfBirth: dateOfBirth || undefined,
    limitations: limitations || undefined,
    comorbidities: comorbidities || undefined,
    functionalChallenges: functionalChallenges || undefined,
    availableEquipment: selectedEquipment,
    fitnessGoals: selectedGoals,
    primaryDiagnosis: primaryDiagnosis || undefined,
    painScore: painScore ? parseInt(painScore) : undefined,
    activityLevel: activityLevel || undefined,
    injuryDate: injuryDate || undefined,
    surgeryHistory: surgeryHistory || undefined,
    occupation: occupation || undefined,
  };
}

const FULL_CLIENT_VALUES: ClientOnboardingValues = {
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+1 555 0100",
  dateOfBirth: "1990-12-10",
  primaryDiagnosis: "ACL Tear Post-Op",
  painScore: "4",
  activityLevel: "MODERATE",
  injuryDate: "2026-01-15",
  surgeryHistory: "Right ACL reconstruction Jan 2026",
  occupation: "Nurse",
  limitations: "Cannot fully straighten knee",
  comorbidities: "Type 2 diabetes",
  functionalChallenges: "Stairs",
  availableEquipment: ["Dumbbells", "Resistance Bands"],
  fitnessGoals: ["Improve mobility"],
};

describe("buildClientOnboardingPayload", () => {
  it("matches the legacy payload exactly for a fully filled form", () => {
    const payload = buildClientOnboardingPayload(FULL_CLIENT_VALUES);
    expect(payload).toStrictEqual(legacyClientPayload(FULL_CLIENT_VALUES));
    expect(payload).toStrictEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+1 555 0100",
      dateOfBirth: "1990-12-10",
      limitations: "Cannot fully straighten knee",
      comorbidities: "Type 2 diabetes",
      functionalChallenges: "Stairs",
      availableEquipment: ["Dumbbells", "Resistance Bands"],
      fitnessGoals: ["Improve mobility"],
      primaryDiagnosis: "ACL Tear Post-Op",
      painScore: 4,
      activityLevel: "MODERATE",
      injuryDate: "2026-01-15",
      surgeryHistory: "Right ACL reconstruction Jan 2026",
      occupation: "Nurse",
    });
    expect(Object.keys(payload)).toEqual(Object.keys(legacyClientPayload(FULL_CLIENT_VALUES)));
  });

  it("matches the legacy payload for a names-only form (optional fields undefined, arrays empty)", () => {
    const v = { ...EMPTY_CLIENT_ONBOARDING_VALUES, firstName: "A", lastName: "B" };
    expect(buildClientOnboardingPayload(v)).toStrictEqual(legacyClientPayload(v));
    expect(buildClientOnboardingPayload(v).availableEquipment).toEqual([]);
    expect(buildClientOnboardingPayload(v).painScore).toBeUndefined();
  });

  it("keeps a pain score of 0 (legacy: non-empty string → parseInt)", () => {
    const v = { ...FULL_CLIENT_VALUES, painScore: "0" };
    expect(buildClientOnboardingPayload(v).painScore).toBe(0);
    expect(buildClientOnboardingPayload(v)).toStrictEqual(legacyClientPayload(v));
  });
});

describe("buildTrainerOnboardingPayload", () => {
  it("matches the legacy payload", () => {
    const full = { firstName: "Sam", lastName: "Lee", organizationName: "Summit PT", phone: "555" };
    expect(buildTrainerOnboardingPayload(full)).toStrictEqual({
      firstName: "Sam",
      lastName: "Lee",
      organizationName: "Summit PT",
      phone: "555",
    });
    expect(buildTrainerOnboardingPayload({ ...full, phone: "" })).toStrictEqual({
      firstName: "Sam",
      lastName: "Lee",
      organizationName: "Summit PT",
      phone: undefined,
    });
  });
});

describe("validators keep the legacy required/optional semantics", () => {
  it("client: only first and last name are required, on step 1", () => {
    expect(CLIENT_STEP_VALIDATORS[0]!(EMPTY_CLIENT_ONBOARDING_VALUES)).toEqual({
      firstName: expect.any(String),
      lastName: expect.any(String),
    });
    expect(CLIENT_STEP_VALIDATORS[0]!({ ...EMPTY_CLIENT_ONBOARDING_VALUES, firstName: "A", lastName: "B" })).toEqual({});
    for (const v of CLIENT_STEP_VALIDATORS.slice(1)) {
      expect(v ? v(EMPTY_CLIENT_ONBOARDING_VALUES) : {}).toEqual({});
    }
  });

  it("trainer: names on step 1, organization name on step 2, phone optional", () => {
    expect(Object.keys(TRAINER_STEP_VALIDATORS[0]!(EMPTY_TRAINER_ONBOARDING_VALUES))).toEqual(["firstName", "lastName"]);
    expect(Object.keys(TRAINER_STEP_VALIDATORS[1]!(EMPTY_TRAINER_ONBOARDING_VALUES))).toEqual(["organizationName"]);
  });
});
