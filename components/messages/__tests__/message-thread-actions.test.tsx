import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/actions/message-actions", () => ({
  sendMessageAction: vi.fn(),
  markMessagesReadAction: vi.fn(),
  editMessageAction: vi.fn(),
  deleteMessageAction: vi.fn(),
}));
vi.mock("@/lib/pusher-client", () => ({ getPusherClient: () => null }));
vi.mock("../voice-message-recorder", () => ({ VoiceMessageRecorder: () => null }));

import { MessageThread } from "../message-thread";

const items = [
  {
    kind: "message" as const,
    id: "m1",
    senderId: "me",
    content: "Hello",
    createdAt: new Date("2026-09-20T10:00:00.000Z"),
    isRead: false,
    sender: { firstName: "Tess", lastName: "Trainer", imageUrl: null },
  },
];

function classesOf(tag: string) {
  return (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

describe("MessageThread own-message actions trigger", () => {
  it("renders as an icon-xs Button with a 44px coarse hit area and keeps the hover reveal", () => {
    const html = renderToStaticMarkup(
      <MessageThread items={items} currentUserId="me" recipientId="c1" recipientName="Ada" />
    );
    const tag = (html.match(/<button[^>]*>/g) ?? []).find((t) => t.includes('aria-label="Message actions"'));
    expect(tag).toBeTruthy();
    const classes = classesOf(tag!);
    expect(classes).toEqual(
      expect.arrayContaining([
        "size-7",
        "relative",
        "after:absolute",
        "pointer-coarse:after:-inset-2",
        "pointer-fine:opacity-0",
        "pointer-fine:group-hover:opacity-100",
        "pointer-fine:focus-visible:opacity-100",
      ])
    );
    expect(html).toMatch(/<svg[^>]*class="[^"]*lucide-ellipsis-vertical[^"]*size-3\.5/);
  });
});
