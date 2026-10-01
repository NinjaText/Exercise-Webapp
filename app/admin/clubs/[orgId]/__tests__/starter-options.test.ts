import { describe, it, expect } from "vitest";
import { starterOptions, starterProgramWhere } from "../starter-options";

describe("starterProgramWhere", () => {
  it("always includes the current starters in the OR", () => {
    expect(starterProgramWhere(["s1"], null).OR).toEqual([{ isGlobal: true }, { id: { in: ["s1"] } }]);
  });
  it("adds the trainer's templates when a trainer exists", () => {
    expect(starterProgramWhere(["s1"], "t1").OR).toEqual([
      { isGlobal: true },
      { isTemplate: true, isGlobal: false, trainerId: "t1" },
      { id: { in: ["s1"] } },
    ]);
  });
  it("omits the id clause when there are no starters", () => {
    expect(starterProgramWhere([], null).OR).toEqual([{ isGlobal: true }]);
  });
});

describe("starterOptions", () => {
  const p = (id: string, schedulingType: string | null, isGlobal: boolean) => ({ id, name: id, schedulingType, isGlobal });
  it("keeps scheduled programs and current starters, labelling non-global ones", () => {
    const out = starterOptions(
      [p("a", "SCHEDULED", true), p("b", "ON_DEMAND", true), p("old", "ON_DEMAND", false), p("c", "SCHEDULED", false)],
      ["old"]
    );
    expect(out).toEqual([
      { id: "a", name: "a" },
      { id: "old", name: "old (trainer's)" },
      { id: "c", name: "c (trainer's)" },
    ]);
  });
});
