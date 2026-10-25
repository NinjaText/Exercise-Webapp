import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/auth/active-user", () => ({ activeCallerOnly: vi.fn(async (user: unknown) => user) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));
vi.mock("@/lib/services/client.service", () => ({ getTrainerForClient: vi.fn() }));
vi.mock("@/lib/services/context-message.service", () => ({ sendContextMessageToTrainer: vi.fn() }));
vi.mock("@/lib/services/reflection.service", () => ({ findReflectionForDay: vi.fn() }));
vi.mock("@/lib/reflections/todays-reflection-card-data", () => ({ getTodaysReflectionCardData: vi.fn() }));
vi.mock("@/lib/services/audit-log.service", () => ({
  logUserAudit: vi.fn(),
  AUDIT_ACTIONS: { REFLECTION_SHARED: "REFLECTION_SHARED" },
}));
vi.mock("@/lib/services/journal.service", () => ({
  createJournalEntry: vi.fn(),
  attachMessage: vi.fn(),
  discardEntry: vi.fn(),
  updatePrivateEntry: vi.fn(),
  deletePrivateEntry: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getTrainerForClient } from "@/lib/services/client.service";
import { sendContextMessageToTrainer } from "@/lib/services/context-message.service";
import { findReflectionForDay } from "@/lib/services/reflection.service";
import { getTodaysReflectionCardData } from "@/lib/reflections/todays-reflection-card-data";
import { logUserAudit } from "@/lib/services/audit-log.service";
import * as journalService from "@/lib/services/journal.service";
import {
  getTodaysReflectionCardAction,
  createJournalEntryAction,
  saveTodaysReflectionEntryAction,
  updateJournalEntryAction,
} from "../journal-actions";

const client = { id: "client_1", clerkId: "clerk_c", role: "CLIENT", firstName: "Cara", lastName: "Lee", email: "c@x.com", clerkOrgId: "org" };
const trainerUser = { ...client, id: "trainer_1", clerkId: "clerk_t", role: "TRAINER" };
const REFLECTION_ID = "a".repeat(24);
/** The tests run against the real clock: "today" is whatever the server's UTC day is. */
const TODAY_KEY = new Date().toISOString().slice(0, 10);
const TODAY = new Date(`${TODAY_KEY}T00:00:00.000Z`);
const ref = { dateKey: TODAY_KEY, reflectionId: REFLECTION_ID, libraryId: null };

const reflection = {
  reflectionId: REFLECTION_ID,
  libraryId: null,
  origin: "SCHEDULED",
  kind: "QUESTION",
  text: "What went well today?",
  author: null,
  guidance: null,
  theme: null,
  imageUrl: null,
  allowJournal: true,
  allowShare: true,
  date: TODAY,
};

function signInAs(user: typeof client) {
  vi.mocked(auth).mockResolvedValue({ userId: user.clerkId } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  signInAs(client);
  vi.mocked(findReflectionForDay).mockResolvedValue(reflection as never);
  vi.mocked(getCapabilitiesForUser).mockResolvedValue({ messaging: true } as never);
  vi.mocked(getTrainerForClient).mockResolvedValue({ id: "trainer_1" } as never);
  vi.mocked(journalService.createJournalEntry).mockResolvedValue({ id: "entry_1" } as never);
  vi.mocked(sendContextMessageToTrainer).mockResolvedValue({ id: "msg_1" } as never);
});

describe("saveTodaysReflectionEntryAction — private journal", () => {
  it("saves a PRIVATE entry with the server-resolved prompt and sends nothing to the trainer", async () => {
    const result = await saveTodaysReflectionEntryAction({ body: "Felt strong", visibility: "PRIVATE", ...ref });

    expect(result).toEqual({ success: true, data: { id: "entry_1", visibility: "PRIVATE" } });
    expect(vi.mocked(journalService.createJournalEntry).mock.calls[0][0]).toMatchObject({
      clientId: "client_1",
      visibility: "PRIVATE",
      entryDate: TODAY,
      prompt: { reflectionId: REFLECTION_ID, text: "What went well today?" },
    });
    expect(vi.mocked(journalService.createJournalEntry).mock.calls[0][0].trainerId).toBeUndefined();
    expect(sendContextMessageToTrainer).not.toHaveBeenCalled();
    expect(logUserAudit).not.toHaveBeenCalled();
  });

  it("refuses when the reflection disallows journaling", async () => {
    vi.mocked(findReflectionForDay).mockResolvedValue({ ...reflection, allowJournal: false } as never);

    const result = await saveTodaysReflectionEntryAction({ body: "x", visibility: "PRIVATE", ...ref });

    expect(result.success).toBe(false);
    expect(journalService.createJournalEntry).not.toHaveBeenCalled();
  });

  it("rejects trainers", async () => {
    signInAs(trainerUser);

    const result = await saveTodaysReflectionEntryAction({ body: "x", visibility: "PRIVATE", ...ref });

    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("rejects an empty body", async () => {
    const result = await saveTodaysReflectionEntryAction({ body: "   ", visibility: "PRIVATE", ...ref });

    expect(result.success).toBe(false);
  });
});

describe("saveTodaysReflectionEntryAction — which reflection and which day", () => {
  it("snapshots the reflection the card showed, for the client's day", async () => {
    await saveTodaysReflectionEntryAction({ body: "x", visibility: "PRIVATE", ...ref });

    expect(findReflectionForDay).toHaveBeenCalledWith("client_1", TODAY, { reflectionId: REFLECTION_ID, libraryId: null });
  });

  it("refuses a reflection that isn't this client's for that day", async () => {
    vi.mocked(findReflectionForDay).mockResolvedValue(null);

    const result = await saveTodaysReflectionEntryAction({ body: "x", visibility: "PRIVATE", ...ref });

    expect(result.success).toBe(false);
    expect(journalService.createJournalEntry).not.toHaveBeenCalled();
  });

  it("refuses a day key more than one day from the server's date", async () => {
    const result = await saveTodaysReflectionEntryAction({ body: "x", visibility: "PRIVATE", ...ref, dateKey: "2020-01-01" });

    expect(result).toEqual({ success: false, error: "Invalid date" });
    expect(findReflectionForDay).not.toHaveBeenCalled();
  });

  it("needs exactly one reflection reference", async () => {
    const result = await saveTodaysReflectionEntryAction({ body: "x", visibility: "PRIVATE", dateKey: TODAY_KEY, reflectionId: null, libraryId: null });

    expect(result.success).toBe(false);
  });
});

describe("getTodaysReflectionCardAction", () => {
  it("loads the card for the client's local day", async () => {
    vi.mocked(getTodaysReflectionCardData).mockResolvedValue({ dateKey: TODAY_KEY } as never);

    const result = await getTodaysReflectionCardAction({ dateKey: TODAY_KEY });

    expect(result.success).toBe(true);
    expect(vi.mocked(getTodaysReflectionCardData).mock.calls[0][1]).toEqual({ messaging: true, day: TODAY });
  });
});

describe("saveTodaysReflectionEntryAction — share with trainer", () => {
  it("saves a SHARED entry, sends a REFLECTION context message and links them", async () => {
    const result = await saveTodaysReflectionEntryAction({ body: "Sleep helped", visibility: "SHARED", ...ref });

    expect(result).toEqual({ success: true, data: { id: "entry_1", visibility: "SHARED" } });
    expect(sendContextMessageToTrainer).toHaveBeenCalledWith({
      client,
      trainerId: "trainer_1",
      content: "Sleep helped",
      context: { kind: "REFLECTION", refId: "entry_1", title: "Today's reflection", excerpt: "What went well today?" },
    });
    expect(journalService.attachMessage).toHaveBeenCalledWith("entry_1", "msg_1");
    expect(logUserAudit).toHaveBeenCalledTimes(1);
  });

  it("refuses when the client has no messaging capability", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue({ messaging: false } as never);

    const result = await saveTodaysReflectionEntryAction({ body: "x", visibility: "SHARED", ...ref });

    expect(result.success).toBe(false);
    expect(journalService.createJournalEntry).not.toHaveBeenCalled();
  });

  it("refuses when the reflection disallows sharing", async () => {
    vi.mocked(findReflectionForDay).mockResolvedValue({ ...reflection, allowShare: false } as never);

    const result = await saveTodaysReflectionEntryAction({ body: "x", visibility: "SHARED", ...ref });

    expect(result.success).toBe(false);
    expect(sendContextMessageToTrainer).not.toHaveBeenCalled();
  });

  it("refuses when there is no trainer", async () => {
    vi.mocked(getTrainerForClient).mockResolvedValue(null);

    const result = await saveTodaysReflectionEntryAction({ body: "x", visibility: "SHARED", ...ref });

    expect(result.success).toBe(false);
    expect(journalService.createJournalEntry).not.toHaveBeenCalled();
  });

  it("removes the entry again when the message can't be sent", async () => {
    vi.mocked(sendContextMessageToTrainer).mockRejectedValue(new Error("pusher down"));
    vi.mocked(journalService.discardEntry).mockResolvedValue(undefined);

    const result = await saveTodaysReflectionEntryAction({ body: "x", visibility: "SHARED", ...ref });

    expect(result.success).toBe(false);
    expect(journalService.discardEntry).toHaveBeenCalledWith("entry_1");
    expect(journalService.attachMessage).not.toHaveBeenCalled();
  });

  it("reports success once delivered, even if linking the message fails (no duplicate on retry)", async () => {
    vi.mocked(journalService.attachMessage).mockRejectedValue(new Error("db blip"));

    const result = await saveTodaysReflectionEntryAction({ body: "x", visibility: "SHARED", ...ref });

    expect(result).toEqual({ success: true, data: { id: "entry_1", visibility: "SHARED" } });
    expect(journalService.discardEntry).not.toHaveBeenCalled();
  });
});

describe("free-form journal", () => {
  it("always creates PRIVATE entries", async () => {
    const result = await createJournalEntryAction({ body: "Just a note" });

    expect(result.success).toBe(true);
    expect(vi.mocked(journalService.createJournalEntry).mock.calls[0][0]).toMatchObject({ visibility: "PRIVATE", clientId: "client_1" });
  });

  it("reports not found when the entry isn't an own private entry (e.g. already shared)", async () => {
    vi.mocked(journalService.updatePrivateEntry).mockResolvedValue({ count: 0 });

    const result = await updateJournalEntryAction({ id: "f".repeat(24), body: "edit" });

    expect(result).toEqual({ success: false, error: "Entry not found" });
  });
});
