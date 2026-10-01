import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const cookieStore = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
  headers: vi.fn(async () => new Map([["x-forwarded-for", "1.2.3.4, 10.0.0.1"]])),
}));
vi.mock("@/lib/services/club.service", () => ({ getClubBySlug: vi.fn() }));
vi.mock("@/lib/services/club-trainer.service", () => ({
  getClubTrainer: vi.fn(),
  CLUB_NOT_OPEN_MESSAGE: "This club isn't open yet. Please check back soon.",
}));
vi.mock("@/lib/services/join-attempt.service", () => ({
  isJoinRateLimited: vi.fn(async () => false),
  recordFailedJoinAttempt: vi.fn(),
}));

import { getClubBySlug } from "@/lib/services/club.service";
import { getClubTrainer } from "@/lib/services/club-trainer.service";
import { isJoinRateLimited, recordFailedJoinAttempt } from "@/lib/services/join-attempt.service";
import { verifyJoinCodeAction } from "../club-join-actions";

beforeAll(() => { process.env.CLERK_SECRET_KEY = "test-clerk-secret-key-minimum-20-chars"; });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClubBySlug).mockResolvedValue({ clerkOrgId: "org_club", joinCode: "PINE24" } as any);
  vi.mocked(getClubTrainer).mockResolvedValue({ id: "t1" } as any);
  vi.mocked(isJoinRateLimited).mockResolvedValue(false);
});

const GENERIC = "That code didn't work. Check with your club and try again.";

describe("verifyJoinCodeAction", () => {
  it("sets the join cookie on the right code", async () => {
    expect(await verifyJoinCodeAction("pine", " pine24 ")).toEqual({ ok: true });
    expect(cookieStore.set).toHaveBeenCalledWith("club_join", expect.stringMatching(/^org_club\./),
      expect.objectContaining({ httpOnly: true, sameSite: "lax", maxAge: 1800 }));
  });
  it("records a failure and returns a generic error on the wrong code", async () => {
    expect(await verifyJoinCodeAction("pine", "nope")).toEqual({ ok: false, error: GENERIC });
    expect(recordFailedJoinAttempt).toHaveBeenCalledWith("1.2.3.4:pine");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
  it("rate-limits by normalised slug so changing its case doesn't reset the counter", async () => {
    await verifyJoinCodeAction(" PiNe ", "nope");
    expect(isJoinRateLimited).toHaveBeenCalledWith("1.2.3.4:pine");
    expect(recordFailedJoinAttempt).toHaveBeenCalledWith("1.2.3.4:pine");
  });
  it("gives the same generic error for an unknown club", async () => {
    vi.mocked(getClubBySlug).mockResolvedValue(null);
    expect(await verifyJoinCodeAction("ghost", "PINE24")).toEqual({ ok: false, error: GENERIC });
  });
  it("refuses even the right code when rate limited", async () => {
    vi.mocked(isJoinRateLimited).mockResolvedValue(true);
    const res = await verifyJoinCodeAction("pine", "PINE24");
    expect(res.ok).toBe(false);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
  it("refuses the right code while the club has no trainer", async () => {
    vi.mocked(getClubTrainer).mockResolvedValue(null);
    expect(await verifyJoinCodeAction("pine", "PINE24")).toEqual({
      ok: false,
      error: "This club isn't open yet. Please check back soon.",
    });
    expect(getClubTrainer).toHaveBeenCalledWith("org_club");
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(recordFailedJoinAttempt).not.toHaveBeenCalled();
  });
  it("does not reveal a closed club to a wrong code", async () => {
    vi.mocked(getClubTrainer).mockResolvedValue(null);
    expect(await verifyJoinCodeAction("pine", "nope")).toEqual({ ok: false, error: GENERIC });
  });
});
