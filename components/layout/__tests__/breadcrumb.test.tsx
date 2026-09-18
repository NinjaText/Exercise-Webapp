import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Breadcrumbs } from "../breadcrumb-context";

describe("Breadcrumbs", () => {
  it("links every crumb except the last, which is the current page", () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs crumbs={[{ label: "Clients", href: "/clients" }, { label: "Yahya Shah" }]} />
    );
    expect(html).toContain('href="/clients"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Yahya Shah");
    // The current page is not a link
    expect(html).not.toMatch(/<a[^>]*>Yahya Shah<\/a>/);
  });

  it("renders a single crumb as the current page with no separator", () => {
    const html = renderToStaticMarkup(<Breadcrumbs crumbs={[{ label: "Dashboard" }]} />);
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('data-slot="crumb-separator"');
  });
});
