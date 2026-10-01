import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Inbox } from "lucide-react";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("renders the icon in a soft circle, a heading-size title, one sentence and one action", () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={Inbox} title="No clients yet" description="Invite your first client." actionLabel="Invite" actionHref="/clients/new" />
    );
    expect(html).toMatch(/data-slot="empty-state-icon"[^>]*class="[^"]*\brounded-full\b[^"]*\bbg-surface-muted\b/);
    expect(html).toMatch(/<h3[^>]*class="[^"]*\btext-heading\b/);
    expect(html).toContain("Invite your first client.");
    expect(html).toContain('href="/clients/new"');
    expect((html.match(/<a /g) ?? []).length).toBe(1);
  });

  it("uses smaller type in the compact size", () => {
    const html = renderToStaticMarkup(<EmptyState icon={Inbox} title="Nothing" size="compact" />);
    expect(html).toContain('data-size="compact"');
    expect(html).toMatch(/<h3[^>]*class="[^"]*\btext-label\b/);
  });

  it("prefers a custom action node over the built-in one", () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={Inbox} title="x" actionLabel="Built in" actionHref="/x" action={<span>Custom</span>} />
    );
    expect(html).toContain("Custom");
    expect(html).not.toContain("Built in");
  });
});
