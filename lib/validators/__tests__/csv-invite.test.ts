import { describe, it, expect } from "vitest";
import { parseEmailList } from "../csv-invite";

describe("parseEmailList", () => {
  it("parses emails separated by commas, semicolons, whitespace, and newlines", () => {
    const result = parseEmailList("a@example.com, b@example.com; c@example.com\nd@example.com e@example.com");
    expect(result.valid).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
      "d@example.com",
      "e@example.com",
    ]);
    expect(result.errors).toHaveLength(0);
  });

  it("dedupes case-insensitively and lowercases", () => {
    const result = parseEmailList("a@example.com, A@Example.com");
    expect(result.valid).toEqual(["a@example.com"]);
  });

  it("reports invalid tokens as errors without including them in valid", () => {
    const result = parseEmailList("a@example.com, not-an-email");
    expect(result.valid).toEqual(["a@example.com"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("not-an-email");
  });

  it("returns empty results for blank input", () => {
    const result = parseEmailList("   \n\n  ");
    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
