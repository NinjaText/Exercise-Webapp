import { describe, it, expect } from "vitest";
import { activeUserOnly } from "../active-user";

describe("activeUserOnly", () => {
  it("refuses only an explicitly deactivated user", () => {
    expect(activeUserOnly(null)).toBeNull();
    expect(activeUserOnly({ isActive: false })).toBeNull();
    expect(activeUserOnly({ isActive: true })).toEqual({ isActive: true });
    expect(activeUserOnly({})).toEqual({});
  });
});
