"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AUTH_FORM_WIDTH_CLASS, type AuthShellSize } from "@/components/auth/auth-shell";
import {
  createStepFormState,
  firstInvalidStep,
  isSubmitTooSoon,
  stepFormReducer,
  type StepFormAction,
  type StepFormState,
  type StepValidator,
} from "./step-form-state";

export interface StepMeta {
  title: string;
  description?: string;
}

interface StepFormProps {
  steps: readonly StepMeta[];
  /** Zero-based index of the visible step. */
  step: number;
  onBack: () => void;
  /** Submit on any step but the last (Continue / Enter). */
  onContinue: () => void;
  /** Submit on the last step. */
  onFinish: () => void;
  pending?: boolean;
  /** Last-step button label. */
  submitLabel?: string;
  /** Bump to move focus to the first `aria-invalid` field of the step. */
  invalidAttempt?: number;
  /** The AuthShell `size` it sits in, so the mobile/tablet action bar lines up with the column. */
  width?: AuthShellSize;
  /** The visible step's fields. */
  children: React.ReactNode;
}

/**
 * Generic multi-step form frame (spec §2.4): progress ("Step 2 of 4" plus a
 * segmented bar), the step title and description, the step's fields, and a
 * sticky bottom action bar (Back / Continue, "Finish setup" on the last step).
 *
 * Presentational and controlled: pair it with `useStepForm` for state. Every
 * step is one `<form>` submit, so Enter in a field advances (the parent's
 * `onContinue` validates first). Focus moves to the step heading whenever the
 * step changes, and to the first invalid field when a step is blocked.
 */
export function StepForm({
  steps,
  step,
  onBack,
  onContinue,
  onFinish,
  pending = false,
  submitLabel = "Finish setup",
  invalidAttempt = 0,
  width = "wide",
  children,
}: StepFormProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const shownStep = useRef(step);
  const shownAttempt = useRef(invalidAttempt);
  const stepChangedAt = useRef<number | null>(null);

  const total = steps.length;
  const isFirst = step === 0;
  const isLast = step === total - 1;
  const current = steps[step];

  // Layout effect: stamped synchronously on commit, before a double-click's
  // second event can reach handleSubmit.
  useLayoutEffect(() => {
    if (shownStep.current === step) return; // not on first render
    shownStep.current = step;
    stepChangedAt.current = performance.now();
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (shownAttempt.current === invalidAttempt) return;
    shownAttempt.current = invalidAttempt;
    bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [invalidAttempt, step]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || isSubmitTooSoon(stepChangedAt.current, performance.now())) return;
    if (isLast) onFinish();
    else onContinue();
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-busy={pending || undefined} className="flex flex-col">
      {total > 1 ? (
        <div data-slot="step-progress" className="mb-6 flex flex-col gap-3">
          <p className="text-caption font-medium text-muted-foreground tabular-nums">
            Step {step + 1} of {total}
          </p>
          <ol aria-label="Progress" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
            {steps.map((s, i) => (
              <li
                key={s.title}
                aria-current={i === step ? "step" : undefined}
                className="flex min-w-0 flex-col gap-2"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
                    i <= step ? "bg-primary" : "bg-muted",
                  )}
                />
                <span
                  className={cn(
                    "hidden truncate text-caption sm:block",
                    i === step ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="sr-only">{i < step ? "Completed: " : i > step ? "Upcoming: " : "Current: "}</span>
                  {s.title}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div
        key={step}
        ref={bodyRef}
        data-slot="step-form-body"
        className="animate-in fade-in-0 duration-200 motion-reduce:animate-none"
      >
        <div className="mb-6">
          <h2 ref={headingRef} tabIndex={-1} className="text-title text-foreground outline-none">
            {current?.title}
          </h2>
          {current?.description ? (
            <p className="mt-1.5 text-body text-muted-foreground">{current.description}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">{children}</div>
      </div>

      {/* Below lg: fixed to the viewport edges (AuthShell's panel reserves
          room for it, see globals.css), content aligned to the form column.
          lg and up: sticky inside the right panel's column. */}
      <div
        data-slot="step-form-actions"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface px-4 pt-3 sm:px-6 lg:sticky lg:inset-x-auto lg:mt-8 lg:px-0"
        style={{ paddingBottom: "max(0.75rem, var(--safe-bottom))" }}
      >
        <div className={cn("mx-auto flex w-full items-center gap-3 lg:max-w-none", AUTH_FORM_WIDTH_CLASS[width])}>
          {!isFirst ? (
            <Button
              key="back"
              type="button"
              variant="secondary"
              size="lg"
              className="h-11 sm:h-10"
              onClick={onBack}
              disabled={pending}
            >
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
          ) : null}
          {/* Separate keyed elements: the last step's button is a new node,
              never the previous step's Continue relabelled in place. */}
          {isLast ? (
            <Button
              key="finish"
              type="submit"
              size="lg"
              className="ml-auto h-11 min-w-32 flex-1 sm:h-10 sm:flex-none"
              disabled={pending}
            >
              {pending ? <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : null}
              {submitLabel}
            </Button>
          ) : (
            <Button
              key="continue"
              type="submit"
              size="lg"
              className="ml-auto h-11 min-w-32 flex-1 sm:h-10 sm:flex-none"
              disabled={pending}
            >
              Continue
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

/**
 * State for a `StepForm`: one values object for the whole form (Back keeps
 * everything), per-step validation on Continue, and `validateAll` for the
 * final submit, which jumps back to the first step that fails.
 */
export function useStepForm<V>(initialValues: V, validators: readonly (StepValidator<V> | undefined)[]) {
  const [state, dispatch] = useReducer(
    (s: StepFormState<V>, a: StepFormAction<V>) => stepFormReducer(s, a),
    initialValues,
    createStepFormState,
  );

  const set = useCallback((patch: Partial<V>) => dispatch({ type: "set", patch }), []);
  const back = useCallback(() => dispatch({ type: "back" }), []);
  const goTo = useCallback((step: number) => dispatch({ type: "goTo", step }), []);
  const next = () => dispatch({ type: "next", stepCount: validators.length, validate: validators[state.step] });
  const validateAll = () => {
    const invalid = firstInvalidStep(validators, state.values);
    if (invalid) dispatch({ type: "invalid", ...invalid });
    return invalid === null;
  };

  return { ...state, set, back, goTo, next, validateAll };
}
