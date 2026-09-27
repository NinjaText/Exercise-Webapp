import { describe, expect, it } from "vitest";
import { isCalendarDraggable } from "../calendar-drag";

describe("isCalendarDraggable", () => {
  it("allows drag for an editable event on a larger screen", () => {
    expect(isCalendarDraggable({ readOnly: false, isPhone: false })).toBe(true);
  });

  it("turns drag off on phones, where tapping opens the event instead", () => {
    expect(isCalendarDraggable({ readOnly: false, isPhone: true })).toBe(false);
  });

  it("never drags a read-only event", () => {
    expect(isCalendarDraggable({ readOnly: true, isPhone: false })).toBe(false);
    expect(isCalendarDraggable({ readOnly: true, isPhone: true })).toBe(false);
  });
});
