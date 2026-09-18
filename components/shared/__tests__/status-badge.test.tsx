import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "../status-badge";

describe("StatusBadge", () => {
  it("renders a humanized label and success role classes for COMPLETED", () => {
    const html = renderToStaticMarkup(<StatusBadge status="COMPLETED" />);
    expect(html).toContain("Completed");
    expect(html).toContain("bg-success-soft");
    expect(html).toContain("text-success-foreground");
    expect(html).toMatch(/data-slot="status-dot"[^>]*class="[^"]*\bbg-success\b/); // the dot
    expect(html).toContain('data-role="success"');
  });

  it("uses the label override and role override", () => {
    const html = renderToStaticMarkup(
      <StatusBadge status="RESOURCE" label="On demand" role="brand" />
    );
    expect(html).toContain("On demand");
    expect(html).toContain('data-role="brand"');
    expect(html).not.toContain("Resource");
  });

  it("omits the dot when dot={false}", () => {
    const html = renderToStaticMarkup(<StatusBadge status="MISSED" dot={false} />);
    expect(html).not.toContain('data-slot="status-dot"');
  });

  it("falls back to neutral for unknown statuses", () => {
    const html = renderToStaticMarkup(<StatusBadge status="WHATEVER" />);
    expect(html).toContain('data-role="neutral"');
  });
});
