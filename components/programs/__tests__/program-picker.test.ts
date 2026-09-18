import { describe, it, expect } from "vitest";
import {
  programFacets,
  deriveFacetChips,
  filterPickerPrograms,
  sortPickerPrograms,
  formatProgramCadence,
  type PickerProgram,
} from "../program-picker";

const program = (over: Partial<PickerProgram> = {}): PickerProgram => ({
  id: "p1",
  name: "Program",
  schedulingType: "SCHEDULED",
  ...over,
});

describe("programFacets", () => {
  it("merges goals, body areas and activities into one list", () => {
    expect(
      programFacets(
        program({ goals: ["Rehab"], bodyAreas: ["Shoulder"], activities: ["Golf"] })
      )
    ).toEqual(["Rehab", "Shoulder", "Golf"]);
  });

  it("de-duplicates a value that appears in two facet groups", () => {
    expect(programFacets(program({ goals: ["Mobility"], bodyAreas: ["Mobility"] }))).toEqual([
      "Mobility",
    ]);
  });

  it("drops empty and whitespace-only values", () => {
    expect(programFacets(program({ goals: ["", "  ", "Rehab"] }))).toEqual(["Rehab"]);
  });

  it("returns an empty list when every facet field is missing", () => {
    expect(programFacets(program())).toEqual([]);
  });
});

describe("deriveFacetChips", () => {
  it("orders chips by how many programs carry them", () => {
    const programs = [
      program({ id: "a", goals: ["Rehab"] }),
      program({ id: "b", goals: ["Rehab"] }),
      program({ id: "c", goals: ["Golf"] }),
    ];
    expect(deriveFacetChips(programs)).toEqual(["Rehab", "Golf"]);
  });

  it("breaks frequency ties alphabetically", () => {
    const programs = [program({ id: "a", goals: ["Zebra"] }), program({ id: "b", goals: ["Alpha"] })];
    expect(deriveFacetChips(programs)).toEqual(["Alpha", "Zebra"]);
  });

  it("counts a program once per facet even if it repeats the value", () => {
    const programs = [
      program({ id: "a", goals: ["Rehab"], bodyAreas: ["Rehab"] }),
      program({ id: "b", goals: ["Golf"] }),
      program({ id: "c", goals: ["Golf"] }),
    ];
    expect(deriveFacetChips(programs)).toEqual(["Golf", "Rehab"]);
  });

  it("caps the chip row so it cannot overflow the dialog", () => {
    const programs = Array.from({ length: 20 }, (_, i) =>
      program({ id: `p${i}`, goals: [`Facet ${i}`] })
    );
    expect(deriveFacetChips(programs)).toHaveLength(8);
  });
});

describe("filterPickerPrograms", () => {
  const scheduled = program({ id: "s", name: "Early Rehab", schedulingType: "SCHEDULED" });
  const onDemand = program({ id: "o", name: "Mobility Flow", schedulingType: "ON_DEMAND" });
  // Written before schedulingType existed — must read as SCHEDULED, not vanish.
  const legacy = program({ id: "l", name: "Legacy Plan", schedulingType: null });

  it("keeps only scheduled programs in the scheduled tab", () => {
    const rows = filterPickerPrograms([scheduled, onDemand, legacy], {
      kind: "SCHEDULED",
      search: "",
      facet: null,
    });
    expect(rows.map((p) => p.id)).toEqual(["s", "l"]);
  });

  it("keeps only on-demand programs in the on-demand tab", () => {
    const rows = filterPickerPrograms([scheduled, onDemand, legacy], {
      kind: "ON_DEMAND",
      search: "",
      facet: null,
    });
    expect(rows.map((p) => p.id)).toEqual(["o"]);
  });

  it("matches the search term case-insensitively on the name", () => {
    const rows = filterPickerPrograms([scheduled, legacy], {
      kind: "SCHEDULED",
      search: "  rehab ",
      facet: null,
    });
    expect(rows.map((p) => p.id)).toEqual(["s"]);
  });

  it("matches the search term against facets too", () => {
    const golf = program({ id: "g", name: "Week 1", activities: ["Golf"] });
    const rows = filterPickerPrograms([scheduled, golf], {
      kind: "SCHEDULED",
      search: "golf",
      facet: null,
    });
    expect(rows.map((p) => p.id)).toEqual(["g"]);
  });

  it("narrows to a selected facet chip", () => {
    const golf = program({ id: "g", name: "Week 1", activities: ["Golf"] });
    const rows = filterPickerPrograms([scheduled, golf], {
      kind: "SCHEDULED",
      search: "",
      facet: "Golf",
    });
    expect(rows.map((p) => p.id)).toEqual(["g"]);
  });
});

describe("sortPickerPrograms", () => {
  const a = program({ id: "a", name: "Beta", durationWeeks: 6, updatedAt: "2026-01-01" });
  const b = program({ id: "b", name: "alpha", durationWeeks: 2, updatedAt: "2026-03-01" });

  it("sorts most recently updated first", () => {
    expect(sortPickerPrograms([a, b], "recent").map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("sorts by name ignoring case", () => {
    expect(sortPickerPrograms([a, b], "name").map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("sorts shortest duration first, with unknown durations last", () => {
    const c = program({ id: "c", name: "Gamma", durationWeeks: null });
    expect(sortPickerPrograms([a, c, b], "duration").map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  it("does not mutate the array it is given", () => {
    const rows = [a, b];
    sortPickerPrograms(rows, "name");
    expect(rows.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("formatProgramCadence", () => {
  it("reads as weeks and days per week when both are known", () => {
    expect(formatProgramCadence(program({ durationWeeks: 4, daysPerWeek: 3 }))).toBe(
      "4 weeks · 3 days/week"
    );
  });

  it("singularizes a one-week, one-day program", () => {
    expect(formatProgramCadence(program({ durationWeeks: 1, daysPerWeek: 1 }))).toBe(
      "1 week · 1 day/week"
    );
  });

  it("omits the half it does not know", () => {
    expect(formatProgramCadence(program({ durationWeeks: 4 }))).toBe("4 weeks");
    expect(formatProgramCadence(program({ daysPerWeek: 3 }))).toBe("3 days/week");
  });

  it("returns null when neither is known, so the row can skip the line", () => {
    expect(formatProgramCadence(program())).toBeNull();
  });
});
