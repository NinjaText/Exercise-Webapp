"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, Loader2, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizeReferralCode } from "@/lib/referrals/codes";
import { checkReferralCode } from "@/actions/referral-code-actions";

type CheckState = "idle" | "checking" | "valid" | "invalid";

const TEXT_BUTTON =
  "text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none";

/**
 * Optional referral code for sign-up, collapsed by default:
 * - nothing pre-filled → a quiet "Have a referral code?" link that opens the input;
 * - a code from a referral link → a one-line "Referral code … applied · Change" summary.
 * Reports the code to send with the sign-up (format-valid and not known-bad) through `onChange`.
 */
export function ReferralCodeField({
  initialCode,
  onChange,
}: {
  initialCode?: string | null;
  onChange: (code: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialCode ?? "");
  const [checked, setChecked] = useState<{ code: string; valid: boolean } | null>(null);
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const code = normalizeReferralCode(value);
  const state: CheckState = !value.trim()
    ? "idle"
    : !code
      ? "invalid"
      : checked?.code === code
        ? checked.valid
          ? "valid"
          : "invalid"
        : "checking";

  // Debounced existence check; the result (not the keystroke) decides what is sent.
  useEffect(() => {
    if (!code) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const res = await checkReferralCode(code).catch(() => ({ valid: true, code }));
      if (stale) return;
      setChecked({ code, valid: res.valid });
      onChangeRef.current(res.valid ? code : null);
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [code]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function change(next: string) {
    setValue(next);
    // Optimistic: a well-formed code travels with the sign-up until proven unknown.
    onChange(normalizeReferralCode(next));
  }

  function remove() {
    change("");
    setEditing(false);
  }

  // A pre-filled (or confirmed) code that isn't being edited: show it as applied.
  if (!editing && value.trim() && state !== "invalid") {
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground" role="status">
        {state === "valid" ? (
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
        ) : (
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        )}
        <span>
          Referral code <span className="font-medium text-foreground">{code}</span>{" "}
          {state === "valid" ? "applied" : "checking…"}
        </span>
        <span aria-hidden>·</span>
        <button type="button" className={TEXT_BUTTON} onClick={() => setEditing(true)}>
          Change
        </button>
      </p>
    );
  }

  if (!editing && !value.trim()) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
      >
        <Tag className="size-3.5" aria-hidden />
        Have a referral code?
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          Referral code
        </label>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={remove}>
          Remove
        </button>
      </div>
      <div className="relative">
        <Input
          ref={inputRef}
          id={inputId}
          value={value}
          onChange={(e) => change(e.target.value)}
          onBlur={() => state === "valid" && setEditing(false)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={24}
          placeholder="e.g. JORDAN-7K3Q"
          aria-invalid={state === "invalid"}
          aria-describedby={statusId}
          className="pr-9 uppercase placeholder:normal-case"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center" aria-hidden>
          {state === "checking" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {state === "valid" && <CheckCircle2 className="size-4 text-success" />}
        </span>
      </div>
      <p id={statusId} role="status" className="min-h-4 text-xs text-muted-foreground">
        {state === "valid" && "Code applied."}
        {state === "invalid" && (
          <span className="text-danger">We couldn&apos;t find that code. Check it, or remove it.</span>
        )}
      </p>
    </div>
  );
}
