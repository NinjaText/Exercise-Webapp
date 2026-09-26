import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/actions/notification-preference-actions", () => ({ updateMyPreferenceAction: vi.fn() }));

import { NotificationPreferencesForm } from "../notification-preferences-form";

const initial = {
  emailEnabled: true,
  pushEnabled: true,
  sessions: true,
  messages: true,
  nutrition: true,
  billing: true,
};

/** The opening tag of the element with this id (the Switch's hidden checkbox input). */
function tagWithId(html: string, id: string): string {
  const match = new RegExp(`<[^>]*id="${id}"[^>]*>`).exec(html);
  if (!match) throw new Error(`no element with id ${id}`);
  return match[0];
}

describe("NotificationPreferencesForm", () => {
  it("renders a push switch with its helper text above the category switches", () => {
    const html = renderToStaticMarkup(<NotificationPreferencesForm initial={initial} />);
    expect(html).toContain("Push notifications");
    expect(html).toContain("Applies to all your devices. Category switches below apply to email and push.");
    expect(tagWithId(html, "pushEnabled")).toMatch(/\schecked=""/);
    expect(html.indexOf('id="pushEnabled"')).toBeLessThan(html.indexOf('id="sessions"'));
  });

  it("reflects a stored push opt-out", () => {
    const html = renderToStaticMarkup(<NotificationPreferencesForm initial={{ ...initial, pushEnabled: false }} />);
    expect(tagWithId(html, "pushEnabled")).not.toMatch(/\schecked=""/);
  });

  it("keeps the category switches usable while push is on, even with email off", () => {
    const html = renderToStaticMarkup(<NotificationPreferencesForm initial={{ ...initial, emailEnabled: false }} />);
    expect(tagWithId(html, "sessions")).not.toMatch(/\sdisabled=""/);
  });

  it("disables the category switches only when both email and push are off", () => {
    const html = renderToStaticMarkup(
      <NotificationPreferencesForm initial={{ ...initial, emailEnabled: false, pushEnabled: false }} />
    );
    expect(tagWithId(html, "sessions")).toMatch(/\sdisabled=""/);
  });
});
