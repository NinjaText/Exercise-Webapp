import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Users } from "lucide-react";
import { StatCard } from "../stat-card";

describe("StatCard", () => {
  it("renders a link when href is set", () => {
    const html = renderToStaticMarkup(<StatCard label="Clients" value={3} icon={Users} href="/clients" />);
    expect(html).toContain('href="/clients"');
    expect(html).toContain("hover:ring-border-strong");
  });
  it("renders a button when onClick is set", () => {
    const html = renderToStaticMarkup(<StatCard label="Pending" value={2} icon={Users} onClick={() => {}} />);
    expect(html).toContain('<button type="button"');
    expect(html).toContain("hover:ring-border-strong");
  });
  it("uses role colors for the icon badge", () => {
    const html = renderToStaticMarkup(<StatCard label="x" value={1} icon={Users} role="warning" size="compact" />);
    expect(html).toContain("bg-warning-soft");
    expect(html).toContain("text-warning-foreground");
  });
  it("still renders the href when scroll is false", () => {
    const html = renderToStaticMarkup(
      <StatCard label="Priorities" value={4} icon={Users} href="/dashboard?focus=priorities" scroll={false} />
    );
    expect(html).toContain('href="/dashboard?focus=priorities"');
  });
});
