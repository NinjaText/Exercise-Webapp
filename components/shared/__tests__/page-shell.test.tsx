import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageShell, PAGE_WIDTH_CLASS } from "../page-shell";

describe("PageShell", () => {
  it("defaults to the default width and centers content", () => {
    const html = renderToStaticMarkup(<PageShell>x</PageShell>);
    expect(html).toContain("max-w-[1600px]");
    expect(html).toContain("mx-auto");
    expect(html).toContain('data-width="default"');
  });

  it("applies narrow and full widths", () => {
    expect(renderToStaticMarkup(<PageShell width="narrow">x</PageShell>)).toContain("max-w-[640px]");
    expect(renderToStaticMarkup(<PageShell width="full">x</PageShell>)).toContain("max-w-none");
  });

  it("exposes exactly three widths", () => {
    expect(Object.keys(PAGE_WIDTH_CLASS).sort()).toEqual(["default", "full", "narrow"]);
  });
});
