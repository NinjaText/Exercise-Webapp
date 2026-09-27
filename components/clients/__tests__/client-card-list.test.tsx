import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/actions/client-actions", () => ({
  archiveClientAction: vi.fn(),
  restoreClientAction: vi.fn(),
}));

import { ClientCardList, type ClientCardItem } from "../client-card-list";

const clients: ClientCardItem[] = [
  { id: "c1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", imageUrl: null, isActive: true },
  { id: "c2", firstName: "", lastName: "", email: "grace@example.com", imageUrl: null, isActive: false },
];

describe("ClientCardList", () => {
  it("renders a row per client with name, status and link", () => {
    const html = renderToStaticMarkup(<ClientCardList clients={clients} />);
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain('href="/clients/c1"');
    // Nameless clients fall back to their email.
    expect(html).toContain("grace@example.com");
    expect(html).toContain('href="/clients/c2"');
    expect(html).toContain("Active");
    expect(html).toContain("Inactive");
    expect(html.match(/<li /g)).toHaveLength(2);
  });

  it("gives each row a 56px floor and a truncating name", () => {
    const html = renderToStaticMarkup(<ClientCardList clients={clients} />);
    expect(html).toMatch(/<li class="[^"]*\bmin-h-14\b/);
    expect(html).toMatch(/class="[^"]*\bmin-w-0\b[^"]*\btruncate\b[^"]*">Ada Lovelace/);
  });

  it("keeps the actions menu outside the stretched link, raised above it", () => {
    const html = renderToStaticMarkup(<ClientCardList clients={clients.slice(0, 1)} />);
    const link = html.match(/<a [^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(link).toContain("after:absolute");
    expect(link).not.toContain("<button");
    expect(html).toMatch(/<\/a><div class="relative z-10 shrink-0"><button/);
  });

  it("renders the empty state when there are no clients", () => {
    const html = renderToStaticMarkup(<ClientCardList clients={[]} emptyState={<p>Nobody here</p>} />);
    expect(html).toContain("Nobody here");
    expect(html).not.toContain("<ul");
  });
});
