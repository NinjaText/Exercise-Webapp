import { describe, it, expect } from "vitest";
import { nextStarterTemplateId } from "@/lib/clubs/starter-progression";

describe("nextStarterTemplateId", () => {
  it("returns the first template in club order not yet assigned", () => {
    expect(nextStarterTemplateId(["a", "b", "c"], [])).toBe("a");
    expect(nextStarterTemplateId(["a", "b", "c"], ["a"])).toBe("b");
    expect(nextStarterTemplateId(["a", "b", "c"], ["b", "a"])).toBe("c");
  });
  it("returns null when everything was assigned", () => {
    expect(nextStarterTemplateId(["a", "b"], ["a", "b"])).toBeNull();
    expect(nextStarterTemplateId([], [])).toBeNull();
  });
  it("ignores assignments of templates no longer on the list", () => {
    expect(nextStarterTemplateId(["b"], ["a"])).toBe("b");
  });
});
