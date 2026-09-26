import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Sidebar } from "../sidebar";
import { ADMIN_NAV, getAccountNav, getPrimaryNav } from "../nav-items";

// The sidebar hand-writes the Account and Admin blocks as literal JSX (the
// nesting under /settings and the Admin pill badge aren't expressible as a
// flat array map — see task-3 fix round 1). This file is the drift guard:
// it renders the real Sidebar and asserts every href/label the shared
// nav-items module declares actually appears in the markup, and that no
// trainer-only entry leaks into the client sidebar. Assertions loop over the
// module's arrays rather than hardcoding strings, so adding an entry to
// nav-items.ts without updating the sidebar JSX fails this test.

let mockPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => null,
}));

describe("Sidebar / nav-items parity", () => {
  it("renders every trainer primary nav, account nav and admin entry from the shared module", () => {
    // "/settings" satisfies the Organization/Audit Log nesting condition
    // (pathname.startsWith("/settings") && !startsWith("/settings/billing")),
    // so this single render covers every trainer entry in one pass.
    mockPathname = "/settings";
    const html = renderToStaticMarkup(
      <Sidebar
        role="TRAINER"
        currentPath="/settings"
        unreadMessageCount={0}
        userName="Yahya Shah"
        userEmail="yahya@useathos.ai"
        isAdmin
      />
    );

    for (const item of [...getPrimaryNav("TRAINER"), ...getAccountNav("TRAINER"), ADMIN_NAV]) {
      expect(html).toContain(`href="${item.href}"`);
      expect(html).toContain(item.label);
    }
  });

  it("renders every client primary nav and account nav entry, and leaks no trainer-only href", () => {
    // "/settings" reveals the settings sub-nav (Notifications), which is
    // visible to both roles on settings pages only.
    mockPathname = "/settings";
    const html = renderToStaticMarkup(
      <Sidebar
        role="CLIENT"
        currentPath="/settings"
        unreadMessageCount={0}
        userName="Jane Client"
        userEmail="jane@example.com"
      />
    );

    for (const item of [...getPrimaryNav("CLIENT"), ...getAccountNav("CLIENT")]) {
      expect(html).toContain(`href="${item.href}"`);
      expect(html).toContain(item.label);
    }

    for (const item of getAccountNav("TRAINER")) {
      const sharedWithClient = getAccountNav("CLIENT").some((c) => c.href === item.href);
      if (sharedWithClient) continue;
      expect(html).not.toContain(`href="${item.href}"`);
    }
    for (const item of getPrimaryNav("TRAINER")) {
      const sharedWithClient = getPrimaryNav("CLIENT").some((c) => c.href === item.href);
      if (sharedWithClient) continue;
      expect(html).not.toContain(`href="${item.href}"`);
    }
    expect(html).not.toContain(`href="${ADMIN_NAV.href}"`);
  });
});
