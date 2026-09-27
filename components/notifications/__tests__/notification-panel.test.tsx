import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Notification } from "@prisma/client";

// Mutable per-test, following the mockPathname pattern in
// sidebar-nav-parity.test.tsx: lets each test pick which container renders.
let mockIsPhone = false;
vi.mock("@/hooks/use-is-phone", () => ({
  useIsPhoneViewport: () => mockIsPhone,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/actions/notification-actions", () => ({
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));

import { NotificationPanel } from "../notification-panel";

function fixture(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    userId: "u1",
    type: "SESSION_REMINDER",
    title: "Session tomorrow",
    body: "10am with Jane",
    isRead: false,
    link: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as unknown as Notification;
}

describe("NotificationPanel", () => {
  beforeEach(() => {
    mockIsPhone = false;
  });

  it("uses the popover trigger by default (server/desktop)", () => {
    const html = renderToStaticMarkup(
      <NotificationPanel initialNotifications={[fixture()]} initialUnreadCount={1} />
    );
    expect(html).toContain('data-slot="popover-trigger"');
    expect(html).not.toContain('data-slot="sheet-trigger"');
    expect(html).toContain('aria-label="Open notifications"');
  });

  it("uses the sheet trigger on phones instead of the popover", () => {
    mockIsPhone = true;
    const html = renderToStaticMarkup(
      <NotificationPanel initialNotifications={[fixture()]} initialUnreadCount={1} />
    );
    expect(html).toContain('data-slot="sheet-trigger"');
    expect(html).not.toContain('data-slot="popover-trigger"');
    expect(html).toContain('aria-label="Open notifications"');
  });

  it("keeps the 44px phone trigger in both containers", () => {
    for (const phone of [false, true]) {
      mockIsPhone = phone;
      const html = renderToStaticMarkup(
        <NotificationPanel initialNotifications={[]} initialUnreadCount={0} />
      );
      expect(html).toContain("h-11 w-11");
    }
  });

  it("shows the unread badge on the trigger in both containers", () => {
    for (const phone of [false, true]) {
      mockIsPhone = phone;
      const html = renderToStaticMarkup(
        <NotificationPanel initialNotifications={[fixture()]} initialUnreadCount={3} />
      );
      expect(html).toContain(">3<");
    }
  });
});
