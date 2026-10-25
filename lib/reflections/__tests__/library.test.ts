import { describe, it, expect } from "vitest";
import { REFLECTION_LIBRARY, getLibraryReflection, getLibraryReflectionForDate } from "../library";
import { REFLECTION_KINDS, REFLECTION_THEMES } from "../constants";
import { expandScheduleDates, parseDateKey, toDateKey, utcDaysBetween } from "../dates";

// Attributions are reviewed by hand (see the policy comment in library.ts).
// A new author must be added here deliberately, after checking the source.
const VERIFIED_ATTRIBUTIONS = new Set([
  "Japanese proverb",
  "Chinese proverb",
  "Robert Frost",
  "John Lubbock",
  "Anne Lamott",
  "Lao Tzu",
  "Audre Lorde",
  "Mary Anne Radmacher",
]);

describe("REFLECTION_LIBRARY", () => {
  it("has roughly sixty entries with unique ids", () => {
    expect(REFLECTION_LIBRARY.length).toBeGreaterThanOrEqual(55);
    expect(new Set(REFLECTION_LIBRARY.map((e) => e.id)).size).toBe(REFLECTION_LIBRARY.length);
  });

  it("covers every theme and only uses known kinds", () => {
    for (const theme of REFLECTION_THEMES) {
      expect(REFLECTION_LIBRARY.filter((e) => e.theme === theme).length).toBeGreaterThanOrEqual(5);
    }
    for (const entry of REFLECTION_LIBRARY) expect(REFLECTION_KINDS).toContain(entry.kind);
  });

  it("only attributes quotes to vetted authors, and never attributes questions or prompts", () => {
    for (const entry of REFLECTION_LIBRARY) {
      if (!entry.author) continue;
      expect(entry.kind).toBe("QUOTE");
      expect(VERIFIED_ATTRIBUTIONS.has(entry.author)).toBe(true);
    }
  });

  it("looks entries up by id", () => {
    expect(getLibraryReflection(REFLECTION_LIBRARY[3].id)).toBe(REFLECTION_LIBRARY[3]);
    expect(getLibraryReflection("nope")).toBeNull();
  });
});

describe("getLibraryReflectionForDate", () => {
  it("is deterministic for a day and changes the next day", () => {
    const day = new Date("2026-10-22T00:00:00Z");
    const next = new Date("2026-10-23T00:00:00Z");
    expect(getLibraryReflectionForDate(day, "client_1")).toBe(getLibraryReflectionForDate(day, "client_1"));
    expect(getLibraryReflectionForDate(next, "client_1")).not.toBe(getLibraryReflectionForDate(day, "client_1"));
  });

  it("handles days before the rotation epoch", () => {
    const entry = getLibraryReflectionForDate(new Date("2020-01-01T00:00:00Z"));
    expect(REFLECTION_LIBRARY).toContain(entry);
  });
});

describe("reflection dates", () => {
  it("parses only real YYYY-MM-DD keys", () => {
    expect(parseDateKey("2026-10-22")?.toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("22/10/2026")).toBeNull();
  });

  it("counts calendar days between UTC days", () => {
    expect(utcDaysBetween(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-22T18:00:00Z"))).toBe(21);
  });

  it("expands a single day", () => {
    expect(expandScheduleDates({ mode: "single", date: "2026-10-22" }).map(toDateKey)).toEqual(["2026-10-22"]);
  });

  it("expands recurring weekdays inclusively", () => {
    // 2026-10-19 is a Monday.
    const days = expandScheduleDates({ mode: "recurring", weekdays: [1, 3], startDate: "2026-10-19", endDate: "2026-10-28" });
    expect(days.map(toDateKey)).toEqual(["2026-10-19", "2026-10-21", "2026-10-26", "2026-10-28"]);
  });

  it("returns nothing for an inverted range", () => {
    expect(expandScheduleDates({ mode: "recurring", weekdays: [1], startDate: "2026-10-28", endDate: "2026-10-19" })).toEqual([]);
  });
});
