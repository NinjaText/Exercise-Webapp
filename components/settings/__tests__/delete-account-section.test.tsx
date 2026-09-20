import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("@/actions/account-actions", () => ({ deleteOwnAccountAction: vi.fn() }));

import { DeleteAccountSection, finishAccountDeletion } from "../delete-account-section";

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

describe("finishAccountDeletion", () => {
  // Deletion has already succeeded server-side by the time this runs, so it
  // must always navigate away — regardless of how signOut behaves.
  const TIMEOUT_MS = 20;

  it("navigates when signOut resolves", async () => {
    const navigate = vi.fn();
    await finishAccountDeletion({
      signOut: () => Promise.resolve(),
      navigate,
      timeoutMs: TIMEOUT_MS,
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("navigates when signOut rejects", async () => {
    const navigate = vi.fn();
    await finishAccountDeletion({
      signOut: () => Promise.reject(new Error("clerk unreachable")),
      navigate,
      timeoutMs: TIMEOUT_MS,
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("navigates when signOut never settles", async () => {
    const navigate = vi.fn();
    await finishAccountDeletion({
      signOut: () => new Promise(() => {}),
      navigate,
      timeoutMs: TIMEOUT_MS,
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
