import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Inbox } from "lucide-react";
import { SectionCard } from "../section-card";

describe("SectionCard", () => {
  it("renders icon, title, count and a link action", () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Inbox" icon={Inbox} count={3} action={{ label: "View all", href: "/messages" }}>
        body
      </SectionCard>
    );
    expect(html).toContain("<h2");
    expect(html).toContain("Inbox");
    expect(html).toContain('data-slot="section-card-count"');
    expect(html).toContain(">3<");
    expect(html).toContain('href="/messages"');
    expect(html).toContain("View all");
    expect(html).toContain("body");
  });

  it("accepts a custom node as action", () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Stats" action={<button>Refresh</button>}>x</SectionCard>
    );
    expect(html).toContain("Refresh");
  });

  it("uses ring instead of drop shadow and adds hover ring when href is set", () => {
    const plain = renderToStaticMarkup(<SectionCard title="A">x</SectionCard>);
    expect(plain).not.toContain("shadow-md");
    const clickable = renderToStaticMarkup(<SectionCard title="A" href="/a">x</SectionCard>);
    expect(clickable).toContain("hover:ring-border-strong");
    expect(clickable).toContain('href="/a"');
  });

  it("does not nest a link action inside a card-level href link", () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Inbox" href="/a" action={{ label: "View all", href: "/messages" }}>
        x
      </SectionCard>
    );
    expect((html.match(/<a /g) ?? []).length).toBe(1);
    expect(html).toContain("View all");
    expect(html).not.toContain('href="/messages"');
  });

  it("renders the heading type, description inside the header and 20px padding", () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Inbox" description="Latest messages">body</SectionCard>
    );
    expect(html).toMatch(/<h2[^>]*class="[^"]*\btext-heading\b/);
    expect(html).toMatch(/data-slot="section-card-header"[^>]*class="[^"]*\bpx-5\b[^"]*\bpt-5\b/);
    expect(html.indexOf("Latest messages")).toBeLessThan(html.indexOf('data-slot="card-content"'));
    expect(html).toMatch(/data-slot="card-content"[^>]*class="[^"]*\bpb-5\b/);
    expect(html).toContain("shadow-xs");
    expect(html).toContain("rounded-xl");
  });

  it("uses 16px padding when compact", () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Inbox" size="compact">body</SectionCard>
    );
    expect(html).toContain('data-size="compact"');
    expect(html).toMatch(/data-slot="section-card-header"[^>]*class="[^"]*\bpx-4\b[^"]*\bpt-4\b/);
    expect(html).toMatch(/data-slot="card-content"[^>]*class="[^"]*\bpx-4\b[^"]*\bpb-4\b/);
  });

  it("lets contentClassName remove the body padding for edge-to-edge lists", () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Recent" contentClassName="px-0 pb-0">body</SectionCard>
    );
    expect(html).toMatch(/data-slot="card-content"[^>]*class="[^"]*\bpx-0 pb-0\b/);
    expect(html).not.toMatch(/data-slot="card-content"[^>]*class="[^"]*\bpx-5\b/);
  });
});
