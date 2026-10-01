import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/actions/coaching-actions", () => ({
  requestCoachingAction: vi.fn(),
  withdrawCoachingRequestAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { CoachingCard } from "../coaching-card";

const render = (status: any, priceLabel: string | null = "$49.00 / month") =>
  renderToStaticMarkup(<CoachingCard coaching={{ status, priceLabel }} />);

describe("CoachingCard", () => {
  it.each([null, "DECLINED", "CANCELED"])("offers a request for %s", (status) => {
    const html = render(status);
    expect(html).toContain("Request coaching");
    expect(html).not.toContain("Start coaching");
  });

  it("shows the price on the request prompt, and survives a missing price", () => {
    expect(render(null)).toContain("$49.00 / month");
    expect(render(null, null)).toContain("Request coaching");
  });

  it("REQUESTED shows request sent and a withdraw button", () => {
    const html = render("REQUESTED");
    expect(html).toContain("Request sent");
    expect(html).toContain("Withdraw");
  });

  it("ACCEPTED shows the price and a start-coaching button", () => {
    const html = render("ACCEPTED");
    expect(html).toContain("Start coaching");
    expect(html).toContain("$49.00 / month");
    expect(html).not.toContain("<button disabled");
  });

  it("ACCEPTED works without a price", () => {
    expect(render("ACCEPTED", null)).toContain("Start coaching");
  });

  it("ACTIVE links to messages", () => {
    const html = render("ACTIVE");
    expect(html).toContain("Message your coach");
    expect(html).toContain('href="/messages"');
  });

  it("PAST_DUE offers update payment", () => {
    const html = render("PAST_DUE");
    expect(html).toContain("Update payment");
    expect(html).toContain("Paused");
  });
});
