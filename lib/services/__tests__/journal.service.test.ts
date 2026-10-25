import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    journalEntry: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  createJournalEntry,
  deletePrivateEntry,
  listSharedEntriesForTrainer,
  updatePrivateEntry,
} from "../journal.service";

const mockCreate = vi.mocked(prisma.journalEntry.create);
const mockFindMany = vi.mocked(prisma.journalEntry.findMany);
const mockUpdateMany = vi.mocked(prisma.journalEntry.updateMany);
const mockDeleteMany = vi.mocked(prisma.journalEntry.deleteMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listSharedEntriesForTrainer — private entries never reach a trainer", () => {
  it("queries SHARED entries for this trainer only", async () => {
    mockFindMany.mockResolvedValue([] as never);

    await listSharedEntriesForTrainer("trainer_1", { clientId: "client_1" });

    const args = mockFindMany.mock.calls[0][0]!;
    expect(args.where).toEqual({ trainerId: "trainer_1", visibility: "SHARED", clientId: "client_1" });
  });

  it("drops any PRIVATE row even if the query returned one", async () => {
    mockFindMany.mockResolvedValue([
      { id: "e1", clientId: "c1", visibility: "SHARED", body: "shared" },
      { id: "e2", clientId: "c1", visibility: "PRIVATE", body: "secret" },
    ] as never);

    const rows = await listSharedEntriesForTrainer("trainer_1");

    expect(rows.map((r) => r.id)).toEqual(["e1"]);
    expect(rows.some((r) => r.body === "secret")).toBe(false);
  });
});

describe("createJournalEntry", () => {
  it("never stores a trainer on a PRIVATE entry", async () => {
    mockCreate.mockResolvedValue({ id: "e1" } as never);

    await createJournalEntry({
      clientId: "client_1",
      body: "hello",
      visibility: "PRIVATE",
      entryDate: new Date("2026-10-22T15:30:00Z"),
      trainerId: "trainer_1",
    });

    const data = mockCreate.mock.calls[0][0].data;
    expect(data.trainerId).toBeNull();
    expect(data.visibility).toBe("PRIVATE");
    expect(data.entryDate).toEqual(new Date("2026-10-22T00:00:00Z"));
  });

  it("requires a trainer for a SHARED entry", async () => {
    await expect(
      createJournalEntry({ clientId: "client_1", body: "hi", visibility: "SHARED", entryDate: new Date() })
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("snapshots the prompt", async () => {
    mockCreate.mockResolvedValue({ id: "e1" } as never);

    await createJournalEntry({
      clientId: "client_1",
      body: "answer",
      visibility: "SHARED",
      entryDate: new Date(),
      trainerId: "trainer_1",
      prompt: { reflectionId: "r1", text: "What went well?", author: null, kind: "QUESTION" },
    });

    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      trainerId: "trainer_1",
      reflectionId: "r1",
      promptText: "What went well?",
      promptKind: "QUESTION",
    });
  });
});

describe("client edits", () => {
  it("only updates the client's own PRIVATE entry", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 } as never);

    await updatePrivateEntry("client_1", "e1", "new body");

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "e1", clientId: "client_1", visibility: "PRIVATE" },
      data: { body: "new body" },
    });
  });

  it("only deletes the client's own PRIVATE entry", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 } as never);

    const result = await deletePrivateEntry("client_1", "e1");

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "e1", clientId: "client_1", visibility: "PRIVATE" } });
    expect(result.count).toBe(0);
  });
});
