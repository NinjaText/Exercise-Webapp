import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Sidebar } from "../sidebar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { DEFAULT_BRANDING } from "@/lib/branding/resolve";
import { toViewModel } from "@/lib/branding/types";

let mockPathname = "/clients/abc";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => null,
}));

const UNBRANDED = toViewModel(DEFAULT_BRANDING);

function renderTrainer(over: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return renderToStaticMarkup(
    <Sidebar
      branding={UNBRANDED}
      role="TRAINER"
      currentPath=""
      unreadMessageCount={0}
      userName="Yahya Shah"
      userEmail="yahya@useathos.ai"
      {...over}
    />
  );
}

/** The opening tag of the <a> for `href`. */
function anchor(html: string, href: string) {
  return html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0] ?? "";
}

describe("Sidebar shell (spec §2.2)", () => {
  it("renders group labels and 32px rows", () => {
    mockPathname = "/dashboard";
    const html = renderTrainer({ isAdmin: true });
    expect(html).toContain(">Navigation<");
    expect(html).toContain(">Account<");
    expect(html).toContain(">Admin<");
    expect(anchor(html, "/clients")).toContain("h-8");
  });

  it("marks the most specific match active with a pill and no edge marker", () => {
    mockPathname = "/clients/abc";
    const html = renderTrainer();
    const active = anchor(html, "/clients");
    expect(active).toContain('aria-current="page"');
    expect(active).toContain("bg-sidebar-accent");
    expect(active).not.toContain("before:");
    expect(anchor(html, "/dashboard")).not.toContain('aria-current="page"');
  });

  it("shows the unread badge on Inbox, capped at 99+, and nothing at zero", () => {
    mockPathname = "/dashboard";
    expect(renderTrainer({ unreadMessageCount: 4 })).toContain(">4<");
    expect(renderTrainer({ unreadMessageCount: 150 })).toContain(">99+<");
    expect(renderTrainer({ unreadMessageCount: 0 })).not.toContain('data-slot="badge"');
  });

  it("drops hidden hrefs (club capabilities)", () => {
    mockPathname = "/dashboard";
    const html = renderTrainer({ hiddenHrefs: ["/nutrition", "/settings/billing"] });
    expect(html).not.toContain('href="/nutrition"');
    expect(html).not.toContain('href="/settings/billing"');
    expect(html).toContain('href="/clients"');
  });

  it("drawer variant is a full-height flex column; desktop variant is hidden below lg", () => {
    mockPathname = "/dashboard";
    const drawer = renderTrainer({ mobileMode: true }).match(/<aside[^>]*>/)?.[0] ?? "";
    expect(drawer).toContain("flex h-full");
    expect(drawer).not.toContain("hidden");
    const desktop = renderTrainer().match(/<aside[^>]*>/)?.[0] ?? "";
    expect(desktop).toContain("hidden");
    expect(desktop).toContain("lg:flex");
  });

  it("shows the user block at the bottom", () => {
    mockPathname = "/dashboard";
    const html = renderTrainer();
    expect(html).toContain("Yahya Shah");
    expect(html).toContain("yahya@useathos.ai");
  });
});

describe("AdminSidebar shell", () => {
  it("keeps the Super Admin identity and uses the shared rows", () => {
    mockPathname = "/admin/users/123";
    const html = renderToStaticMarkup(<AdminSidebar userName="Admin" userEmail="a@b.c" />);
    expect(html).toContain("Super Admin");
    expect(html).toContain(">Administration<");
    expect(anchor(html, "/admin/users")).toContain('aria-current="page"');
    // Overview is exact-match only.
    expect(anchor(html, "/admin")).not.toContain('aria-current="page"');
    expect(anchor(html, "/dashboard")).toContain("h-8");
  });

  it("drawer variant is a full-height flex column", () => {
    mockPathname = "/admin";
    const html = renderToStaticMarkup(<AdminSidebar userName="Admin" userEmail="a@b.c" mobileMode />);
    expect(html.match(/<aside[^>]*>/)?.[0]).toContain("flex h-full");
    expect(anchor(html, "/admin")).toContain('aria-current="page"');
  });
});
