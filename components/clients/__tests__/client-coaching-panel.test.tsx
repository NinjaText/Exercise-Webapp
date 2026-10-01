import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/actions/coaching-actions", () => ({
  endCoachingAction: vi.fn(),
  respondCoachingRequestAction: vi.fn(),
  withdrawCoachingOfferAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ClientCoachingPanel } from "../client-coaching-panel";
import { CoachingRequestsCard } from "@/components/dashboard/coaching-requests-card";

const render = (status: any, extra: object = {}) =>
  renderToStaticMarkup(
    <ClientCoachingPanel
      coaching={{ memberId: "m1", status, note: "bad knee", cancelAtPeriodEnd: false, periodEnd: null, ...extra }}
    />
  );

describe("ClientCoachingPanel", () => {
  it("REQUESTED: badge, note, Accept and Decline", () => {
    const html = render("REQUESTED");
    expect(html).toContain("Coaching requested");
    expect(html).toContain("bad knee");
    expect(html).toContain("Accept");
    expect(html).toContain("Decline");
    expect(html).not.toContain("End coaching");
  });

  it("ACCEPTED: awaiting payment and Withdraw offer", () => {
    const html = render("ACCEPTED");
    expect(html).toContain("Awaiting payment");
    expect(html).toContain("Withdraw offer");
    expect(html).not.toContain("Accept<");
  });

  it("ACTIVE: End coaching; PAST_DUE shows paused", () => {
    expect(render("ACTIVE")).toContain("End coaching");
    expect(render("PAST_DUE")).toContain("Coaching paused");
  });

  it("shows the request note only while the request or offer is open", () => {
    expect(render("ACCEPTED")).toContain("bad knee");
    for (const status of ["ACTIVE", "PAST_DUE", "DECLINED", "CANCELED", null]) {
      expect(render(status)).not.toContain("bad knee");
    }
  });

  it("shows the end date and no End button once cancelling", () => {
    const html = render("ACTIVE", { cancelAtPeriodEnd: true, periodEnd: new Date("2026-11-15T00:00:00Z") });
    expect(html).toContain("Coaching ends");
    expect(html).not.toContain(">End coaching<");
  });
});

describe("CoachingRequestsCard", () => {
  it("shows the empty state", () => {
    expect(renderToStaticMarkup(<CoachingRequestsCard requests={[]} />)).toContain("No coaching requests");
  });

  it("lists each member's note with Accept / Decline", () => {
    const html = renderToStaticMarkup(
      <CoachingRequestsCard
        requests={[{ memberId: "m1", name: "Ada L", email: "a@x.io", note: "shoulder rehab", requestedAt: null }]}
      />
    );
    expect(html).toContain("Ada L");
    expect(html).toContain("shoulder rehab");
    expect(html).toContain("Accept");
    expect(html).toContain("Decline");
  });
});
