import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoachingRequestedEmail } from "../coaching-requested";
import { CoachingAcceptedEmail } from "../coaching-accepted";
import { CoachingDeclinedEmail } from "../coaching-declined";

const brand = { organizationName: "Pine Valley", accent: "#0f766e" };

describe("CoachingRequestedEmail", () => {
  it("quotes the member's note and links to their client page", () => {
    const html = renderToStaticMarkup(
      <CoachingRequestedEmail
        recipientName="Mike"
        memberName="Sam Lee"
        note="Help with my squat"
        clientLink="https://app.test/clients/u1"
        unsubscribeUrl="https://app.test/unsub"
      />
    );
    expect(html).toContain("Hi Mike,");
    expect(html).toContain("Sam Lee");
    expect(html).toContain("Help with my squat");
    expect(html).toContain('href="https://app.test/clients/u1"');
    expect(html).toContain('href="https://app.test/unsub"');
  });
});

describe("CoachingAcceptedEmail", () => {
  it("names the trainer, links to the dashboard and carries the club brand", () => {
    const html = renderToStaticMarkup(
      <CoachingAcceptedEmail
        recipientName="Sam"
        trainerName="Mike Chen"
        clubName="Pine Valley"
        dashboardLink="https://app.test/dashboard"
        brand={brand}
      />
    );
    expect(html).toContain("Hi Sam,");
    expect(html).toContain("Mike Chen");
    expect(html).toContain('href="https://app.test/dashboard"');
    expect(html).toContain("Pine Valley");
    expect(html).toContain("#0f766e");
  });
});

describe("CoachingDeclinedEmail", () => {
  const render = (note?: string) =>
    renderToStaticMarkup(
      <CoachingDeclinedEmail
        recipientName="Sam"
        trainerName="Mike Chen"
        clubName="Pine Valley"
        note={note}
        dashboardLink="https://app.test/dashboard"
        brand={brand}
      />
    );

  it("includes the trainer's note when given", () => {
    const html = render("Fully booked this month");
    expect(html).toContain("Fully booked this month");
    expect(html).toContain('href="https://app.test/dashboard"');
    expect(html).toContain("#0f766e");
  });

  it("renders without a note", () => {
    const html = render(undefined);
    expect(html).toContain("Hi Sam,");
    expect(html).toContain("Mike Chen");
  });
});
