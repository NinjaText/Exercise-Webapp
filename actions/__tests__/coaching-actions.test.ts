import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/services/coaching.service", async () => {
  class CoachingError extends Error {
    constructor(public code: string, message?: string) {
      super(message ?? code);
    }
  }
  return {
    CoachingError,
    requestCoaching: vi.fn(),
    withdrawCoaching: vi.fn(),
    respondToCoachingRequest: vi.fn(),
    endCoaching: vi.fn(),
  };
});

import { getCurrentUser } from "@/lib/current-user";
import {
  CoachingError,
  endCoaching,
  requestCoaching,
  respondToCoachingRequest,
  withdrawCoaching,
} from "@/lib/services/coaching.service";
import {
  endCoachingAction,
  requestCoachingAction,
  respondCoachingRequestAction,
  withdrawCoachingOfferAction,
  withdrawCoachingRequestAction,
} from "../coaching-actions";

const member = { id: "u1", role: "CLIENT" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(member as any);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestCoachingAction", () => {
  it("delegates to the service as the current user", async () => {
    expect(await requestCoachingAction("help")).toEqual({ ok: true });
    expect(requestCoaching).toHaveBeenCalledWith(member, "help");
  });

  it("surfaces CoachingError messages", async () => {
    vi.mocked(requestCoaching).mockRejectedValue(new CoachingError("not_offered", "Not offered here."));
    expect(await requestCoachingAction("x")).toEqual({ ok: false, error: "Not offered here." });
  });

  it("hides unexpected errors", async () => {
    vi.mocked(requestCoaching).mockRejectedValue(new Error("db exploded"));
    const res = await requestCoachingAction("x");
    expect(res).toEqual({ ok: false, error: "Something went wrong. Please try again." });
  });
});

describe("withdrawCoachingRequestAction", () => {
  it("withdraws the current user's own row", async () => {
    expect(await withdrawCoachingRequestAction()).toEqual({ ok: true });
    expect(withdrawCoaching).toHaveBeenCalledWith(member, "u1");
  });

  it("surfaces CoachingError and hides others", async () => {
    vi.mocked(withdrawCoaching).mockRejectedValueOnce(new CoachingError("invalid_state", "Changed."));
    expect(await withdrawCoachingRequestAction()).toEqual({ ok: false, error: "Changed." });
    vi.mocked(withdrawCoaching).mockRejectedValueOnce(new Error("boom"));
    expect((await withdrawCoachingRequestAction()).ok).toBe(false);
  });
});

describe("trainer coaching actions", () => {
  const trainer = { id: "t1", role: "TRAINER", clerkOrgId: "org_club" };

  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(trainer as any);
  });

  it("respond delegates as the trainer with the optional note", async () => {
    expect(await respondCoachingRequestAction("m1", false, "not now")).toEqual({ ok: true });
    expect(respondToCoachingRequest).toHaveBeenCalledWith(trainer, "m1", false, "not now");
  });

  it("end and withdraw-offer delegate as the trainer", async () => {
    expect(await endCoachingAction("m1")).toEqual({ ok: true });
    expect(endCoaching).toHaveBeenCalledWith(trainer, "m1");
    expect(await withdrawCoachingOfferAction("m1")).toEqual({ ok: true });
    expect(withdrawCoaching).toHaveBeenCalledWith(trainer, "m1");
  });

  it("refuses a CLIENT without calling the service", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(member as any);
    for (const res of [
      await respondCoachingRequestAction("m1", true),
      await endCoachingAction("m1"),
      await withdrawCoachingOfferAction("m1"),
    ]) {
      expect(res.ok).toBe(false);
    }
    expect(respondToCoachingRequest).not.toHaveBeenCalled();
    expect(endCoaching).not.toHaveBeenCalled();
    expect(withdrawCoaching).not.toHaveBeenCalled();
  });

  it("surfaces the service's forbidden error for another org's trainer", async () => {
    vi.mocked(respondToCoachingRequest).mockRejectedValue(new CoachingError("forbidden", "You can't manage coaching for this member."));
    expect(await respondCoachingRequestAction("m1", true)).toEqual({
      ok: false,
      error: "You can't manage coaching for this member.",
    });
  });

  it("hides unexpected errors", async () => {
    vi.mocked(endCoaching).mockRejectedValue(new Error("stripe down"));
    expect(await endCoachingAction("m1")).toEqual({ ok: false, error: "Something went wrong. Please try again." });
  });
});
