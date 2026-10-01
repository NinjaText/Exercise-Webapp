import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "@tailwindcss/node";

/**
 * Compiles the real app/globals.css through Tailwind and checks that the
 * premium-redesign tokens (spec §2.1) resolve to the utilities components use.
 */
const root = path.resolve(__dirname, "../../..");
const globalsPath = path.join(root, "app/globals.css");
const globalsCss = readFileSync(globalsPath, "utf8");

async function build(candidates: string[]): Promise<string> {
  const compiler = await compile(globalsCss, {
    base: path.dirname(globalsPath),
    onDependency: () => {},
  });
  return compiler.build(candidates);
}

/** Returns the declarations block of `.selector { ... }` in the compiled CSS. */
function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return "";
  return css.slice(start, css.indexOf("}", start));
}

/** Returns the custom-property declarations inside the first `<block> {` block. */
function block(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) return "";
  return css.slice(start, css.indexOf("\n}", start));
}

describe("design tokens (globals.css)", () => {
  it("exposes canvas, surface and border-strong colours as theme utilities", async () => {
    // The border-strong colour token surfaces as border-border-strong (like border-border).
    const css = await build(["bg-canvas", "bg-surface", "bg-surface-muted", "border-border-strong"]);
    expect(rule(css, ".bg-canvas")).toContain("var(--canvas)");
    expect(rule(css, ".bg-surface")).toContain("var(--surface)");
    expect(rule(css, ".bg-surface-muted")).toContain("var(--surface-muted)");
    expect(rule(css, ".border-border-strong")).toContain("var(--border-strong)");
  });

  it("defines light and dark values for every new token", () => {
    const light = block(globalsCss, ":root");
    const dark = block(globalsCss, ".dark");
    for (const token of [
      "--canvas",
      "--surface",
      "--surface-muted",
      "--border",
      "--border-strong",
      "--shadow-xs",
      "--shadow-sm",
      "--shadow-md",
      "--shadow-lg",
    ]) {
      expect(light).toContain(`${token}:`);
      expect(dark).toContain(`${token}:`);
    }
  });

  it("routes shadow-xs/sm/md/lg through the themeable elevation tokens", async () => {
    const css = await build(["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg"]);
    for (const size of ["xs", "sm", "md", "lg"]) {
      expect(rule(css, `.shadow-${size}`)).toContain(`--tw-shadow: var(--shadow-${size})`);
    }
  });

  it("has no ad-hoc shadow colours left in globals.css", () => {
    const shadows = globalsCss.match(/box-shadow:[^;]*;/g) ?? [];
    const adHoc = shadows.filter((s) => /rgba?\(|oklch\(0 0 0/.test(s));
    expect(adHoc).toEqual([]);
  });

  it("generates the named typography utilities in rem so they follow the density scale", async () => {
    const css = await build([
      "text-display",
      "text-title",
      "text-heading",
      "text-body",
      "text-label",
      "text-caption",
    ]);
    const expected: Record<string, [string, string, string]> = {
      display: ["1.875rem", "2.25rem", "600"],
      title: ["1.375rem", "1.75rem", "600"],
      heading: ["1rem", "1.5rem", "600"],
      body: ["0.875rem", "1.375rem", "400"],
      label: ["0.8125rem", "1.25rem", "500"],
      caption: ["0.75rem", "1rem", "400"],
    };
    for (const [name, [size, leading, weight]] of Object.entries(expected)) {
      const r = rule(css, `.text-${name}`);
      expect(r).toContain(`font-size: ${size}`);
      expect(r).toContain(`line-height: ${leading}`);
      expect(r).toContain(`font-weight: ${weight}`);
    }
    expect(rule(css, ".text-display")).toContain("var(--font-lexend)");
    expect(rule(css, ".text-title")).toContain("var(--font-lexend)");
    expect(rule(css, ".text-heading")).not.toContain("--font-lexend");
    expect(rule(css, ".text-caption")).toContain("var(--muted-foreground)");
  });

  it("lets an explicit text colour override the caption's muted default", async () => {
    const css = await build(["text-caption", "text-foreground"]);
    expect(css.indexOf(".text-caption {")).toBeGreaterThan(-1);
    expect(css.indexOf(".text-caption {")).toBeLessThan(css.indexOf(".text-foreground {"));
  });

  it("no longer hard-codes the old canvas colour in app or components", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === "__tests__" || entry.startsWith(".")) continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|css)$/.test(entry) && readFileSync(full, "utf8").includes("oklch(0.97_0.005_247)")) {
          offenders.push(path.relative(root, full));
        }
      }
    };
    walk(path.join(root, "app"));
    walk(path.join(root, "components"));
    expect(offenders).toEqual([]);
  });
});
