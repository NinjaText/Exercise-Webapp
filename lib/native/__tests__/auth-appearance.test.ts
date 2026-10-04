import { describe, it, expect } from "vitest";
import { authAppearanceFor, profileAppearanceFor, withNativeAuthAppearance } from "../auth-appearance";

describe("authAppearanceFor", () => {
  it("hides social buttons and the divider in the native shell", () => {
    const a = authAppearanceFor(true);
    for (const key of ["socialButtonsBlockButton", "socialButtonsIconButton", "dividerRow"]) {
      expect(a?.elements[key]).toEqual({ display: "none" });
    }
  });
  it("changes nothing on the web", () => {
    expect(authAppearanceFor(false)).toBeUndefined();
  });
});

describe("withNativeAuthAppearance", () => {
  const base = { variables: { colorPrimary: "x" }, elements: { card: "c", socialButtonsBlockButton: "btn" } };

  it("returns the base appearance untouched on the web", () => {
    expect(withNativeAuthAppearance(base, false)).toBe(base);
  });

  it("keeps the base styling and hides social sign-in in the native shell", () => {
    const a = withNativeAuthAppearance(base, true);
    expect(a.variables).toBe(base.variables);
    expect(a.elements.card).toBe("c");
    expect(a.elements.socialButtonsBlockButton).toEqual({ display: "none" });
    expect((a.elements as Record<string, unknown>).dividerRow).toEqual({ display: "none" });
  });
});

describe("profileAppearanceFor", () => {
  const base = {
    variables: { colorPrimary: "var(--primary)" },
    elements: { rootBox: "w-full", cardBox: "shadow-none" },
  };

  it("returns the base appearance unchanged on the web", () => {
    expect(profileAppearanceFor(false, base)).toBe(base);
  });

  it("keeps every base element and hides connected accounts on native", () => {
    const result = profileAppearanceFor(true, base);
    expect(result.elements).toEqual({
      rootBox: "w-full",
      cardBox: "shadow-none",
      profileSection__connectedAccounts: { display: "none" },
    });
    expect(result.variables).toEqual(base.variables);
  });
});
