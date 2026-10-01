import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/member-trial-reminder.service", () => ({ sendDueTrialReminders: vi.fn() }));
vi.mock("@/lib/services/coaching.service", () => ({ sweepCoachingForExpiredTrials: vi.fn() }));

import { sendDueTrialReminders } from "@/lib/services/member-trial-reminder.service";
import { sweepCoachingForExpiredTrials } from "@/lib/services/coaching.service";
import { GET } from "../route";

const req = (auth?: string) =>
  new Request("http://localhost/api/cron/member-trial-reminders", auth ? { headers: { Authorization: auth } } : undefined);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CRON_SECRET;
  vi.mocked(sendDueTrialReminders).mockResolvedValue({ checked: 2, sent: 1 });
  vi.mocked(sweepCoachingForExpiredTrials).mockResolvedValue({ checked: 1, canceled: 1 });
});

describe("GET /api/cron/member-trial-reminders", () => {
  it("sends reminders and runs the expired-trial coaching sweep", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 2, sent: 1, coaching: { checked: 1, canceled: 1 } });
    expect(sweepCoachingForExpiredTrials).toHaveBeenCalledTimes(1);
  });

  it("still runs the sweep when reminders fail, and reports 500", async () => {
    vi.mocked(sendDueTrialReminders).mockRejectedValue(new Error("resend down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(sweepCoachingForExpiredTrials).toHaveBeenCalledTimes(1);
  });

  it("reports 500 when the sweep itself fails", async () => {
    vi.mocked(sweepCoachingForExpiredTrials).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET(req())).status).toBe(500);
  });

  it("requires the cron secret when set", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(req())).status).toBe(401);
    expect(sweepCoachingForExpiredTrials).not.toHaveBeenCalled();
    expect((await GET(req("Bearer s3cret"))).status).toBe(200);
  });
});
