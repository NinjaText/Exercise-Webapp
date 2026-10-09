import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const authState: { userId: string | null } = { userId: "user_coach" };
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => authState) }));
vi.mock("@/lib/clubs/admin-session", () => ({ getActingAdmin: vi.fn() }));
vi.mock("@/lib/services/branding.service", () => ({ getOrgBranding: vi.fn(async () => ({})) }));
vi.mock("@/lib/branding/types", () => ({ toViewModel: (b: unknown) => b }));
vi.mock("@/components/auth/auth-shell", () => ({
  AuthShell: ({ subhead }: { subhead: string }) => subhead,
}));
vi.mock("../ended-client", () => ({ ClubSessionEnded: () => null }));

import { getActingAdmin } from "@/lib/clubs/admin-session";
import ClubSessionEndedPage from "../page";

const marker = {
  sid: "s1",
  adminUserId: "admin1",
  adminName: "Ada Admin",
  clerkOrgId: "org_pine",
  houseCoachClerkId: "user_coach",
  exp: Date.now() + 60_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.userId = "user_coach";
});

describe("ClubSessionEndedPage", () => {
  it("greets the admin when the marker belongs to the signed-in house coach", async () => {
    vi.mocked(getActingAdmin).mockResolvedValue(marker);
    const html = renderToStaticMarkup(await ClubSessionEndedPage());
    expect(html).toContain("Ada Admin, you&#x27;re being signed out of the club.");
  });

  it("shows neutral copy when the marker names another Clerk user", async () => {
    authState.userId = "user_other";
    vi.mocked(getActingAdmin).mockResolvedValue(marker);
    const html = renderToStaticMarkup(await ClubSessionEndedPage());
    expect(html).not.toContain("Ada Admin");
    expect(html).toContain("Your club session has ended or expired.");
  });

  it("shows neutral copy when signed out", async () => {
    authState.userId = null;
    vi.mocked(getActingAdmin).mockResolvedValue(marker);
    const html = renderToStaticMarkup(await ClubSessionEndedPage());
    expect(html).not.toContain("Ada Admin");
  });
});
