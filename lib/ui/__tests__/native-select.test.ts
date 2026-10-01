import { describe, it, expect } from "vitest";
import { NATIVE_SELECT_CLASS } from "../native-select";

describe("NATIVE_SELECT_CLASS", () => {
  it("matches the Input/Select height, focus ring and disabled contract", () => {
    expect(NATIVE_SELECT_CLASS).toContain("h-9");
    expect(NATIVE_SELECT_CLASS).toContain("focus-visible:ring-ring/50");
    expect(NATIVE_SELECT_CLASS).toContain("disabled:opacity-50");
    expect(NATIVE_SELECT_CLASS).toContain("motion-reduce:transition-none");
  });
});
