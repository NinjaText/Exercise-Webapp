import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailLayout } from "../layout";

describe("EmailLayout", () => {
  it("renders the greeting, intro, brand, and detail rows", () => {
    const html = renderToStaticMarkup(
      <EmailLayout
        title="Session Reminder"
        greeting="Hi Sarah,"
        intro="Your session is tomorrow."
        details={[
          { label: "Workout", value: "Lower Body A" },
          { label: "Date", value: "Monday, March 3" },
        ]}
      />
    );

    expect(html).toContain("INMOTUS RX");
    expect(html).toContain("Hi Sarah,");
    expect(html).toContain("Your session is tomorrow.");
    expect(html).toContain("Workout");
    expect(html).toContain("Lower Body A");
    expect(html).toContain("Monday, March 3");
  });

  it("renders the CTA label and href when given one", () => {
    const html = renderToStaticMarkup(
      <EmailLayout
        title="T"
        greeting="Hi,"
        intro="i"
        cta={{ label: "View Your Session", href: "https://app.test/sessions" }}
      />
    );

    expect(html).toContain("View Your Session");
    expect(html).toContain("https://app.test/sessions");
  });

  it("renders an unsubscribe link naming the category", () => {
    const html = renderToStaticMarkup(
      <EmailLayout
        title="T"
        greeting="Hi,"
        intro="i"
        unsubscribe={{
          url: "https://app.test/api/notifications/unsubscribe?token=abc",
          categoryLabel: "message",
        }}
      />
    );

    expect(html).toContain("Unsubscribe from message emails");
    expect(html).toContain("token=abc");
  });

  it("omits the unsubscribe link entirely for transactional mail", () => {
    const html = renderToStaticMarkup(<EmailLayout title="T" greeting="Hi," intro="i" />);

    expect(html).not.toContain("Unsubscribe");
  });

  it("honours a custom organization name", () => {
    const html = renderToStaticMarkup(
      <EmailLayout title="T" greeting="Hi," intro="i" organizationName="ACME PHYSIO" />
    );

    expect(html).toContain("ACME PHYSIO");
    expect(html).not.toContain("INMOTUS RX");
  });

  it("defaults to brand blue when no accent is given", () => {
    const html = renderToStaticMarkup(<EmailLayout title="T" greeting="Hi," intro="i" />);

    expect(html).toContain("#2563eb");
  });

  it("uses a passed accent for the header bar and CTA button", () => {
    const html = renderToStaticMarkup(
      <EmailLayout
        title="T"
        greeting="Hi,"
        intro="i"
        accent="#dc2626"
        cta={{ label: "View Client", href: "https://app.test/clients" }}
      />
    );

    expect(html).toContain("#dc2626");
    expect(html).not.toContain("#2563eb");
  });
  it("renders the logo image in the header bar when logoUrl is given", () => {
    const html = renderToStaticMarkup(
      <EmailLayout
        title="T"
        greeting="Hi,"
        intro="i"
        organizationName="Summit PT"
        logoUrl="https://assets.test/branding/org_1/logo-on-dark-abcd1234.png"
      />
    );

    expect(html).toMatch(/<img[^>]+src="https:\/\/assets\.test\/branding\/org_1\/logo-on-dark-abcd1234\.png"/);
    expect(html).toMatch(/<img[^>]+alt="Summit PT"/);
    expect(html).toMatch(/<img[^>]+height="32"/);
    expect(html).toMatch(/<img[^>]+style="[^"]*width:auto/);
    // The name still appears in the footer copyright line.
    expect(html).toContain("Summit PT");
  });

  it("renders the name as text, and no image, without a logoUrl", () => {
    const html = renderToStaticMarkup(
      <EmailLayout title="T" greeting="Hi," intro="i" organizationName="Summit PT" />
    );

    expect(html).not.toContain("<img");
    expect(html).toMatch(/<p[^>]*>Summit PT<\/p>/);
  });

  it("does not render the header name text when a logo replaces it", () => {
    const html = renderToStaticMarkup(
      <EmailLayout
        title="T"
        greeting="Hi,"
        intro="i"
        organizationName="Summit PT"
        logoUrl="https://assets.test/l.png"
      />
    );

    expect(html).not.toMatch(/<p[^>]*>Summit PT<\/p>/);
  });
});
