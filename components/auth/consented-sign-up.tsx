"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Checkbox } from "@/components/ui/checkbox";
import { buildSignUpConsent } from "@/lib/legal/consent";
import { ReferralCodeField } from "./referral-code-field";

// Full SignUp props (a path/hash routing union); unsafeMetadata is always set here.
type SignUpProps = React.ComponentProps<typeof SignUp> & {
  /** Show the optional contractor "Referral code" field (paid sign-ups only). */
  referral?: { initialCode: string | null };
};

/** Clerk's first sign-up step (email/password + social buttons). Later steps (email code) need no consent UI. */
const START_STEP = ".cl-signUp-start";
/** Controls that create the account from the first step: Continue, social buttons, the hidden Enter-submit button. */
const SUBMIT_CONTROLS =
  ".cl-formButtonPrimary, .cl-socialButtonsBlockButton, .cl-socialButtonsIconButton, .cl-form button[type='submit']";

type Placement =
  /** Rendered inside Clerk's form, just above its Continue button. */
  | { kind: "inline"; slot: HTMLElement }
  /** First step is showing but its markup isn't recognised: render below the form so consent is never lost. */
  | { kind: "below" }
  /** Clerk hasn't loaded yet, or a later step is showing. */
  | { kind: "none" };

const LINK = "font-medium text-foreground underline underline-offset-4 hover:text-primary";

/**
 * Clerk's <SignUp> with the sign-up clickwrap built into the form: one
 * required "I agree to the Terms of Use and Privacy Policy" checkbox (plus an
 * optional marketing opt-in) sits right above Continue, as on most sign-up
 * pages. Until it is ticked, Continue, Enter and the social buttons are held
 * back and an inline error points at the checkbox.
 *
 * The choices travel to Clerk as `unsafeMetadata.legalConsent` and are copied
 * onto our User row when it is created (see consentFieldsFromClerkUser). An
 * optional referral code travels as `unsafeMetadata.referralCode` (see
 * lib/referrals/attribution.ts).
 */
export function ConsentedSignUp({ referral, ...props }: SignUpProps) {
  const [agreed, setAgreed] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [placement, setPlacement] = useState<Placement>({ kind: "none" });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const checkboxRef = useRef<HTMLElement>(null);
  const agreedRef = useRef(agreed);

  useEffect(() => {
    agreedRef.current = agreed;
  }, [agreed]);

  function changeAgreed(next: boolean) {
    setAgreed(next);
    if (next) setShowError(false);
  }

  // Keep a slot for the agreement inside Clerk's first-step form, just above
  // its Continue button. Clerk re-renders its own DOM between steps, so the
  // slot is re-attached whenever the form changes.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const slot = document.createElement("div");
    slot.dataset.slot = "sign-up-agreement";

    const place = () => {
      const form = wrapper.querySelector<HTMLElement>(`${START_STEP} form.cl-form`);
      let anchor: Element | null = form?.querySelector(".cl-formButtonPrimary") ?? null;
      while (anchor && anchor.parentElement !== form) anchor = anchor.parentElement;

      if (form && anchor) {
        if (slot.parentElement !== form || slot.nextElementSibling !== anchor) form.insertBefore(slot, anchor);
        setPlacement((p) => (p.kind === "inline" ? p : { kind: "inline", slot }));
        return;
      }
      if (slot.isConnected) slot.remove();
      const onStart = Boolean(wrapper.querySelector(START_STEP));
      setPlacement((p) => (p.kind === (onStart ? "below" : "none") ? p : onStart ? { kind: "below" } : { kind: "none" }));
    };

    place();
    const observer = new MutationObserver(place);
    observer.observe(wrapper, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      slot.remove();
    };
  }, []);

  // Hold back account creation until the agreement is ticked. Capture phase on
  // our wrapper runs before Clerk's own handlers see the event.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const guard = (e: Event) => {
      if (agreedRef.current) return;
      const target = e.target as Element | null;
      if (!target?.closest(START_STEP)) return;
      const creates =
        e.type === "submit" ||
        (e.type === "click" && target.closest(SUBMIT_CONTROLS)) ||
        (e.type === "keydown" && (e as KeyboardEvent).key === "Enter" && target.closest(".cl-form input"));
      if (!creates) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setShowError(true);
      checkboxRef.current?.focus();
    };
    const types = ["click", "submit", "keydown"] as const;
    for (const t of types) wrapper.addEventListener(t, guard, true);
    return () => {
      for (const t of types) wrapper.removeEventListener(t, guard, true);
    };
  }, []);

  const agreement = (
    <Agreement
      agreed={agreed}
      onAgreedChange={changeAgreed}
      marketing={marketing}
      onMarketingChange={setMarketing}
      showError={showError}
      checkboxRef={checkboxRef}
      referral={referral ? <ReferralCodeField initialCode={referral.initialCode} onChange={setReferralCode} /> : null}
    />
  );

  return (
    <div ref={wrapperRef} className="w-full">
      <SignUp
        {...props}
        unsafeMetadata={
          agreed
            ? { legalConsent: buildSignUpConsent(marketing), ...(referralCode ? { referralCode } : {}) }
            : undefined
        }
      />
      {placement.kind === "inline" && createPortal(agreement, placement.slot)}
      {placement.kind === "below" && <div className="mt-4">{agreement}</div>}
    </div>
  );
}

function Agreement({
  agreed,
  onAgreedChange,
  marketing,
  onMarketingChange,
  showError,
  checkboxRef,
  referral,
}: {
  agreed: boolean;
  onAgreedChange: (v: boolean) => void;
  marketing: boolean;
  onMarketingChange: (v: boolean) => void;
  showError: boolean;
  checkboxRef: React.RefObject<HTMLElement | null>;
  referral: React.ReactNode;
}) {
  const termsId = useId();
  const marketingId = useId();
  const errorId = useId();

  return (
    <div className="space-y-4 text-left">
      {referral}

      <fieldset className="space-y-3">
        <legend className="sr-only">Agreements</legend>
        <div className="flex items-start gap-2.5">
          <Checkbox
            ref={checkboxRef}
            id={termsId}
            checked={agreed}
            onCheckedChange={(v) => onAgreedChange(v === true)}
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
            aria-required
            className="mt-0.5"
          />
          <label htmlFor={termsId} className="text-sm leading-snug text-muted-foreground">
            I agree to the{" "}
            <Link href="/terms" target="_blank" className={LINK}>
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className={LINK}>
              Privacy Policy
            </Link>
            .
          </label>
        </div>
        <div className="flex items-start gap-2.5">
          <Checkbox
            id={marketingId}
            checked={marketing}
            onCheckedChange={(v) => onMarketingChange(v === true)}
            className="mt-0.5"
          />
          <label htmlFor={marketingId} className="text-sm leading-snug text-muted-foreground">
            Email me product updates, tips and offers. Unsubscribe anytime.
          </label>
        </div>
        {showError && (
          <p id={errorId} role="alert" className="text-sm text-danger">
            Please agree to the Terms of Use and Privacy Policy to continue.
          </p>
        )}
      </fieldset>
    </div>
  );
}
