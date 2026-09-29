import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { joinCodeAttempt: { count: vi.fn(), create: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { isJoinRateLimited, recordFailedJoinAttempt, JOIN_RATE_LIMIT } from "../join-attempt.service";

beforeEach(() => vi.clearAllMocks());

describe("join rate limit", () => {
  it("allows under the limit", async () => {
    vi.mocked(prisma.joinCodeAttempt.count).mockResolvedValue(JOIN_RATE_LIMIT.max - 1);
    expect(await isJoinRateLimited("1.2.3.4:pine")).toBe(false);
  });
  it("blocks at the limit and counts only the window", async () => {
    const now = new Date("2026-10-01T12:00:00Z");
    vi.mocked(prisma.joinCodeAttempt.count).mockResolvedValue(JOIN_RATE_LIMIT.max);
    expect(await isJoinRateLimited("1.2.3.4:pine", now)).toBe(true);
    expect(prisma.joinCodeAttempt.count).toHaveBeenCalledWith({
      where: { key: "1.2.3.4:pine", createdAt: { gte: new Date(now.getTime() - JOIN_RATE_LIMIT.windowMs) } },
    });
  });
  it("records a failed attempt", async () => {
    await recordFailedJoinAttempt("k");
    expect(prisma.joinCodeAttempt.create).toHaveBeenCalledWith({ data: { key: "k" } });
  });
});
