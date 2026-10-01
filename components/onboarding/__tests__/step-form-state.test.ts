import { describe, it, expect } from "vitest";
import {
  createStepFormState,
  firstInvalidStep,
  isSubmitTooSoon,
  STEP_SUBMIT_GUARD_MS,
  stepFormReducer,
  type FieldErrors,
  type StepValidator,
} from "../step-form-state";

type V = { a: string; b: string; c: string };
const validators: (StepValidator<V> | undefined)[] = [
  (v): FieldErrors => (v.a ? {} : { a: "Enter a" }),
  (v): FieldErrors => (v.b ? {} : { b: "Enter b" }),
  undefined,
];
const initial = () => createStepFormState<V>({ a: "", b: "", c: "" });

describe("stepFormReducer", () => {
  it("starts on the first step with no errors", () => {
    expect(initial()).toEqual({ step: 0, values: { a: "", b: "", c: "" }, errors: {}, invalidAttempt: 0 });
  });

  it("blocks Continue and shows the step's errors when invalid", () => {
    const s = stepFormReducer(initial(), { type: "next", stepCount: 3, validate: validators[0] });
    expect(s.step).toBe(0);
    expect(s.errors).toEqual({ a: "Enter a" });
    expect(s.invalidAttempt).toBe(1);
  });

  it("advances when the step is valid and clears errors", () => {
    let s = stepFormReducer(initial(), { type: "next", stepCount: 3, validate: validators[0] });
    s = stepFormReducer(s, { type: "set", patch: { a: "x" } });
    expect(s.errors).toEqual({});
    s = stepFormReducer(s, { type: "next", stepCount: 3, validate: validators[0] });
    expect(s.step).toBe(1);
    expect(s.errors).toEqual({});
  });

  it("only clears the errors of the fields being edited", () => {
    const s = stepFormReducer(
      { ...initial(), errors: { a: "Enter a", b: "Enter b" } },
      { type: "set", patch: { a: "x" } },
    );
    expect(s.errors).toEqual({ b: "Enter b" });
  });

  it("never advances past the last step", () => {
    const s = stepFormReducer({ ...initial(), step: 2 }, { type: "next", stepCount: 3 });
    expect(s.step).toBe(2);
  });

  it("Back keeps every entered value", () => {
    let s = stepFormReducer(initial(), { type: "set", patch: { a: "first" } });
    s = stepFormReducer(s, { type: "next", stepCount: 3, validate: validators[0] });
    s = stepFormReducer(s, { type: "set", patch: { b: "second" } });
    s = stepFormReducer(s, { type: "next", stepCount: 3, validate: validators[1] });
    s = stepFormReducer(s, { type: "set", patch: { c: "third" } });
    s = stepFormReducer(s, { type: "back" });
    expect(s.step).toBe(1);
    s = stepFormReducer(s, { type: "back" });
    expect(s.step).toBe(0);
    expect(s.values).toEqual({ a: "first", b: "second", c: "third" });
    // Back from the first step is a no-op.
    expect(stepFormReducer(s, { type: "back" }).step).toBe(0);
  });

  it("goTo only moves backwards (edit links on a review step)", () => {
    const s = { ...initial(), step: 2 };
    expect(stepFormReducer(s, { type: "goTo", step: 0 }).step).toBe(0);
    expect(stepFormReducer({ ...initial(), step: 0 }, { type: "goTo", step: 2 }).step).toBe(0);
  });

  it("invalid jumps to the failing step with its errors", () => {
    const s = stepFormReducer({ ...initial(), step: 2 }, { type: "invalid", step: 0, errors: { a: "Enter a" } });
    expect(s).toMatchObject({ step: 0, errors: { a: "Enter a" }, invalidAttempt: 1 });
  });
});

describe("firstInvalidStep", () => {
  it("returns the first failing step and its errors, or null", () => {
    expect(firstInvalidStep(validators, { a: "", b: "", c: "" })).toEqual({ step: 0, errors: { a: "Enter a" } });
    expect(firstInvalidStep(validators, { a: "x", b: "", c: "" })).toEqual({ step: 1, errors: { b: "Enter b" } });
    expect(firstInvalidStep(validators, { a: "x", b: "y", c: "" })).toBeNull();
  });
});

describe("isSubmitTooSoon (double-click guard)", () => {
  it("ignores a submit within the guard window after a step change", () => {
    expect(isSubmitTooSoon(1000, 1000 + 120)).toBe(true);
    expect(isSubmitTooSoon(1000, 1000 + STEP_SUBMIT_GUARD_MS - 1)).toBe(true);
  });
  it("accepts submits after the window, and before any step change", () => {
    expect(isSubmitTooSoon(1000, 1000 + STEP_SUBMIT_GUARD_MS)).toBe(false);
    expect(isSubmitTooSoon(null, 5)).toBe(false);
  });
  it("the guard is about 400ms", () => {
    expect(STEP_SUBMIT_GUARD_MS).toBe(400);
  });
});
