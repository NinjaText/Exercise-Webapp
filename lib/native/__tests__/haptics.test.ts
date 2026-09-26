import { describe, it, expect, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
const impact = vi.fn();
vi.mock("@capacitor/haptics", () => ({ Haptics: { impact }, ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM" } }));

import { haptic } from "../haptics";

describe("haptic", () => {
  it("does nothing on the web", async () => {
    await haptic();
    expect(impact).not.toHaveBeenCalled();
  });
});
