import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/actions/onboarding-actions", () => ({
  completeClientOnboarding: vi.fn(),
  completeTrainerOnboarding: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import { toast } from "sonner";
import { completeClientOnboarding, completeTrainerOnboarding } from "@/actions/onboarding-actions";
import {
  ClientOnboardingForm,
  ClientOnboardingStepFields,
  submitClientOnboarding,
} from "../client-onboarding-form";
import { OnboardingForm, submitTrainerOnboarding } from "../onboarding-form";
import { EMPTY_CLIENT_ONBOARDING_VALUES, CLIENT_STEP_VALIDATORS, type ClientOnboardingValues } from "../onboarding-payloads";
import { createStepFormState, stepFormReducer, type StepFormState } from "../step-form-state";

const FULL: ClientOnboardingValues = {
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
  availableEquipment: ["Dumbbells", "Yoga Mat"],
  fitnessGoals: ["Improve mobility"],
};

/** What the pre-redesign form sent for FULL (its inline object, evaluated). */
const LEGACY_FULL_CLIENT_PAYLOAD = {
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+1 555 0100",
  dateOfBirth: "1990-12-10",
  limitations: "Cannot fully straighten knee",
  comorbidities: "Type 2 diabetes",
  functionalChallenges: "Stairs",
  availableEquipment: ["Dumbbells", "Yoga Mat"],
  fitnessGoals: ["Improve mobility"],
  primaryDiagnosis: "ACL Tear Post-Op",
  painScore: 4,
  activityLevel: "MODERATE",
  injuryDate: "2026-01-15",
  surgeryHistory: "Right ACL reconstruction Jan 2026",
  occupation: "Nurse",
};

beforeEach(() => vi.clearAllMocks());

describe("client onboarding submit", () => {
  it("calls completeClientOnboarding with exactly the legacy payload", async () => {
    vi.mocked(completeClientOnboarding).mockResolvedValue(undefined as any);
    await submitClientOnboarding(FULL);
    expect(completeClientOnboarding).toHaveBeenCalledTimes(1);
    expect(vi.mocked(completeClientOnboarding).mock.calls[0][0]).toStrictEqual(LEGACY_FULL_CLIENT_PAYLOAD);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("still surfaces a server-side error", async () => {
    vi.mocked(completeClientOnboarding).mockResolvedValue({ success: false, error: "This account already belongs to a club." });
    await submitClientOnboarding(FULL);
    expect(toast.error).toHaveBeenCalledWith("This account already belongs to a club.");
  });

  it("walking the steps (with Back) and submitting sends the same payload", async () => {
    vi.mocked(completeClientOnboarding).mockResolvedValue(undefined as any);
    const next = (s: StepFormState<ClientOnboardingValues>) =>
      stepFormReducer(s, { type: "next", stepCount: 4, validate: CLIENT_STEP_VALIDATORS[s.step] });
    let s = createStepFormState(EMPTY_CLIENT_ONBOARDING_VALUES);
    s = next(s); // blocked: names required
    expect(s.step).toBe(0);
    expect(Object.keys(s.errors)).toEqual(["firstName", "lastName"]);
    s = stepFormReducer(s, { type: "set", patch: { firstName: FULL.firstName, lastName: FULL.lastName, phone: FULL.phone, dateOfBirth: FULL.dateOfBirth } });
    s = next(s);
    s = stepFormReducer(s, {
      type: "set",
      patch: {
        primaryDiagnosis: FULL.primaryDiagnosis, painScore: FULL.painScore, injuryDate: FULL.injuryDate,
        surgeryHistory: FULL.surgeryHistory, limitations: FULL.limitations, comorbidities: FULL.comorbidities,
        functionalChallenges: FULL.functionalChallenges,
      },
    });
    s = next(s);
    s = stepFormReducer(s, { type: "set", patch: { availableEquipment: FULL.availableEquipment, fitnessGoals: FULL.fitnessGoals, activityLevel: FULL.activityLevel, occupation: FULL.occupation } });
    s = stepFormReducer(s, { type: "back" });
    s = stepFormReducer(s, { type: "back" });
    expect(s.values).toStrictEqual(FULL);
    s = next(next(next(s)));
    expect(s.step).toBe(3);
    await submitClientOnboarding(s.values);
    expect(vi.mocked(completeClientOnboarding).mock.calls[0][0]).toStrictEqual(LEGACY_FULL_CLIENT_PAYLOAD);
  });
});

describe("trainer onboarding submit", () => {
  it("calls completeTrainerOnboarding with exactly the legacy payload and surfaces errors", async () => {
    vi.mocked(completeTrainerOnboarding).mockResolvedValue({ success: false, error: "This account already belongs to a club." });
    await submitTrainerOnboarding({ firstName: "Sam", lastName: "Lee", organizationName: "Summit PT", phone: "555 0100" });
    expect(vi.mocked(completeTrainerOnboarding).mock.calls[0][0]).toStrictEqual({
      firstName: "Sam",
      lastName: "Lee",
      organizationName: "Summit PT",
      phone: "555 0100",
    });
    expect(toast.error).toHaveBeenCalledWith("This account already belongs to a club.");
  });
});

describe("rendering", () => {
  const noop = () => {};

  it("client form starts on 'About you', step 1 of 4", () => {
    const html = renderToStaticMarkup(<ClientOnboardingForm />);
    expect(html).toContain("Step 1 of 4");
    expect(html).toMatch(/<h2[^>]*>About you<\/h2>/);
    expect(html).toContain('id="firstName"');
    expect(html).toContain('id="lastName"');
    expect(html).toContain('id="phone"');
    expect(html).toContain('id="dob"');
    expect(html).not.toContain('id="primaryDiagnosis"');
  });

  it("errors render on the step that owns the field", () => {
    const html = renderToStaticMarkup(
      <ClientOnboardingStepFields step={0} values={EMPTY_CLIENT_ONBOARDING_VALUES} errors={{ firstName: "Enter your first name." }} set={noop} goTo={noop} />,
    );
    expect(html).toMatch(/<input[^>]*aria-invalid="true"[^>]*id="firstName"|<input[^>]*id="firstName"[^>]*aria-invalid="true"/);
    expect(html).toContain('id="firstName-error"');
    expect(html).toContain("Enter your first name.");
  });

  it("steps 2 and 3 hold the health and training fields", () => {
    const health = renderToStaticMarkup(<ClientOnboardingStepFields step={1} values={FULL} errors={{}} set={noop} goTo={noop} />);
    for (const id of ["primaryDiagnosis", "painScore", "injuryDate", "surgeryHistory", "limitations", "comorbidities", "functional"]) {
      expect(health).toContain(`id="${id}"`);
    }
    const training = renderToStaticMarkup(<ClientOnboardingStepFields step={2} values={FULL} errors={{}} set={noop} goTo={noop} />);
    expect(training).toContain('id="activityLevel"');
    expect(training).toContain('id="occupation"');
    expect(training).toMatch(/aria-pressed="true"[^>]*>Dumbbells</);
    // Built-in setups replace the old "None" chip; bodyweight only is one of them.
    expect(training).toContain("Bodyweight only");
    expect(training).toContain("Home Gym");
  });

  it("the review step summarises every entered value with edit links", () => {
    const html = renderToStaticMarkup(<ClientOnboardingStepFields step={3} values={FULL} errors={{}} set={noop} goTo={noop} />);
    for (const text of ["Ada Lovelace", "+1 555 0100", "ACL Tear Post-Op", "4 / 10", "Moderate", "Dumbbells, Yoga Mat", "Improve mobility", "Nurse"]) {
      expect(html).toContain(text);
    }
    expect(html.match(/Edit<span class="sr-only">/g)).toHaveLength(3);
  });

  it("trainer form: About you, step 1 of 2", () => {
    const html = renderToStaticMarkup(<OnboardingForm />);
    expect(html).toContain("Step 1 of 2");
    expect(html).toMatch(/<h2[^>]*>About you<\/h2>/);
    expect(html).not.toContain('id="organizationName"');
  });
});
