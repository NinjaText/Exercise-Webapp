import { describe, it, expect, vi } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/actions/message-actions", () => ({
  sendMessageAction: vi.fn(),
  markMessagesReadAction: vi.fn(),
  editMessageAction: vi.fn(),
  deleteMessageAction: vi.fn(),
}));
vi.mock("@/lib/pusher-client", () => ({ getPusherClient: () => null }));
vi.mock("server-only", () => ({}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { MessageThread } from "../message-thread";

describe("MessageThread composer", () => {
  it("makes the mic and send buttons 44px below sm and 32px from sm", () => {
    const html = renderToStaticMarkup(
      <MessageThread items={[]} currentUserId="u1" recipientId="u2" recipientName="Sam" />
    );
    for (const label of ["Record a voice note", "Send message"]) {
      const tag = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";
      expect(tag, label).toMatch(/class="[^"]*\bsize-11\b/);
      expect(tag, label).toMatch(/class="[^"]*\bsm:size-8\b/);
    }
  });
});
