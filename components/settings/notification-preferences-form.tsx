"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { SettingsPanel, SettingsPanels, SettingsRow } from "@/components/settings/settings-section";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { updateMyPreferenceAction } from "@/actions/notification-preference-actions";
import type { PreferenceValues } from "@/lib/services/notification-preference.service";
import { toast } from "sonner";

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
  const [saved, setSaved] = useState({
    emailEnabled: initial.emailEnabled,
    pushEnabled: initial.pushEnabled,
    sessions: initial.sessions,
    messages: initial.messages,
    nutrition: initial.nutrition,
  });
  const [values, setValues] = useState(saved);
  // Categories apply to both channels, so they stay usable while either is on.
  const anyChannel = values.emailEnabled || values.pushEnabled;
  const dirty = (Object.keys(values) as (keyof typeof values)[]).some((k) => values[k] !== saved[k]);

  async function handleSave() {
    setSaving(true);
    const result = await updateMyPreferenceAction(values);
    setSaving(false);

    if (result.success) {
      setSaved(values);
      toast.success("Notification preferences saved");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <SettingsPanels>
        <SettingsPanel
          title="Email delivery"
          description="In-app notifications are always on. Turn email off to stop every non-essential email at once."
        >
          <SettingsRow
            label="Email notifications"
            description="Send me an email when something needs my attention."
            htmlFor="emailEnabled"
          >
            <Switch
              id="emailEnabled"
              checked={values.emailEnabled}
              onCheckedChange={(checked) => setValues((v) => ({ ...v, emailEnabled: checked }))}
            />
          </SettingsRow>
        </SettingsPanel>

        <SettingsPanel
          title="Push notifications"
          description="Applies to all your devices. Category switches below apply to email and push."
        >
          <SettingsRow
            label="Push notifications"
            description="Send a notification to my phone when something needs my attention."
            htmlFor="pushEnabled"
          >
            <Switch
              id="pushEnabled"
              checked={values.pushEnabled}
              onCheckedChange={(checked) => setValues((v) => ({ ...v, pushEnabled: checked }))}
            />
          </SettingsRow>
        </SettingsPanel>

        <SettingsPanel
          title="Categories"
          description={
            anyChannel
              ? "Choose which kinds of email and push notifications you want to receive."
              : "Email and push are both off. Turn one on above to choose categories."
          }
        >
          <div className="flex flex-col divide-y divide-border">
            {CATEGORIES.map((category) => (
              <div key={category.key} className="py-4 first:pt-0">
                <SettingsRow
                  label={category.label}
                  description={category.description}
                  htmlFor={category.key}
                  muted={!anyChannel}
                >
                  <Switch
                    id={category.key}
                    checked={anyChannel && values[category.key]}
                    disabled={!anyChannel}
                    onCheckedChange={(checked) => setValues((v) => ({ ...v, [category.key]: checked }))}
                  />
                </SettingsRow>
              </div>
            ))}
            <div className="pt-4">
              <SettingsRow
                label="Billing"
                description="Payment failures, cancellations and refunds. Always sent, because they affect your access."
                muted
              >
                <Switch checked disabled aria-label="Billing emails are always sent" />
              </SettingsRow>
            </div>
          </div>
        </SettingsPanel>
      </SettingsPanels>

      <SettingsSaveBar dirty={dirty} saving={saving} onDiscard={() => setValues(saved)} onSave={handleSave} />
    </>
  );
}
