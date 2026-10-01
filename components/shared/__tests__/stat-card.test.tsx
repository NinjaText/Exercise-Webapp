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
  it("renders the label as a caption, the value at title size with tabular numbers", () => {
    const html = renderToStaticMarkup(<StatCard label="Clients" value={12} icon={Users} />);
    expect(html).toMatch(/class="[^"]*\btext-caption\b[^"]*"[^>]*>Clients</);
    expect(html).toMatch(/class="[^"]*\btext-title\b[^"]*\btabular-nums\b[^"]*"[^>]*>12</);
    expect(html).toMatch(/data-slot="card-content"[^>]*class="[^"]*\bp-5\b/);
    expect(html).not.toContain("shadow-none");
  });
  it("uses 16px padding when compact", () => {
    const html = renderToStaticMarkup(<StatCard label="x" value={1} icon={Users} size="compact" />);
    expect(html).toMatch(/data-slot="card-content"[^>]*class="[^"]*\bp-4\b/);
  });
  it("renders the trend as a tinted chip", () => {
    const html = renderToStaticMarkup(
      <StatCard label="x" value={1} icon={Users} trend={{ value: -4, label: "vs last week" }} />
    );
    expect(html).toContain('data-slot="stat-card-trend"');
    expect(html).toContain("bg-danger-soft");
    expect(html).toContain("4% vs last week");
  });
  it("announces the trend direction to assistive tech", () => {
    const down = renderToStaticMarkup(
      <StatCard label="x" value={1} icon={Users} trend={{ value: -4, label: "vs last week" }} />
    );
    expect(down).toMatch(/<span class="sr-only">Decreased<\/span>/);
    const up = renderToStaticMarkup(
      <StatCard label="x" value={1} icon={Users} trend={{ value: 4, label: "vs last week" }} />
    );
    expect(up).toMatch(/<span class="sr-only">Increased<\/span>/);
    expect(up).toContain("bg-success-soft");
  });
});
