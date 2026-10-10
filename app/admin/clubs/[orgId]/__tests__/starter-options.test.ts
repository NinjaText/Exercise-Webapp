import { describe, it, expect } from "vitest";
import { clubProgramWhere, resourceOptions, starterOptions } from "../starter-options";

describe("clubProgramWhere", () => {
  it("always includes the current picks in the OR", () => {
    expect(clubProgramWhere(["s1"], null).OR).toEqual([{ isGlobal: true }, { id: { in: ["s1"] } }]);
  });
  it("adds the house coach's templates (any of their programs with no client) when one exists", () => {
    expect(clubProgramWhere(["s1"], "t1").OR).toEqual([
      { isGlobal: true },
      { isGlobal: false, trainerId: "t1", OR: [{ clientId: null }, { clientId: { isSet: false } }] },
      { id: { in: ["s1"] } },
    ]);
  });
  it("omits the id clause when there are no current picks", () => {
    expect(clubProgramWhere([], null).OR).toEqual([{ isGlobal: true }]);
  });
});

const p = (id: string, schedulingType: string | null, isGlobal: boolean) => ({ id, name: id, schedulingType, isGlobal });
const programs = [p("a", "SCHEDULED", true), p("b", "ON_DEMAND", true), p("old", "ON_DEMAND", false), p("c", "SCHEDULED", false)];

describe("starterOptions", () => {
  it("keeps scheduled programs and current starters, labelling non-global ones", () => {
    expect(starterOptions(programs, ["old"])).toEqual([
      { id: "a", name: "a" },
      { id: "old", name: "old (house coach's)" },
      { id: "c", name: "c (house coach's)" },
    ]);
  });
});

describe("resourceOptions", () => {
  it("keeps resources and current resources, never other scheduled programs", () => {
    expect(resourceOptions(programs, ["c"])).toEqual([
      { id: "b", name: "b" },
      { id: "old", name: "old (house coach's)" },
      { id: "c", name: "c (house coach's)" },
    ]);
  });
});
