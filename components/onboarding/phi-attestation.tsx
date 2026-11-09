"use client";

import { Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal/consent";

/** Professional-account clickwrap: no PHI without a signed BAA (Terms §12). */
export function PhiAttestation({
  checked,
  onCheckedChange,
  error,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-foreground">Use of health information</legend>
      <div className="flex items-start gap-3">
        <Checkbox
          id="phiAttested"
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "phiAttested-error" : "phiAttested-note"}
          className="mt-0.5 size-5"
        />
        <label htmlFor="phiAttested" className="text-sm leading-snug text-foreground">
          I will not submit, store, or transmit Protected Health Information (PHI) through MIA Performance unless I have
          an executed Business Associate Agreement (BAA) with MIA Performance.
        </label>
      </div>
      {error && (
        <p id="phiAttested-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div id="phiAttested-note" className="flex gap-2.5 rounded-lg border border-border bg-muted/50 p-3.5 text-sm leading-snug text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          If you plan to use MIA with PHI (e.g., in a HIPAA-regulated clinical setting), contact us at{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-medium text-foreground underline underline-offset-4">
            {LEGAL_CONTACT_EMAIL}
          </a>{" "}
          to discuss a Business Associate Agreement (BAA) and supported configurations.
        </p>
      </div>
    </fieldset>
  );
}
