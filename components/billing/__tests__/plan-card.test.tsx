import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanCard } from "../plan-card";
import { StatusBanner } from "../status-banner";

describe("PlanCard", () => {
  it("renders name, large price, billing note, features with checks and the CTA", () => {
    const html = renderToStaticMarkup(
      <PlanCard
        name="Pro"
        price="$49"
        cadence="/ month"
        billedNote="Billed monthly"
        badge="Most popular"
        highlighted
        features={["AI workout generation", "Client progress tracking"]}
      >
        <button>Start Plan</button>
      </PlanCard>,
    );
    expect(html).toContain("Pro");
    expect(html).toMatch(/text-display[^"]*tabular-nums[^"]*">\$49/);
    expect(html).toContain("Billed monthly");
    expect(html).toContain("Most popular");
    expect(html).toContain("ring-primary");
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain("Start Plan");
  });

  it("omits the price block when there is no price", () => {
    const html = renderToStaticMarkup(<PlanCard name="Coaching" />);
    expect(html).not.toContain("text-display");
  });
});

describe("StatusBanner", () => {
  it("uses status tokens and an alert role only for danger", () => {
    const danger = renderToStaticMarkup(<StatusBanner tone="danger">Payment failed</StatusBanner>);
    expect(danger).toContain("bg-danger-soft");
    expect(danger).toContain('role="alert"');
    const info = renderToStaticMarkup(<StatusBanner tone="info">3 days left</StatusBanner>);
    expect(info).toContain("bg-info-soft");
    expect(info).toContain('role="status"');
  });
});
