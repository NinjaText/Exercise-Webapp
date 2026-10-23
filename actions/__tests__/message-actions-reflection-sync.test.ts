import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/org-capabilities.server", () => ({
  getCapabilitiesForUser: vi.fn(),
  canCoachInteract: vi.fn(),
  filterCoachableClientIds: vi.fn(),
}));
vi.mock("@/lib/services/message.service", () => ({ editMessage: vi.fn(), deleteMessage: vi.fn() }));
vi.mock("@/lib/services/client.service", () => ({ getClientIdsForTrainer: vi.fn() }));
vi.mock("@/lib/clubs/acting-admin-for", () => ({ getActingAdminFor: vi.fn(async () => null) }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/active-user", () => ({ activeCallerOnly: vi.fn(async (user: unknown) => user) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, journalEntry: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/pusher", () => ({ pusherServer: { trigger: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/notification.service", () => ({ notifyUser: vi.fn(), NOTIFICATION_TYPES: {} }));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import * as messageService from "@/lib/services/message.service";
import { deleteMessageAction, editMessageAction } from "../message-actions";

const client = { id: "client_1", clerkId: "clerk_c", role: "CLIENT" };
const ENTRY_ID = "e".repeat(24);

const sharedMessage = {
  id: "msg_1",
  senderId: "client_1",
  recipientId: "trainer_1",
  content: "Old text",
  contextKind: "REFLECTION",
  contextRefId: ENTRY_ID,
  deletedAt: new Date(),
  editedAt: new Date(),
  sender: { firstName: "C", lastName: "L", imageUrl: null },
  recipient: { firstName: "T", lastName: "R", imageUrl: null },
};

const mockJournalUpdateMany = vi.mocked(prisma.journalEntry.updateMany);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "clerk_c" } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(client as never);
  mockJournalUpdateMany.mockResolvedValue({ count: 1 } as never);
});

describe("deleting a shared reflection message", () => {
  it("withdraws the journal entry from the trainer (back to PRIVATE, client keeps it)", async () => {
    vi.mocked(messageService.deleteMessage).mockResolvedValue(sharedMessage as never);

    const result = await deleteMessageAction("msg_1");

    expect(result.success).toBe(true);
    expect(mockJournalUpdateMany).toHaveBeenCalledWith({
      where: { clientId: "client_1", visibility: "SHARED", OR: [{ id: ENTRY_ID }, { messageId: "msg_1" }] },
      data: { visibility: "PRIVATE", trainerId: null, messageId: null },
    });
  });

  it("fails (so the client retries) when the entry can't be withdrawn", async () => {
    vi.mocked(messageService.deleteMessage).mockResolvedValue(sharedMessage as never);
    mockJournalUpdateMany.mockRejectedValue(new Error("db down"));

    const result = await deleteMessageAction("msg_1");

    expect(result.success).toBe(false);
  });

  it("leaves journal entries alone for ordinary messages", async () => {
    vi.mocked(messageService.deleteMessage).mockResolvedValue({ ...sharedMessage, contextKind: null, contextRefId: null } as never);

    await deleteMessageAction("msg_1");

    expect(mockJournalUpdateMany).not.toHaveBeenCalled();
  });
});

describe("editing a shared reflection message", () => {
  it("mirrors the new text into the shared journal entry", async () => {
    vi.mocked(messageService.editMessage).mockResolvedValue({ ...sharedMessage, content: "New text" } as never);

    const result = await editMessageAction("msg_1", "New text");

    expect(result.success).toBe(true);
    expect(mockJournalUpdateMany).toHaveBeenCalledWith({
      where: { clientId: "client_1", visibility: "SHARED", OR: [{ id: ENTRY_ID }, { messageId: "msg_1" }] },
      data: { body: "New text" },
    });
  });
});
