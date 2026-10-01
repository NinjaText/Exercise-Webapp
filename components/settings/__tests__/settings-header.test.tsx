import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let mockPathname = "/settings";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

import { SettingsHeader } from "../settings-header";
import { getSettingsTabs } from "../settings-tabs";

const TRAINER_ONLY = ["/settings/clinic", "/settings/branding", "/settings/billing", "/settings/audit-log"];

function anchorFor(html: string, href: string) {
  return html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0];
}

beforeEach(() => {
  mockPathname = "/settings";
});

describe("getSettingsTabs", () => {
  it("gives trainers every section, in order", () => {
    expect(getSettingsTabs("TRAINER").map((t) => t.label)).toEqual([
      "Account", "Notifications", "Organization", "Branding", "Billing", "Audit log",
    ]);
  });

  it("gives clients only account and notifications", () => {
    expect(getSettingsTabs("CLIENT").map((t) => t.href)).toEqual(["/settings", "/settings/notifications"]);
  });
});

describe("getSettingsTabs hidden", () => {
  it("drops the Billing tab when billing is hidden (club trainer)", () => {
    const hrefs = getSettingsTabs("TRAINER", ["/settings/billing"]).map((t) => t.href);
    expect(hrefs).not.toContain("/settings/billing");
    expect(hrefs).toContain("/settings/branding");
  });
});

describe("SettingsHeader", () => {
  it("renders a tab link for each of the trainer's sections", () => {
    const html = renderToStaticMarkup(<SettingsHeader role="TRAINER" />);
    for (const tab of getSettingsTabs("TRAINER")) expect(html).toContain(`href="${tab.href}"`);
  });

  it("never shows trainer-only tabs to clients", () => {
    const html = renderToStaticMarkup(<SettingsHeader role="CLIENT" />);
    for (const href of TRAINER_ONLY) expect(html).not.toContain(`href="${href}"`);
  });

  it("marks only the most specific tab active, so Account isn't lit on a sub-page", () => {
    mockPathname = "/settings/branding";
    const html = renderToStaticMarkup(<SettingsHeader role="TRAINER" />);
    expect(anchorFor(html, "/settings/branding")).toContain('aria-current="page"');
    expect(anchorFor(html, "/settings")).not.toContain("aria-current");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("keeps the parent tab active on deeper paths", () => {
    mockPathname = "/settings/audit-log/some-entry";
    const html = renderToStaticMarkup(<SettingsHeader role="TRAINER" />);
    expect(anchorFor(html, "/settings/audit-log")).toContain('aria-current="page"');
  });
});
