"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="organizationName">Organization Name *</Label>
            <Input
              id="organizationName"
              name="organizationName"
              required
              defaultValue={initialData?.organizationName ?? ""}
              placeholder="e.g., Summit Physical Therapy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              name="tagline"
              defaultValue={initialData?.tagline ?? ""}
              placeholder="e.g., Evidence-based rehabilitation"
            />
          </div>

          <div className="space-y-2">
            <Label>Organization Logo</Label>
            {logoUrl && (
              <div className="mb-2">
                <Image
                  src={logoUrl}
                  alt="Organization logo"
                  width={80}
                  height={80}
                  className="rounded-md border"
                />
              </div>
            )}
            <p className="text-sm text-muted-foreground">Logo upload is temporarily unavailable.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={initialData?.phone ?? ""}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Contact Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={initialData?.email ?? ""}
                placeholder="organization@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              name="website"
              type="url"
              defaultValue={initialData?.website ?? ""}
              placeholder="https://www.example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              rows={2}
              defaultValue={initialData?.address ?? ""}
              placeholder="123 Main St, Suite 100, City, State ZIP"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exerciseSourcePreference">Program Exercise Library</Label>
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
            <p className="text-sm text-muted-foreground">
              Controls which exercises trainers see by default when building a program.
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
