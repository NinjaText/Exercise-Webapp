"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ACTIVITY_LEVELS, FITNESS_GOALS } from "@/lib/utils/constants";
import { EquipmentPicker } from "@/components/equipment/equipment-picker";
import { completeClientOnboarding } from "@/actions/onboarding-actions";
import { StepForm, useStepForm, type StepMeta } from "./step-form";
import type { FieldErrors } from "./step-form-state";
import {
  CLIENT_STEP_VALIDATORS,
  EMPTY_CLIENT_ONBOARDING_VALUES,
  buildClientOnboardingPayload,
  type ClientOnboardingValues,
} from "./onboarding-payloads";
import { SelectField, TextAreaField, TextField, ToggleGroupField, toggleItem } from "./onboarding-fields";

const NO_PROFILES: never[] = [];

const STEPS: readonly StepMeta[] = [
  { title: "About you", description: "Your name and how your trainer can reach you." },
  {
    title: "Health & history",
    description: "This helps your trainer personalize your exercise program. Everything here is optional.",
  },
  { title: "Training & goals", description: "What you have to work with and what you want to achieve." },
  { title: "Review", description: "Check your details, then finish setting up your profile." },
];

/** Sends the profile; a server-side refusal is shown as a toast, as before. */
export async function submitClientOnboarding(values: ClientOnboardingValues) {
  const result = await completeClientOnboarding(buildClientOnboardingPayload(values));
  if (result && !result.success) toast.error(result.error);
}

export function ClientOnboardingForm() {
  const form = useStepForm(EMPTY_CLIENT_ONBOARDING_VALUES, CLIENT_STEP_VALIDATORS);
  const [loading, setLoading] = useState(false);

  async function finish() {
    if (!form.validateAll()) return;
    setLoading(true);
    try {
      await submitClientOnboarding(form.values);
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
      <ClientOnboardingStepFields
        step={form.step}
        values={form.values}
        errors={form.errors}
        set={form.set}
        goTo={form.goTo}
      />
    </StepForm>
  );
}

interface StepFieldsProps {
  step: number;
  values: ClientOnboardingValues;
  errors: FieldErrors;
  set: (patch: Partial<ClientOnboardingValues>) => void;
  goTo: (step: number) => void;
}

/** The fields of one client onboarding step (exported for render tests). */
export function ClientOnboardingStepFields({ step, values: v, errors, set, goTo }: StepFieldsProps) {
  switch (step) {
    case 0:
      return (
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
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="phone"
              label="Phone (optional)"
              type="tel"
              autoComplete="tel"
              value={v.phone}
              onValueChange={(phone) => set({ phone })}
            />
            <TextField
              id="dob"
              label="Date of birth"
              type="date"
              autoComplete="bday"
              value={v.dateOfBirth}
              onValueChange={(dateOfBirth) => set({ dateOfBirth })}
            />
          </div>
        </>
      );
    case 1:
      return (
        <>
          <TextField
            id="primaryDiagnosis"
            label="Primary diagnosis / reason for referral"
            value={v.primaryDiagnosis}
            onValueChange={(primaryDiagnosis) => set({ primaryDiagnosis })}
            placeholder="e.g., ACL Tear Post-Op, Rotator Cuff Tendinopathy"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="painScore"
              label="Current pain score (0–10)"
              type="number"
              inputMode="numeric"
              min="0"
              max="10"
              value={v.painScore}
              onValueChange={(painScore) => set({ painScore })}
              placeholder="0 = no pain"
            />
            <TextField
              id="injuryDate"
              label="Date of injury / surgery"
              type="date"
              value={v.injuryDate}
              onValueChange={(injuryDate) => set({ injuryDate })}
            />
          </div>
          <TextAreaField
            id="surgeryHistory"
            label="Surgery / procedure history"
            value={v.surgeryHistory}
            onValueChange={(surgeryHistory) => set({ surgeryHistory })}
            placeholder="e.g., Right ACL reconstruction Jan 2024"
            rows={2}
          />
          <TextAreaField
            id="limitations"
            label="Physical limitations"
            value={v.limitations}
            onValueChange={(limitations) => set({ limitations })}
            placeholder="e.g., Cannot fully straighten knee"
            rows={2}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextAreaField
              id="comorbidities"
              label="Medical conditions"
              value={v.comorbidities}
              onValueChange={(comorbidities) => set({ comorbidities })}
              placeholder="e.g., Osteoarthritis, Type 2 diabetes"
              rows={2}
            />
            <TextAreaField
              id="functional"
              label="Functional challenges"
              value={v.functionalChallenges}
              onValueChange={(functionalChallenges) => set({ functionalChallenges })}
              placeholder="e.g., Difficulty climbing stairs"
              rows={2}
            />
          </div>
        </>
      );
    case 2:
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="activityLevel"
              label="Activity level"
              value={v.activityLevel}
              onValueChange={(activityLevel) => set({ activityLevel })}
              placeholder="Select level"
              options={ACTIVITY_LEVELS}
            />
            <TextField
              id="occupation"
              label="Occupation"
              autoComplete="organization-title"
              value={v.occupation}
              onValueChange={(occupation) => set({ occupation })}
              placeholder="e.g., Nurse, Office worker"
            />
          </div>
          <div role="group" aria-labelledby="availableEquipment-label" className="flex flex-col gap-1.5">
            <span id="availableEquipment-label" className="text-label text-foreground">
              Available equipment
            </span>
            {/* No saved profiles yet (the account is being created), so built-in setups only. */}
            <EquipmentPicker
              value={v.availableEquipment}
              profiles={NO_PROFILES}
              allowSave={false}
              onChange={(availableEquipment, equipmentSetupName) => set({ availableEquipment, equipmentSetupName })}
            />
          </div>
          <ToggleGroupField
            id="fitnessGoals"
            label="Rehabilitation goals"
            options={FITNESS_GOALS}
            selected={v.fitnessGoals}
            onToggle={(goal) => set({ fitnessGoals: toggleItem(v.fitnessGoals, goal) })}
          />
        </>
      );
    default:
      return <ClientReview values={v} goTo={goTo} />;
  }
}

const activityLabel = (value: string) => ACTIVITY_LEVELS.find((l) => l.value === value)?.label ?? value;

function ClientReview({ values: v, goTo }: { values: ClientOnboardingValues; goTo: (step: number) => void }) {
  const sections: { step: number; rows: [string, string][] }[] = [
    {
      step: 0,
      rows: [
        ["Name", `${v.firstName} ${v.lastName}`.trim()],
        ["Phone", v.phone],
        ["Date of birth", v.dateOfBirth],
      ],
    },
    {
      step: 1,
      rows: [
        ["Primary diagnosis", v.primaryDiagnosis],
        ["Pain score", v.painScore ? `${v.painScore} / 10` : ""],
        ["Date of injury / surgery", v.injuryDate],
        ["Surgery history", v.surgeryHistory],
        ["Physical limitations", v.limitations],
        ["Medical conditions", v.comorbidities],
        ["Functional challenges", v.functionalChallenges],
      ],
    },
    {
      step: 2,
      rows: [
        ["Activity level", v.activityLevel ? activityLabel(v.activityLevel) : ""],
        ["Occupation", v.occupation],
        ["Equipment", v.equipmentSetupName ? `${v.equipmentSetupName} (${v.availableEquipment.length})` : v.availableEquipment.join(", ")],
        ["Goals", v.fitnessGoals.join(", ")],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {sections.map(({ step, rows }) => (
        <section key={step} className="rounded-xl border border-border bg-surface shadow-xs">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <h3 className="text-heading text-foreground">{STEPS[step].title}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => goTo(step)}>
              Edit<span className="sr-only"> {STEPS[step].title}</span>
            </Button>
          </div>
          <dl className="grid gap-x-6 gap-y-2.5 px-4 py-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-label text-muted-foreground">{label}</dt>
                <dd className="text-body break-words text-foreground">
                  {value || <span className="text-muted-foreground">Not provided</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
