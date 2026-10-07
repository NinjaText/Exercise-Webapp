import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/actions/admin-club-actions", () => ({ createClubAction: vi.fn(), updateClubAction: vi.fn() }));

import { ClubForm, clubFormPayload, type ClubFormValues } from "../club-form";

const values: ClubFormValues = {
  name: "Pine", joinSlug: "pine", joinCode: "PINE24", trialDays: 14,
  membershipAmount: "14.99", coachingAmount: "30.00", starterProgramIds: [], resourceProgramIds: [], trainerEmail: "",
};

describe("ClubForm", () => {
  it("asks for dollar amounts, not Stripe price ids", () => {
    const html = renderToStaticMarkup(<ClubForm mode="create" globalPrograms={[]} resourcePrograms={[]} />);
    expect(html).toContain("Membership price");
    expect(html).toContain("Coaching price");
    expect(html).toContain('id="club-membership-amount"');
    expect(html).toContain('id="club-coaching-amount"');
    expect(html).not.toMatch(/price id|price_/i);
  });

  it("pre-fills the current amounts on edit", () => {
    const html = renderToStaticMarkup(
      <ClubForm mode="edit" clerkOrgId="org_1" globalPrograms={[]} resourcePrograms={[]} initial={values} />
    );
    expect(html).toContain('value="14.99"');
    expect(html).toContain('value="30.00"');
  });

  it("shows the note when a current price couldn't be loaded", () => {
    const html = renderToStaticMarkup(
      <ClubForm
        mode="edit"
        clerkOrgId="org_1"
        globalPrograms={[]} resourcePrograms={[]}
        initial={{ ...values, coachingAmount: "" }}
        priceNotes={{ coaching: "Couldn't load the current price. Leave empty to keep it unchanged." }}
      />
    );
    expect(html).toContain("Couldn&#x27;t load the current price");
  });
});

describe("clubFormPayload", () => {
  it("sends keep flags only for an empty field that has a note", () => {
    const payload = clubFormPayload({ ...values, coachingAmount: " " }, { coaching: "note" });
    expect(payload).toMatchObject({ keepMembershipPrice: false, keepCoachingPrice: true });
    expect(payload).not.toHaveProperty("requestId");
  });
  it("an empty coaching field without a note means remove (no keep flag)", () => {
    expect(clubFormPayload({ ...values, coachingAmount: "" }, {}).keepCoachingPrice).toBe(false);
  });
  it("a typed amount is never a keep", () => {
    expect(clubFormPayload(values, { membership: "n", coaching: "n" })).toMatchObject({
      keepMembershipPrice: false, keepCoachingPrice: false,
    });
  });
});
