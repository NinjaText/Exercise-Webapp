import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/clients/abc123" }));

import { MobileTabBar } from "../mobile-tab-bar";

describe("MobileTabBar", () => {
  it("renders five client tabs and no More button", () => {
    const html = renderToStaticMarkup(<MobileTabBar role="CLIENT" unreadMessageCount={0} />);
    expect(html).toContain('data-slot="mobile-tab-bar"');
    for (const href of ["/dashboard", "/programs", "/calendar", "/nutrition", "/messages"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain(">Programs<");
    expect(html).not.toContain(">More<");
  });

  it("renders four trainer tabs plus More, and marks Clients active on a nested path", () => {
    const html = renderToStaticMarkup(<MobileTabBar role="TRAINER" unreadMessageCount={0} />);
    expect(html).toContain(">More<");
    // React emits attributes in JSX source order (aria-current before href here),
    // so assert the two facts independently rather than in one ordered regex.
    const clientsAnchor = html.match(/<a[^>]*href="\/clients"[^>]*>/)?.[0];
    expect(clientsAnchor).toContain('href="/clients"');
    expect(clientsAnchor).toContain('aria-current="page"');
    expect(html).not.toContain('href="/exercises"'); // lives in the closed More sheet
  });

  it("shows the unread badge on Inbox, capped at 99+", () => {
    expect(renderToStaticMarkup(<MobileTabBar role="CLIENT" unreadMessageCount={3} />)).toContain(">3<");
    expect(renderToStaticMarkup(<MobileTabBar role="CLIENT" unreadMessageCount={250} />)).toContain(">99+<");
  });
});
