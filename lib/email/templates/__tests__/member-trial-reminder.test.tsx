import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemberTrialReminderEmail } from "../member-trial-reminder";

const render = (reminder: "d3" | "d1" | "d0") =>
  renderToStaticMarkup(
    <MemberTrialReminderEmail
      recipientName="Sam"
      clubName="Pine Valley"
      reminder={reminder}
      billingLink="https://app.test/billing"
      organizationName="Pine Valley"
    />
  );

describe("MemberTrialReminderEmail", () => {
  it("d0 says the trial has ended and links to billing", () => {
    const html = render("d0");
    expect(html).toContain("has ended");
    expect(html).toContain('href="https://app.test/billing"');
    expect(html).toContain("Hi Sam,");
  });
  it("d3 and d1 mention the time left", () => {
    expect(render("d3")).toContain("ends in 3 days");
    expect(render("d1")).toContain("ends tomorrow");
  });
});
