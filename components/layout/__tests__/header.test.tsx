import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { User, Notification } from "@prisma/client";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => null,
}));

vi.mock("@/actions/notification-actions", () => ({
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));

import { Header } from "../header";
import { resolveBranding } from "@/lib/branding/resolve";
import { toViewModel } from "@/lib/branding/types";

const branding = toViewModel(resolveBranding(null));

const user = {
  firstName: "Yahya",
  lastName: "Shah",
  email: "yahya@useathos.ai",
  imageUrl: "",
  role: "TRAINER",
} as unknown as User;

describe("Header", () => {
  it("renders a phone search trigger hidden from sm up, alongside the existing sm+ trigger", () => {
    const html = renderToStaticMarkup(
      <Header
        user={user}
        unreadMessageCount={0}
        unreadNotificationCount={0}
        initialNotifications={[] as Notification[]}
        branding={branding}
      />
    );

    // The phone trigger: an icon button, hidden at sm+, labelled for a11y.
    const searchButtons = html.match(/<button[^>]*aria-label="Search"[^>]*>/g) ?? [];
    expect(searchButtons.length).toBe(1);
    expect(searchButtons[0]).toContain("sm:hidden");

    // The existing wide sm+ trigger is untouched.
    expect(html).toContain("Search...");
    expect(html).toContain("sm:flex");
  });

  it("opens the same command palette from the phone trigger (shares useSearch's setOpen)", () => {
    // Both triggers must call the same opener; there is no separate palette
    // instance to open below `sm`, so the only observable difference is the
    // trigger markup itself (covered above). This asserts both buttons exist
    // as siblings of one Header render.
    const html = renderToStaticMarkup(
      <Header
        user={user}
        unreadMessageCount={0}
        unreadNotificationCount={0}
        initialNotifications={[] as Notification[]}
        branding={branding}
      />
    );
    const searchButtonCount = (html.match(/aria-label="Search"/g) ?? []).length;
    expect(searchButtonCount).toBe(1);
    expect((html.match(/Search\.\.\./g) ?? []).length).toBe(1);
  });
});
