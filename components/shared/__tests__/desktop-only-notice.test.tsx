import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopOnlyNotice } from "../desktop-only-notice";

describe("DesktopOnlyNotice", () => {
  it("renders the exact copy", () => {
    const html = renderToStaticMarkup(<DesktopOnlyNotice />);
    expect(html).toContain("This tool is built for a larger screen");
    expect(html).toContain("Open Inmotus RX on a laptop to edit.");
  });

  it("hides itself from sm up and merges a caller class", () => {
    const html = renderToStaticMarkup(<DesktopOnlyNotice className="mt-4" />);
    const rootClass = html.match(/^<div[^>]*class="([^"]*)"/)?.[1] ?? "";
    expect(rootClass.split(" ")).toContain("sm:hidden");
    expect(rootClass.split(" ")).toContain("mt-4");
  });
});
