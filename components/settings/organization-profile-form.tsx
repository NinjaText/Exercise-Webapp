"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormSection, FormField } from "@/components/shared/form-section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveOrganizationProfile, type OrganizationMetadata } from "@/actions/organization-actions";
import { type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import Image from "next/image";

interface OrganizationProfileFormProps {
  initialData?: OrganizationMetadata;
}

export function OrganizationProfileForm({ initialData }: OrganizationProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(initialData?.logoUrl ?? "");
  const [exerciseSourcePreference, setExerciseSourcePreference] = useState<ExerciseSourcePreference>(
    initialData?.exerciseSourcePreference ?? "BOTH"
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await saveOrganizationProfile({
      organizationName: formData.get("organizationName") as string,
      tagline: (formData.get("tagline") as string) || undefined,
      logoUrl: logoUrl || undefined,
      phone: (formData.get("phone") as string) || undefined,
      email: (formData.get("email") as string) || undefined,
      website: (formData.get("website") as string) || undefined,
      address: (formData.get("address") as string) || undefined,
      exerciseSourcePreference,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Organization profile saved");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <FormSection title="Organization details">
        <FormField label="Organization Name" htmlFor="organizationName" required>
          <Input
            id="organizationName"
            name="organizationName"
            required
            defaultValue={initialData?.organizationName ?? ""}
            placeholder="e.g., Summit Physical Therapy"
          />
        </FormField>

        <FormField label="Tagline" htmlFor="tagline">
          <Input
            id="tagline"
            name="tagline"
            defaultValue={initialData?.tagline ?? ""}
            placeholder="e.g., Evidence-based rehabilitation"
          />
        </FormField>

        <FormField label="Organization Logo" hint="Logo upload is temporarily unavailable.">
          {logoUrl && (
            <Image
              src={logoUrl}
              alt="Organization logo"
              width={80}
              height={80}
              className="rounded-md border"
            />
          )}
        </FormField>
      </FormSection>

      <FormSection title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Phone" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              defaultValue={initialData?.phone ?? ""}
              placeholder="(555) 123-4567"
            />
          </FormField>
          <FormField label="Contact Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={initialData?.email ?? ""}
              placeholder="organization@example.com"
            />
          </FormField>
        </div>

        <FormField label="Website" htmlFor="website">
          <Input
            id="website"
            name="website"
            type="url"
            defaultValue={initialData?.website ?? ""}
            placeholder="https://www.example.com"
          />
        </FormField>

        <FormField label="Address" htmlFor="address">
          <Textarea
            id="address"
            name="address"
            rows={2}
            defaultValue={initialData?.address ?? ""}
            placeholder="123 Main St, Suite 100, City, State ZIP"
          />
        </FormField>
      </FormSection>

      <FormSection title="Program exercise library">
        <FormField
          label="Program Exercise Library"
          htmlFor="exerciseSourcePreference"
          hint="Controls which exercises trainers see by default when building a program."
        >
          <Select
            value={exerciseSourcePreference}
            onValueChange={(v) => setExerciseSourcePreference((v as ExerciseSourcePreference) ?? "BOTH")}
          >
            <SelectTrigger id="exerciseSourcePreference">
              <SelectValue>
                {(value: ExerciseSourcePreference) => {
                  switch (value) {
                    case "UNIVERSAL":
                      return "Universal exercises only";
                    case "ORGANIZATION":
                      return "My Organization exercises only";
                    default:
                      return "Universal + My Organization";
                  }
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BOTH">Universal + My Organization</SelectItem>
              <SelectItem value="UNIVERSAL">Universal exercises only</SelectItem>
              <SelectItem value="ORGANIZATION">My Organization exercises only</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </FormSection>

      <div className="flex justify-end border-t border-border pt-6">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Profile
        </Button>
      </div>
    </form>
  );
}
