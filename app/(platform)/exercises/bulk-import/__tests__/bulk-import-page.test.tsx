import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "t1", role: "TRAINER" })),
  isSuperAdmin: vi.fn(async () => false),
}));
vi.mock("@/components/exercises/bulk-import-form", () => ({ BulkImportForm: () => <div>TOOL</div> }));

import BulkImportPage from "../page";

function count(html: string, needle: string) {
  return html.split(needle).length - 1;
}

describe("bulk import on phones", () => {
  it("renders one notice for phones and the importer only from sm up", async () => {
    const html = renderToStaticMarkup(await BulkImportPage());
    expect(count(html, 'data-slot="desktop-only-notice"')).toBe(1);
    expect(html).toMatch(/data-slot="desktop-only-notice"[^>]*class="[^"]*\bsm:hidden\b/);
    expect(count(html, 'class="hidden sm:block"')).toBe(1);
    expect(html).toContain('<div class="hidden sm:block"><div>TOOL</div></div>');
  });
});
