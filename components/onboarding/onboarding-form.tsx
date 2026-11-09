"use client";

import { useState } from "react";
import { toast } from "sonner";
import { completeTrainerOnboarding } from "@/actions/onboarding-actions";
import { StepForm, useStepForm, type StepMeta } from "./step-form";
import {
  EMPTY_TRAINER_ONBOARDING_VALUES,
  TRAINER_STEP_VALIDATORS,
  buildTrainerOnboardingPayload,
  type TrainerOnboardingValues,
} from "./onboarding-payloads";
import { SelectField, TextField } from "./onboarding-fields";
import { PhiAttestation } from "./phi-attestation";
import { PROFESSIONAL_ROLES } from "@/lib/legal/consent";

const STEPS: readonly StepMeta[] = [
  {
    title: "About you",
    description: "For trainers, physical therapists, coaches, nutrition professionals, and other wellness providers.",
  },
  { title: "Your organization", description: "The practice or business your clients will see." },
];

/** Creates the organization; a server-side refusal is shown as a toast, as before. */
export async function submitTrainerOnboarding(values: TrainerOnboardingValues) {
  const result = await completeTrainerOnboarding(buildTrainerOnboardingPayload(values));
  if (result && !result.success) toast.error(result.error);
}

/** Trainer-org signup: About you → Your organization. */
export function OnboardingForm() {
  const form = useStepForm(EMPTY_TRAINER_ONBOARDING_VALUES, TRAINER_STEP_VALIDATORS);
  const [loading, setLoading] = useState(false);
  const { values: v, errors, set } = form;

  async function finish() {
    if (!form.validateAll()) return;
    setLoading(true);
    try {
      await submitTrainerOnboarding(form.values);
    } finally {
      setLoading(false);
    }
  }

  return (
    <StepForm
      steps={STEPS}
      step={form.step}
      onBack={form.back}
      onContinue={form.next}
      onFinish={finish}
      pending={loading}
      invalidAttempt={form.invalidAttempt}
    >
      {form.step === 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="firstName"
              label="First name"
              required
              autoComplete="given-name"
              value={v.firstName}
              onValueChange={(firstName) => set({ firstName })}
              error={errors.firstName}
            />
            <TextField
              id="lastName"
              label="Last name"
              required
              autoComplete="family-name"
              value={v.lastName}
              onValueChange={(lastName) => set({ lastName })}
              error={errors.lastName}
            />
          </div>
          <TextField
            id="phone"
            label="Phone (optional)"
            type="tel"
            autoComplete="tel"
            value={v.phone}
            onValueChange={(phone) => set({ phone })}
          />
          <SelectField
            id="professionalRole"
            label="Professional role"
            required
            placeholder="Select your role"
            options={PROFESSIONAL_ROLES}
            value={v.professionalRole}
            onValueChange={(professionalRole) => set({ professionalRole })}
            error={errors.professionalRole}
          />
        </>
      ) : (
        <>
          <TextField
            id="organizationName"
            label="Organization name"
            required
            autoComplete="organization"
            value={v.organizationName}
            onValueChange={(organizationName) => set({ organizationName })}
            error={errors.organizationName}
            placeholder="e.g., Summit Physical Therapy"
          />
          <PhiAttestation
            checked={v.phiAttested}
            onCheckedChange={(phiAttested) => set({ phiAttested })}
            error={errors.phiAttested}
          />
        </>
      )}
    </StepForm>
  );
}
