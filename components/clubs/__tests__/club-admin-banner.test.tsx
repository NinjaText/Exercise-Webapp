import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("@/actions/admin-club-session-actions", () => ({ exitClubAction: vi.fn() }));

import { ClubAdminBanner, exitClubSession } from "../club-admin-banner";

describe("ClubAdminBanner", () => {
  it("shows the club and the admin's first name with an Exit control", () => {
    const html = renderToStaticMarkup(<ClubAdminBanner clubName="Pine Valley CC" adminName="Yahya Shah" />);
    expect(html).toContain("Pine Valley CC");
    expect(html).toContain("as Yahya");
    expect(html).not.toContain("Shah");
    expect(html).toContain("Exit");
  });
});

describe("exitClubSession", () => {
  it("ends the session, then signs out to /admin", async () => {
    const order: string[] = [];
    await exitClubSession({
      exitAction: async () => void order.push("exit"),
      signOut: async (o) => void order.push(`signOut:${o.redirectUrl}`),
    });
    expect(order).toEqual(["exit", "signOut:/admin"]);
  });

  it("still signs out when ending the session throws", async () => {
    const signOut = vi.fn(async () => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await exitClubSession({ exitAction: () => Promise.reject(new Error("db down")), signOut });
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/admin" });
    errSpy.mockRestore();
  });
});
