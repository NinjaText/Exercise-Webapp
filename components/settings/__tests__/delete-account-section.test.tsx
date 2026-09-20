import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("@/actions/account-actions", () => ({ deleteOwnAccountAction: vi.fn() }));

import { DeleteAccountSection } from "../delete-account-section";

describe("DeleteAccountSection", () => {
  it("renders the danger zone with a delete button and closed dialog", () => {
    const html = renderToStaticMarkup(<DeleteAccountSection role="CLIENT" />);
    expect(html).toContain("Delete account");
    expect(html).toContain("Delete my account");
    expect(html).not.toContain("Type DELETE");
  });

  it("warns trainers about active clients", () => {
    const html = renderToStaticMarkup(<DeleteAccountSection role="TRAINER" />);
    expect(html).toMatch(/active clients/i);
  });
});
