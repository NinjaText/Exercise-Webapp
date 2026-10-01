"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { completeClubTrainerOnboarding } from "@/actions/club-trainer-onboarding-actions";
import { StepForm, useStepForm } from "./step-form";
import {
  buildClubTrainerOnboardingPayload,
  validateClubTrainer,
  type ClubTrainerOnboardingValues,
} from "./onboarding-payloads";
import { TextField } from "./onboarding-fields";

const VALIDATORS = [validateClubTrainer] as const;

/** Saves the names; true on success, otherwise the server error is toasted. */
export async function submitClubTrainerOnboarding(values: ClubTrainerOnboardingValues): Promise<boolean> {
  const res = await completeClubTrainerOnboarding(buildClubTrainerOnboardingPayload(values));
  if (!res.ok) {
    toast.error(res.error);
    return false;
  }
  return true;
}

/** The club trainer's one short step: confirm their name. */
export function ClubTrainerOnboardingForm({
  clubName,
  initialFirstName,
  initialLastName,
}: {
  clubName: string;
  initialFirstName: string;
  initialLastName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useStepForm<ClubTrainerOnboardingValues>(
    { firstName: initialFirstName, lastName: initialLastName },
    VALIDATORS,
  );
  const { values: v, errors, set } = form;

  const finish = () => {
    if (!form.validateAll()) return;
    startTransition(async () => {
      if (!(await submitClubTrainerOnboarding(form.values))) return;
      router.replace("/dashboard");
      router.refresh();
    });
  };

  return (
    <StepForm
      width="default"
      steps={[{ title: "Welcome, coach", description: `You're the trainer for ${clubName}. Tell us your name to get started.` }]}
      step={0}
      onBack={form.back}
      onContinue={form.next}
      onFinish={finish}
      pending={pending}
      invalidAttempt={form.invalidAttempt}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="firstName"
          label="First name"
          required
          autoComplete="given-name"
          maxLength={80}
          value={v.firstName}
          onValueChange={(firstName) => set({ firstName })}
          error={errors.firstName}
        />
        <TextField
          id="lastName"
          label="Last name"
          required
          autoComplete="family-name"
          maxLength={80}
          value={v.lastName}
          onValueChange={(lastName) => set({ lastName })}
          error={errors.lastName}
        />
      </div>
    </StepForm>
  );
}
