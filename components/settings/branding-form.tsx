"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/shared/form-section";
import { SettingsPanel, SettingsPanels, SettingsRow } from "@/components/settings/settings-section";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ColorField } from "@/components/settings/color-field";
import { BrandPreview } from "@/components/settings/brand-preview";
import { LogoUploader } from "@/components/settings/logo-uploader";
import {
  resetBranding,
  saveBrandingSettings,
  type BrandingSettings,
} from "@/actions/branding-actions";
import { brandColorErrorMessage } from "@/lib/branding/tokens";
import type { AssetKind } from "@/lib/branding/asset-kinds";
import { displayNameSchema } from "@/lib/validators/branding";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Values = {
  brandingEnabled: boolean;
  /** Raw input text; blank means "use the organization name" and is sent as null. */
  brandDisplayName: string;
  brandPrimaryColor: string | null;
};

type FieldErrors = Partial<Record<"brandDisplayName" | "brandPrimaryColor", string>>;

const RESET_VALUES: Values = { brandingEnabled: false, brandDisplayName: "", brandPrimaryColor: null };

function toValues(settings: BrandingSettings): Values {
  return {
    brandingEnabled: settings.brandingEnabled,
    brandDisplayName: settings.brandDisplayName ?? "",
    brandPrimaryColor: settings.brandPrimaryColor,
  };
}

/** The action's input shape: a blank display name becomes null (the action rejects ""). */
function toPayload(values: Values) {
  const name = values.brandDisplayName.trim();
  return {
    brandingEnabled: values.brandingEnabled,
    brandDisplayName: name ? name : null,
    brandPrimaryColor: values.brandPrimaryColor,
  };
}

function isSame(a: Values, b: Values): boolean {
  const pa = toPayload(a);
  const pb = toPayload(b);
  return (
    pa.brandingEnabled === pb.brandingEnabled &&
    pa.brandDisplayName === pb.brandDisplayName &&
    pa.brandPrimaryColor === pb.brandPrimaryColor
  );
}

/** Per slot: does the stored URL pass `isOwnAssetUrl`? Computed on the server (the check reads a server-only env var). */
export type OwnAssetFlags = Record<AssetKind, boolean>;

const NO_OWN_ASSETS: OwnAssetFlags = { "logo-on-light": false, "logo-on-dark": false, mark: false };

export function BrandingForm({
  initial,
  ownAssets = NO_OWN_ASSETS,
}: {
  initial: BrandingSettings;
  ownAssets?: OwnAssetFlags;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => toValues(initial));
  // The last saved values; "dirty" is measured against these, not the first render's props.
  const [saved, setSaved] = useState<Values>(() => toValues(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [colorTextValid, setColorTextValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Bumped on discard so ColorField drops a half-typed (invalid) draft too.
  const [colorFieldKey, setColorFieldKey] = useState(0);

  const dirty = !isSame(values, saved);
  const pending = saving || resetting;
  // The lightness guardrail, checked up front (the server would reject it anyway).
  const guardrailError = useMemo(() => brandColorErrorMessage(values.brandPrimaryColor), [values.brandPrimaryColor]);
  const colorUsable = guardrailError === null;
  const previewName = values.brandDisplayName.trim() || initial.orgName;

  function update<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (key !== "brandingEnabled") setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSave() {
    const payload = toPayload(values);

    if (payload.brandDisplayName !== null) {
      const name = displayNameSchema.safeParse(payload.brandDisplayName);
      if (!name.success) {
        setErrors({ brandDisplayName: name.error.issues[0]?.message });
        return;
      }
    }

    setSaving(true);
    const result = await saveBrandingSettings(payload);
    setSaving(false);

    if (result.success) {
      setSaved(values);
      setErrors({});
      toast.success("Branding saved");
      router.refresh();
    } else {
      if (result.field === "brandDisplayName" || result.field === "brandPrimaryColor") {
        setErrors({ [result.field]: result.error });
      }
      toast.error(result.error);
    }
  }

  function handleDiscard() {
    setValues(saved);
    setErrors({});
    setColorTextValid(true);
    setColorFieldKey((k) => k + 1);
  }

  async function handleReset() {
    setConfirmOpen(false);
    setResetting(true);
    const result = await resetBranding();
    setResetting(false);

    if (result.success) {
      setValues(RESET_VALUES);
      setSaved(RESET_VALUES);
      setErrors({});
      setColorTextValid(true);
      toast.success("Branding reset to defaults");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <SettingsPanels>
        <SettingsPanel
          title="Custom branding"
          description="When this is off your settings are kept, but clients see the standard look. The preview always shows your settings."
        >
          <SettingsRow
            label="Use custom branding"
            description="Apply your name, logos and color across the app, PDFs and client emails."
            htmlFor="brandingEnabled"
          >
            <Switch
              id="brandingEnabled"
              checked={values.brandingEnabled}
              onCheckedChange={(checked) => update("brandingEnabled", checked)}
            />
          </SettingsRow>
        </SettingsPanel>

        <SettingsPanel title="Identity" description="The name clients see in place of the app's name.">
          <FormField
            label="Display name"
            htmlFor="brandDisplayName"
            hint="Shown in the app, on PDFs and in emails. Leave blank to use your organization name."
            error={errors.brandDisplayName}
          >
            <Input
              id="brandDisplayName"
              value={values.brandDisplayName}
              onChange={(e) => update("brandDisplayName", e.target.value)}
              placeholder={initial.orgName}
              maxLength={60}
              aria-invalid={errors.brandDisplayName ? true : undefined}
            />
          </FormField>
        </SettingsPanel>

        <SettingsPanel
          title="Logos"
          description={
            <>
              All optional, and saved as soon as you upload them. Without a dark logo, the sidebar shows your light
              logo on a light plate; without either, your display name is shown.
            </>
          }
        >
          <LogoUploader
            kind="logo-on-light"
            label="Logo on light background"
            hint="Used on PDFs, on your sales page and on client onboarding. PNG, JPEG or WebP, up to 2 MB, at least 64 px tall."
            surface="light"
            currentUrl={initial.assets.logoOnLightUrl}
            currentIsOwn={ownAssets["logo-on-light"]}
          />
          <LogoUploader
            kind="logo-on-dark"
            label="Logo on dark background"
            hint="Used at the top of the sidebar, which is always dark, and in the header of client emails. PNG, JPEG or WebP, up to 2 MB, at least 64 px tall."
            surface="dark"
            currentUrl={initial.assets.logoOnDarkUrl}
            currentIsOwn={ownAssets["logo-on-dark"]}
          />
          <LogoUploader
            kind="mark"
            label="Square mark"
            hint="Shown next to your name when no logo is set, and as your browser tab icon. PNG, JPEG or WebP, up to 2 MB, at least 128 × 128 px."
            surface="dark"
            currentUrl={initial.assets.markUrl}
            currentIsOwn={ownAssets.mark}
          />
        </SettingsPanel>

        <SettingsPanel
          title="Brand color"
          description="Used for buttons, links, highlights and the sidebar. Leave blank to keep the default color."
        >
          <FormField label="Brand color" htmlFor="brandPrimaryColor">
            <ColorField
              key={colorFieldKey}
              id="brandPrimaryColor"
              value={values.brandPrimaryColor}
              onChange={(hex) => update("brandPrimaryColor", hex)}
              onValidityChange={setColorTextValid}
              // While the text isn't a color yet, `values` still holds the previous
              // one: don't warn about a color the user is typing over.
              error={colorTextValid ? (guardrailError ?? errors.brandPrimaryColor) : undefined}
            />
          </FormField>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Preview</p>
            <BrandPreview hex={values.brandPrimaryColor} displayName={previewName} incomplete={!colorTextValid} />
          </div>
        </SettingsPanel>

        <SettingsPanel
          title="Reset branding"
          tone="danger"
          description="Turns custom branding off and clears your color, display name and logos."
          footerHint="This can't be undone."
          footer={
            <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)} disabled={pending}>
              {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset to defaults
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            Clients will see the standard look again. Your organization profile is not affected.
          </p>
        </SettingsPanel>
      </SettingsPanels>

      <SettingsSaveBar
        dirty={dirty}
        saving={saving}
        onDiscard={handleDiscard}
        onSave={handleSave}
        canSave={colorTextValid && colorUsable && !resetting}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset branding to defaults?"
        description="This turns custom branding off and clears your brand color, display name and logos. Clients will see the standard look again. This can't be undone."
        confirmLabel="Reset branding"
        variant="destructive"
        onConfirm={handleReset}
      />
    </>
  );
}
