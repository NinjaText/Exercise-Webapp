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
});
