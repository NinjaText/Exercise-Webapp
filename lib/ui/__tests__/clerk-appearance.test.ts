import { describe, it, expect } from "vitest";
import { clerkAppearance, clerkAuthAppearance, userProfileAppearance } from "../clerk-appearance";

describe("clerkAuthAppearance", () => {
  it("keeps the shared token variables", () => {
    const a = clerkAuthAppearance();
    expect(a.variables).toMatchObject(clerkAppearance.variables);
    expect(a.variables.colorPrimary).toBe("var(--primary)");
  });

  it("renders card-less: no shadow, ring, border or padding on the card", () => {
    const { elements } = clerkAuthAppearance();
    for (const key of ["cardBox", "card"] as const) {
      expect(elements[key]).toContain("shadow-none!");
      expect(elements[key]).toContain("bg-transparent!");
      expect(elements[key]).toContain("border-0!");
      expect(elements[key]).not.toMatch(/(^|\s)ring-1/);
    }
    expect(elements.card).toContain("p-0!");
    expect(elements.footer).toContain("bg-transparent!");
  });

  it("matches our Input and Button (36px, rounded-md, tokens)", () => {
    const { elements } = clerkAuthAppearance();
    // 44px taps on phones (spec §4), 36px from sm up.
    expect(elements.formFieldInput).toContain("h-11!");
    expect(elements.formFieldInput).toContain("sm:h-9!");
    expect(elements.formFieldInput).toContain("rounded-md!");
    expect(elements.formFieldInput).toContain("border-input!");
    expect(elements.formFieldInput).toContain("focus-visible:ring-ring/50!");
    expect(elements.formButtonPrimary).toContain("h-11!");
    expect(elements.formButtonPrimary).toContain("sm:h-9!");
    expect(elements.formButtonPrimary).toContain("bg-primary!");
    expect(elements.formButtonPrimary).toContain("text-primary-foreground!");
    expect(elements.socialButtonsBlockButton).toContain("h-9!");
    expect(elements.socialButtonsBlockButton).toContain("border-input!");
  });

  it("shows Clerk's step header by default and hides it on request", () => {
    expect(clerkAuthAppearance().elements.header).not.toContain("hidden");
    expect(clerkAuthAppearance({ hideHeader: true }).elements.header).toContain("hidden!");
  });

  it("carries important overrides so the shared appearance beats Clerk's unlayered styles", () => {
    for (const key of ["navbarButton", "headerTitle", "profileSectionTitleText", "formButtonPrimary", "badge"] as const) {
      const classes = clerkAppearance.elements[key].split(/\s+/);
      for (const c of classes) expect(c.endsWith("!")).toBe(true);
    }
  });

  it("keeps width and shadow overrides out of the shared (UserButton) appearance", () => {
    expect("rootBox" in clerkAppearance.elements).toBe(false);
    expect("cardBox" in clerkAppearance.elements).toBe(false);
  });

  it("gives UserProfile the full-width card overrides", () => {
    expect(userProfileAppearance.elements.rootBox).toBe("w-full!");
    expect(userProfileAppearance.elements.cardBox).toContain("w-full!");
    expect(userProfileAppearance.elements.cardBox).toContain("ring-border!");
    expect(userProfileAppearance.elements.navbarButton).toBe(clerkAppearance.elements.navbarButton);
  });
});
