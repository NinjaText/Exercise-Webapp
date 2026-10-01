"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormField } from "@/components/shared/form-section";
import { SettingsPanel, SettingsPanels } from "@/components/settings/settings-section";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { saveOrganizationProfile, type OrganizationMetadata } from "@/actions/organization-actions";
import { type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";

interface OrganizationProfileFormProps {
  initialData?: OrganizationMetadata;
}

type Values = {
  organizationName: string;
  tagline: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  exerciseSourcePreference: ExerciseSourcePreference;
};

const LIBRARY_OPTIONS: { value: ExerciseSourcePreference; label: string; description: string }[] = [
  { value: "BOTH", label: "Universal + organization", description: "The full universal library alongside your own exercises." },
  { value: "UNIVERSAL", label: "Universal only", description: "Only the shared library that comes with the app." },
  { value: "ORGANIZATION", label: "Organization only", description: "Only exercises your team has added." },
];

function toValues(data?: OrganizationMetadata): Values {
  return {
    organizationName: data?.organizationName ?? "",
    tagline: data?.tagline ?? "",
    phone: data?.phone ?? "",
    email: data?.email ?? "",
    website: data?.website ?? "",
    address: data?.address ?? "",
    exerciseSourcePreference: data?.exerciseSourcePreference ?? "BOTH",
  };
}

export function OrganizationProfileForm({ initialData }: OrganizationProfileFormProps) {
  const router = useRouter();
  const [saved, setSaved] = useState<Values>(() => toValues(initialData));
  const [values, setValues] = useState<Values>(saved);
  const [saving, setSaving] = useState(false);

  const dirty = (Object.keys(values) as (keyof Values)[]).some((k) => values[k] !== saved[k]);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));
  const text = (key: Exclude<keyof Values, "exerciseSourcePreference">) => ({
    id: key,
    name: key,
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value),
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const result = await saveOrganizationProfile({
      organizationName: values.organizationName.trim(),
      tagline: values.tagline.trim() || undefined,
      phone: values.phone.trim() || undefined,
      email: values.email.trim() || undefined,
      website: values.website.trim() || undefined,
      address: values.address.trim() || undefined,
      exerciseSourcePreference: values.exerciseSourcePreference,
    });
    setSaving(false);

    if (result.success) {
      setSaved(values);
      toast.success("Organization profile saved");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SettingsPanels>
        <SettingsPanel
          title="Organization details"
          description="How your organization appears to your team and clients."
        >
          <FormField label="Organization name" htmlFor="organizationName" required>
            <Input {...text("organizationName")} required placeholder="e.g., Summit Physical Therapy" />
          </FormField>
          <FormField label="Tagline" htmlFor="tagline" hint="A short line shown under your name on your sales page.">
            <Input {...text("tagline")} placeholder="e.g., Evidence-based rehabilitation" />
          </FormField>
        </SettingsPanel>

        <SettingsPanel
          title="Contact information"
          description="Shown to clients on PDFs and emails so they know how to reach you."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <FormField label="Phone" htmlFor="phone">
              <Input {...text("phone")} type="tel" placeholder="(555) 123-4567" />
            </FormField>
            <FormField label="Contact email" htmlFor="email">
              <Input {...text("email")} type="email" placeholder="hello@example.com" />
            </FormField>
          </div>
          <FormField label="Website" htmlFor="website">
            <Input {...text("website")} type="url" placeholder="https://www.example.com" />
          </FormField>
          <FormField label="Address" htmlFor="address">
            <Textarea {...text("address")} rows={2} placeholder="123 Main St, Suite 100, City, State ZIP" />
          </FormField>
        </SettingsPanel>

        <SettingsPanel
          title="Exercise library"
          description="Which exercises trainers see by default when building a program. They can still search everything they have access to."
        >
          <RadioGroup
            value={values.exerciseSourcePreference}
            onValueChange={(v) => set("exerciseSourcePreference", (v as ExerciseSourcePreference) ?? "BOTH")}
            aria-label="Exercise library"
            className="gap-3"
          >
            {LIBRARY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg p-4 ring-1 ring-border transition-colors hover:bg-muted/40 has-[[data-checked]]:bg-primary/5 has-[[data-checked]]:ring-2 has-[[data-checked]]:ring-primary"
              >
                <RadioGroupItem value={option.value} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-sm text-muted-foreground">{option.description}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </SettingsPanel>
      </SettingsPanels>

      <SettingsSaveBar dirty={dirty} saving={saving} onDiscard={() => setValues(saved)} />
    </form>
  );
}
