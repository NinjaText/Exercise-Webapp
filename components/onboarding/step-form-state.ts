/**
 * Pure state machine behind `StepForm` (spec §2.4): which step is showing,
 * the entered values (one object for the whole form, so Back never loses
 * anything) and the current step's field errors. Browser- and server-safe.
 */

/** Field name → message. Empty object means the step is valid. */
export type FieldErrors = Record<string, string>;

export type StepValidator<V> = (values: V) => FieldErrors;

export interface StepFormState<V> {
  step: number;
  values: V;
  errors: FieldErrors;
  /** Bumped on every blocked Continue/Finish so the UI can focus the first invalid field. */
  invalidAttempt: number;
}

export type StepFormAction<V> =
  | { type: "set"; patch: Partial<V> }
  | { type: "next"; stepCount: number; validate?: StepValidator<V> }
  | { type: "back" }
  | { type: "goTo"; step: number }
  | { type: "invalid"; step: number; errors: FieldErrors };

export function createStepFormState<V>(values: V): StepFormState<V> {
  return { step: 0, values, errors: {}, invalidAttempt: 0 };
}

const hasErrors = (errors: FieldErrors) => Object.keys(errors).length > 0;

export function stepFormReducer<V>(state: StepFormState<V>, action: StepFormAction<V>): StepFormState<V> {
  switch (action.type) {
    case "set": {
      // Editing a field clears only that field's message.
      const errors = { ...state.errors };
      for (const key of Object.keys(action.patch)) delete errors[key];
      return { ...state, values: { ...state.values, ...action.patch }, errors };
    }
    case "next": {
      const errors = action.validate?.(state.values) ?? {};
      if (hasErrors(errors)) return { ...state, errors, invalidAttempt: state.invalidAttempt + 1 };
      return { ...state, step: Math.min(state.step + 1, action.stepCount - 1), errors: {} };
    }
    case "back":
      return { ...state, step: Math.max(state.step - 1, 0), errors: {} };
    case "goTo":
      // Only backwards: later steps are reached through Continue (and its validation).
      return action.step < state.step ? { ...state, step: Math.max(action.step, 0), errors: {} } : state;
    case "invalid":
      return { ...state, step: action.step, errors: action.errors, invalidAttempt: state.invalidAttempt + 1 };
  }
}

/** The first step whose validator fails, with its errors; null when every step is valid. */
export function firstInvalidStep<V>(
  validators: readonly (StepValidator<V> | undefined)[],
  values: V,
): { step: number; errors: FieldErrors } | null {
  for (let step = 0; step < validators.length; step++) {
    const errors = validators[step]?.(values) ?? {};
    if (hasErrors(errors)) return { step, errors };
  }
  return null;
}

/**
 * A submit this soon after the step changed is the tail of a double-click on
 * the previous step's button (Continue → the next step's Continue/Finish), not
 * a fresh intent: ignore it so a double-click can never skip a step.
 */
export const STEP_SUBMIT_GUARD_MS = 400;

export function isSubmitTooSoon(stepChangedAt: number | null, now: number, guardMs = STEP_SUBMIT_GUARD_MS): boolean {
  return stepChangedAt !== null && now - stepChangedAt < guardMs;
}
