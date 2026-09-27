import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, buttonVariants } from "../button";

type Size = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
const SIZES: Size[] = ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"];

// What each size needs on a coarse pointer to reach 44px.
const COARSE_CLASSES: Record<Size, string[]> = {
  default: ["pointer-coarse:h-11"],
  lg: ["pointer-coarse:h-11"],
  icon: ["pointer-coarse:size-11"],
  "icon-lg": ["pointer-coarse:size-11"],
  sm: ["relative", "pointer-coarse:after:absolute", "pointer-coarse:after:-inset-1.5"],
  "icon-sm": ["relative", "pointer-coarse:after:absolute", "pointer-coarse:after:-inset-1.5"],
  // Already `relative after:absolute` (the desktop 32px hit area); coarse widens it.
  xs: ["relative", "after:absolute", "pointer-coarse:after:-inset-2"],
  "icon-xs": ["relative", "after:absolute", "pointer-coarse:after:-inset-2"],
};

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

describe("Button touch targets", () => {
  for (const size of SIZES) {
    it(`${size}: reaches 44px on coarse pointers`, () => {
      const classes = tokens(buttonVariants({ size }));
      for (const c of COARSE_CLASSES[size]) expect(classes).toContain(c);
    });
  }

  it("keeps every touch-only addition behind pointer-coarse: (desktop unchanged)", () => {
    for (const size of SIZES) {
      const added = tokens(buttonVariants({ size })).filter(
        (t) => t.includes("coarse") || t === "relative"
      );
      for (const t of added) {
        expect(t === "relative" || t.startsWith("pointer-coarse:"), `${size}: ${t}`).toBe(true);
      }
    }
  });

  it("lets a caller's absolute positioning win over the hit-area anchor", () => {
    const html = renderToStaticMarkup(
      <Button size="icon-sm" className="absolute top-2 right-2">
        x
      </Button>
    );
    const classes = tokens(html.match(/class="([^"]*)"/)?.[1] ?? "");
    expect(classes).toContain("absolute");
    expect(classes).not.toContain("relative");
    expect(classes).toContain("pointer-coarse:after:absolute");
  });

  it("keeps a caller's height override and the coarse height side by side", () => {
    const html = renderToStaticMarkup(<Button className="h-10">Go</Button>);
    const classes = tokens(html.match(/class="([^"]*)"/)?.[1] ?? "");
    expect(classes).toContain("h-10");
    expect(classes).not.toContain("h-9");
    expect(classes).toContain("pointer-coarse:h-11");
  });
});
