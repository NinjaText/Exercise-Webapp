"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FormSection } from "@/components/shared/form-section";
import { updateMyPreferenceAction } from "@/actions/notification-preference-actions";
import type { PreferenceValues } from "@/lib/services/notification-preference.service";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const CATEGORIES = [
  {
    key: "sessions" as const,
    label: "Sessions",
    description: "Reminders, completions, missed sessions, and exercise notes",
  },
  {
    key: "messages" as const,
    label: "Messages & check-ins",
    description: "New messages, check-ins assigned, responses, and voice memos",
  },
  {
    key: "nutrition" as const,
    label: "Nutrition",
    description: "Coach comments and daily nudges",
  },
];

export function NotificationPreferencesForm({ initial }: { initial: PreferenceValues }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({
    emailEnabled: initial.emailEnabled,
    sessions: initial.sessions,
    messages: initial.messages,
    nutrition: initial.nutrition,
  });

  async function handleSave() {
    setSaving(true);
    const result = await updateMyPreferenceAction(values);
    setSaving(false);

    if (result.success) {
      toast.success("Notification preferences saved");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <FormSection
        title="Email notifications"
        description="Turn this off to stop all non-essential email. You will still see every notification in the app."
      >
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="emailEnabled" className="text-sm font-medium">
            Send me email notifications
          </Label>
          <Switch
            id="emailEnabled"
            checked={values.emailEnabled}
            onCheckedChange={(checked) => setValues((v) => ({ ...v, emailEnabled: checked }))}
          />
        </div>
      </FormSection>

      <FormSection title="Categories" description="Choose which emails you want to receive.">
        {CATEGORIES.map((category) => (
          <div key={category.key} className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor={category.key} className="text-sm font-medium">
                {category.label}
              </Label>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>
            <Switch
              id={category.key}
              checked={values[category.key]}
              disabled={!values.emailEnabled}
              onCheckedChange={(checked) =>
                setValues((v) => ({ ...v, [category.key]: checked }))
              }
            />
          </div>
        ))}

        <div className="flex items-start justify-between gap-4 border-t border-border pt-6">
          <div className="flex flex-col gap-1">
            <Label className="text-sm font-medium text-muted-foreground">Billing</Label>
            <p className="text-sm text-muted-foreground">
              Payment failures, cancellations, and refunds. Always sent — required for account
              access.
            </p>
          </div>
          <Switch checked disabled aria-label="Billing emails are always sent" />
        </div>
      </FormSection>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
