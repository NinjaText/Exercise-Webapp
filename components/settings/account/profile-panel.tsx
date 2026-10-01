"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FormField } from "@/components/shared/form-section";
import { SettingsPanel } from "@/components/settings/settings-section";
import { syncMyClerkProfileAction, updateMyProfileAction, type ProfileInput } from "@/actions/profile-actions";
import { clerkErrorMessage } from "@/components/settings/account/clerk-error";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

interface ProfilePanelProps {
  initial: { firstName: string; lastName: string; phone: string };
  email: string;
}

export function ProfilePanel({ initial, email }: ProfilePanelProps) {
  const router = useRouter();
  const { user } = useUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<"upload" | "remove" | null>(null);

  const dirty = values.firstName !== saved.firstName || values.lastName !== saved.lastName || values.phone !== saved.phone;
  const initials = `${values.firstName.charAt(0)}${values.lastName.charAt(0)}`.toUpperCase() || "?";

  function set(key: keyof ProfileInput, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateMyProfileAction(values);
    setSaving(false);
    if (result.success) {
      const trimmed = { firstName: values.firstName.trim(), lastName: values.lastName.trim(), phone: values.phone.trim() };
      setValues(trimmed);
      setSaved(trimmed);
      toast.success("Profile saved");
      router.refresh();
    } else {
      if (result.field) setErrors({ [result.field]: result.error });
      toast.error(result.error);
    }
  }

  async function changePhoto(file: File | null) {
    if (!user) return;
    if (file && !file.type.startsWith("image/")) return toast.error("Choose an image file (PNG, JPEG, GIF or WebP).");
    if (file && file.size > MAX_PHOTO_BYTES) return toast.error("That image is larger than 10 MB.");

    setPhotoBusy(file ? "upload" : "remove");
    try {
      await user.setProfileImage({ file });
      await user.reload();
      await syncMyClerkProfileAction();
      toast.success(file ? "Photo updated" : "Photo removed");
      router.refresh();
    } catch (error) {
      toast.error(clerkErrorMessage(error, "We couldn't update your photo. Please try again."));
    } finally {
      setPhotoBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <SettingsPanel
      title="Profile"
      description="Your name and photo appear to your team and clients across the app, in messages and on PDFs."
      footerHint={dirty ? "You have unsaved changes." : undefined}
      footer={
        <>
          {dirty && (
            <Button variant="ghost" onClick={() => { setValues(saved); setErrors({}); }} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save profile
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar className="size-16 text-lg">
          {user?.hasImage && <AvatarImage src={user.imageUrl} alt="" />}
          <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!user || photoBusy !== null}>
              {photoBusy === "upload" && <Loader2 className="mr-2 size-4 animate-spin" />}
              {user?.hasImage ? "Change photo" : "Upload photo"}
            </Button>
            {user?.hasImage && (
              <Button variant="ghost" onClick={() => changePhoto(null)} disabled={photoBusy !== null}>
                {photoBusy === "remove" && <Loader2 className="mr-2 size-4 animate-spin" />}
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPEG, GIF or WebP, up to 10 MB. Square images look best.</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          aria-label="Upload profile photo"
          onChange={(e) => changePhoto(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField label="First name" htmlFor="firstName" error={errors.firstName} required>
          <Input
            id="firstName"
            autoComplete="given-name"
            value={values.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            aria-invalid={errors.firstName ? true : undefined}
          />
        </FormField>
        <FormField label="Last name" htmlFor="lastName" error={errors.lastName} required>
          <Input
            id="lastName"
            autoComplete="family-name"
            value={values.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            aria-invalid={errors.lastName ? true : undefined}
          />
        </FormField>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField label="Email" htmlFor="profileEmail" hint="Change it under Email addresses below.">
          <Input id="profileEmail" value={email} readOnly disabled />
        </FormField>
        <FormField label="Phone" htmlFor="phone" error={errors.phone} hint="Optional.">
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="(555) 123-4567"
            aria-invalid={errors.phone ? true : undefined}
          />
        </FormField>
      </div>
    </SettingsPanel>
  );
}
