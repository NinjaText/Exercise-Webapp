import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Card, CardContent, CardHeader, CardTitle } from "../card";

/** Class list of the first element carrying `data-slot="<slot>"`. */
function classesOf(html: string, slot: string): string[] {
  const tag = html.match(new RegExp(`<[^>]*data-slot="${slot}"[^>]*>`))?.[0] ?? "";
  return (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

const VERTICAL_PADDING = /^(?:[\w-]+:)*(?:p|py|pt|pb)-/;

describe("Card padding contract", () => {
  it("puts vertical padding on the Card root and only horizontal padding on slots", () => {
    const html = renderToStaticMarkup(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>
    );
    expect(classesOf(html, "card")).toContain("py-5");
    expect(classesOf(html, "card-header").filter((c) => VERTICAL_PADDING.test(c) && !c.includes("[.border-b]"))).toEqual([]);
    expect(classesOf(html, "card-content").filter((c) => VERTICAL_PADDING.test(c))).toEqual([]);
  });

  it("lets a consumer p-0 on CardContent remove all of its padding", () => {
    const html = renderToStaticMarkup(
      <Card>
        <CardContent className="p-0">Flush</CardContent>
      </Card>
    );
    const content = classesOf(html, "card-content");
    expect(content).toContain("p-0");
    // No other padding utility (horizontal, vertical or variant) survives.
    expect(content.filter((c) => /^(?:[\w-]+:)*-?p[xytblrse]?-/.test(c) && c !== "p-0")).toEqual([]);
  });

  it("lets py-0 on Card remove the root's vertical padding", () => {
    const html = renderToStaticMarkup(
      <Card className="py-0">
        <CardContent className="p-4">Body</CardContent>
      </Card>
    );
    const card = classesOf(html, "card");
    expect(card).toContain("py-0");
    expect(card).not.toContain("py-5");
    expect(classesOf(html, "card-content")).toContain("p-4");
  });
});
