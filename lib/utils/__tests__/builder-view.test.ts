import { describe, it, expect } from "vitest";
import {
  exerciseKey,
  resolveOpenKeys,
  isExerciseOpen,
} from "../builder-view";

const A = exerciseKey(0, 0, 0);
const B = exerciseKey(0, 0, 1);
const C = exerciseKey(0, 1, 0);

describe("exerciseKey", () => {
  it("is unique per workout/block/exercise position", () => {
    expect(A).not.toBe(B);
    expect(B).not.toBe(C);
    expect(exerciseKey(0, 0, 0)).toBe(A);
  });
});

describe("resolveOpenKeys — focus mode", () => {
  it("selecting an exercise opens it and collapses the previous one", () => {
    const next = resolveOpenKeys("focus", new Set([A]), B, "select");
    expect([...next]).toEqual([B]);
  });

  it("toggling opens an additional exercise without collapsing others", () => {
    const next = resolveOpenKeys("focus", new Set([A]), B, "toggle");
    expect(next.has(A)).toBe(true);
    expect(next.has(B)).toBe(true);
  });

  it("toggling an already-open exercise closes just that one", () => {
    const next = resolveOpenKeys("focus", new Set([A, B]), B, "toggle");
    expect(next.has(A)).toBe(true);
    expect(next.has(B)).toBe(false);
  });

  it("selecting the already-open exercise leaves it open", () => {
    const next = resolveOpenKeys("focus", new Set([A]), A, "select");
    expect([...next]).toEqual([A]);
  });
});

describe("resolveOpenKeys — view all mode", () => {
  it("leaves the open set untouched, since everything renders expanded", () => {
    const before = new Set([A]);
    const next = resolveOpenKeys("all", before, B, "select");
    expect([...next]).toEqual([...before]);
  });

  it("ignores a toggle intent too, leaving the open set untouched", () => {
    const before = new Set([A]);
    const next = resolveOpenKeys("all", before, A, "toggle");
    expect([...next]).toEqual([...before]);
    expect([...before]).toEqual([A]); // input not mutated
  });
});

describe("isExerciseOpen", () => {
  it("is true for every exercise in view-all mode", () => {
    expect(isExerciseOpen("all", new Set(), C)).toBe(true);
  });

  it("is true in focus mode only for keys in the open set", () => {
    expect(isExerciseOpen("focus", new Set([A]), A)).toBe(true);
    expect(isExerciseOpen("focus", new Set([A]), B)).toBe(false);
  });

  it("never mutates the set it is given", () => {
    const open = new Set([A]);
    resolveOpenKeys("focus", open, B, "select");
    expect([...open]).toEqual([A]);
  });
});
