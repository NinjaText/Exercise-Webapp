"use client";

import { useState } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/shared/form-section";
import { SettingsPanel } from "@/components/settings/settings-section";
import { clerkErrorMessage, isCancelledReverification } from "@/components/settings/account/clerk-error";
import { PanelSkeleton } from "@/components/settings/account/panel-skeleton";

const MIN_LENGTH = 8;

const EMPTY = { current: "", next: "", confirm: "" };

export function PasswordPanel() {
  const { user } = useUser();
  const [values, setValues] = useState(EMPTY);
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePassword = useReverification((params: { currentPassword?: string; newPassword: string; signOutOfOtherSessions: boolean }) =>
    user!.updatePassword(params)
  );

  if (!user) return <PanelSkeleton title="Password" />;
  const hasPassword = user.passwordEnabled;

  const tooShort = values.next.length > 0 && values.next.length < MIN_LENGTH;
  const mismatch = values.confirm.length > 0 && values.next !== values.confirm;
  const canSubmit =
    (!hasPassword || values.current.length > 0) && values.next.length >= MIN_LENGTH && values.next === values.confirm && !saving;

  function set(key: keyof typeof EMPTY, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await updatePassword({
        ...(hasPassword ? { currentPassword: values.current } : {}),
        newPassword: values.next,
        signOutOfOtherSessions: signOutOthers,
      });
      await user!.reload();
      setValues(EMPTY);
      toast.success(hasPassword ? "Password changed" : "Password set");
    } catch (err) {
      if (!isCancelledReverification(err)) {
        const message = clerkErrorMessage(err, "We couldn't update your password. Please try again.");
        setError(message);
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  }

  const type = show ? "text" : "password";

  return (
    <form onSubmit={handleSubmit}>
      <SettingsPanel
        title="Password"
        description={
          hasPassword
            ? "Use at least 8 characters. Avoid a password you use on other sites."
            : "You sign in with a connected account. Set a password to also sign in with your email."
        }
        footer={
          <Button type="submit" disabled={!canSubmit}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {hasPassword ? "Change password" : "Set password"}
          </Button>
        }
      >
        {hasPassword && (
          <FormField label="Current password" htmlFor="currentPassword">
            <Input
              id="currentPassword"
              type={type}
              autoComplete="current-password"
              value={values.current}
              onChange={(e) => set("current", e.target.value)}
            />
          </FormField>
        )}
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            label="New password"
            htmlFor="newPassword"
            error={tooShort ? `Use at least ${MIN_LENGTH} characters.` : undefined}
          >
            <Input
              id="newPassword"
              type={type}
              autoComplete="new-password"
              value={values.next}
              onChange={(e) => set("next", e.target.value)}
              aria-invalid={tooShort ? true : undefined}
            />
          </FormField>
          <FormField
            label="Confirm new password"
            htmlFor="confirmPassword"
            error={mismatch ? "Passwords don't match." : undefined}
          >
            <Input
              id="confirmPassword"
              type={type}
              autoComplete="new-password"
              value={values.confirm}
              onChange={(e) => set("confirm", e.target.value)}
              aria-invalid={mismatch ? true : undefined}
            />
          </FormField>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={signOutOthers} onCheckedChange={(checked) => setSignOutOthers(checked === true)} />
            Sign out of all other devices
          </label>
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setShow((s) => !s)}>
            {show ? <EyeOff className="mr-1.5 size-4" /> : <Eye className="mr-1.5 size-4" />}
            {show ? "Hide passwords" : "Show passwords"}
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger-foreground">
            {error}
          </p>
        )}
      </SettingsPanel>
    </form>
  );
}
