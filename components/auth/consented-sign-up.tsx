"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Checkbox } from "@/components/ui/checkbox";
import { buildSignUpConsent } from "@/lib/legal/consent";
import { cn } from "@/lib/utils";

// Full SignUp props (a path/hash routing union); unsafeMetadata is always set here.
type SignUpProps = React.ComponentProps<typeof SignUp>;

function ConsentRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5 size-5" />
      <label htmlFor={id} className="text-sm leading-snug text-foreground">
        {children}
      </label>
    </div>
  );
}

const LINK = "font-medium text-primary underline underline-offset-4 hover:text-primary/80";

/**
 * Clerk's <SignUp> behind the sign-up clickwrap: Terms of Use and Privacy
 * Policy are required before the form (including social sign-up) is usable;
 * marketing emails are optional. The choices travel to Clerk as
 * `unsafeMetadata.legalConsent` and are copied onto our User row when it is
 * created (see consentFieldsFromClerkUser).
 */
export function ConsentedSignUp(props: SignUpProps) {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const ready = terms && privacy;
  const hintId = useId();

  return (
    <div className="w-full">
      <fieldset className="space-y-3.5">
        <legend className="sr-only">Agreements</legend>
        <ConsentRow checked={terms} onChange={setTerms}>
          I agree to the MIA Performance{" "}
          <Link href="/terms" target="_blank" className={LINK}>
            Terms of Use
          </Link>{" "}
          <span className="text-muted-foreground">(required)</span>
        </ConsentRow>
        <ConsentRow checked={privacy} onChange={setPrivacy}>
          I have read and agree to the{" "}
          <Link href="/privacy" target="_blank" className={LINK}>
            Privacy Policy
          </Link>{" "}
          <span className="text-muted-foreground">(required)</span>
        </ConsentRow>
        <ConsentRow checked={marketing} onChange={setMarketing}>
          I agree to receive emails about product updates, new features, and special offers.{" "}
          <span className="text-muted-foreground">(optional)</span>
        </ConsentRow>
      </fieldset>

      {!ready && (
        <p id={hintId} className="mt-4 text-sm text-muted-foreground" role="status">
          Check both required boxes to create your account.
        </p>
      )}

      <div
        className={cn("mt-5 transition-opacity", !ready && "pointer-events-none opacity-50 select-none")}
        // Blocks keyboard and pointer access to the form, social buttons included.
        inert={!ready}
        aria-describedby={!ready ? hintId : undefined}
      >
        <SignUp {...props} unsafeMetadata={ready ? { legalConsent: buildSignUpConsent(marketing) } : undefined} />
      </div>
    </div>
  );
}
