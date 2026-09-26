import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_BRANDING } from "@/lib/branding/resolve";
import { toViewModel, type BrandingViewModel, type ResolvedBranding } from "@/lib/branding/types";
import { OrgIdentity } from "../org-identity";
import { OrgMark, firstGrapheme } from "../org-mark";

const ASSET = "https://assets.example.com/branding/org_teal";
const DARK = `${ASSET}/a-logo-on-dark.png`;
const LIGHT = `${ASSET}/b-logo-on-light.png`;
const MARK = `${ASSET}/c-mark.png`;

const BASE: BrandingViewModel = {
  enabled: true,
  displayName: "Teal Physio",
  logoOnLightUrl: null,
  logoOnDarkUrl: null,
  markUrl: null,
};

const vm = (over: Partial<BrandingViewModel>): BrandingViewModel => ({ ...BASE, ...over });

/** All `src` values of rendered <img> elements, in document order. */
function imgSrcs(html: string): string[] {
  return [...html.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1]);
}

const PLATE = "bg-card rounded-md px-1.5 py-0.5";

describe("OrgIdentity — fallback table (spec §6.1)", () => {
  it("dark surface: uses logo-on-dark when present (no plate, no name text)", () => {
    const html = renderToStaticMarkup(
      <OrgIdentity
        branding={vm({ logoOnDarkUrl: DARK, logoOnLightUrl: LIGHT, markUrl: MARK })}
        surface="dark"
      />,
    );
    expect(imgSrcs(html)).toEqual([DARK]);
    expect(html).not.toContain(PLATE);
    expect(html).toContain('alt="Teal Physio"');
    expect(html).toContain('height="28"');
    expect(html).toContain('width="144"');
  });

  it("dark surface: falls back to logo-on-light on a bg-card plate", () => {
    const html = renderToStaticMarkup(
      <OrgIdentity branding={vm({ logoOnLightUrl: LIGHT, markUrl: MARK })} surface="dark" />,
    );
    expect(imgSrcs(html)).toEqual([LIGHT]);
    expect(html).toContain(PLATE);
  });

  it("dark surface: no logos → initial tile + display name", () => {
    const html = renderToStaticMarkup(<OrgIdentity branding={vm({})} surface="dark" />);
    expect(imgSrcs(html)).toEqual([]);
    expect(html).toContain("bg-primary text-primary-foreground");
    expect(html).toContain(">T<");
    expect(html).toContain("Teal Physio");
    expect(html).not.toContain("INMOTUS RX");
  });

  it("dark surface: mark only → mark image + display name", () => {
    const html = renderToStaticMarkup(
      <OrgIdentity branding={vm({ markUrl: MARK })} surface="dark" subtitle="Client Portal" />,
    );
    expect(imgSrcs(html)).toEqual([MARK]);
    expect(html).toContain("Teal Physio");
    expect(html).toContain("Client Portal");
    expect(html).not.toContain(PLATE);
  });

  it("light surface: uses logo-on-light (never the dark logo, no plate)", () => {
    const html = renderToStaticMarkup(
      <OrgIdentity branding={vm({ logoOnDarkUrl: DARK, logoOnLightUrl: LIGHT })} surface="light" />,
    );
    expect(imgSrcs(html)).toEqual([LIGHT]);
    expect(html).not.toContain(PLATE);
  });

  it("light surface: dark logo only → ignored, mark/initial + name", () => {
    const html = renderToStaticMarkup(
      <OrgIdentity branding={vm({ logoOnDarkUrl: DARK })} surface="light" />,
    );
    expect(imgSrcs(html)).toEqual([]);
    expect(html).toContain(">T<");
    expect(html).toContain("Teal Physio");
  });

  it("disabled → exact product identity (Activity icon + INMOTUS RX + subtitle)", () => {
    const html = renderToStaticMarkup(
      <OrgIdentity
        branding={toViewModel(DEFAULT_BRANDING)}
        surface="dark"
        subtitle="Trainer Portal"
      />,
    );
    expect(imgSrcs(html)).toEqual([]);
    expect(html).toContain(
      '<div class="flex h-8 w-8 items-center justify-center rounded-xl bg-muted shadow-sm"><svg',
    );
    expect(html).toContain("lucide-activity");
    expect(html).toContain(
      '<span class="text-[15px] font-bold tracking-tight text-sidebar-foreground">INMOTUS RX</span>',
    );
    expect(html).toContain(
      '<p class="text-[10px] font-medium text-sidebar-foreground/40 uppercase tracking-widest">Trainer Portal</p>',
    );
  });

  it("disabled ignores any stray asset URLs", () => {
    const html = renderToStaticMarkup(
      <OrgIdentity
        branding={vm({ enabled: false, displayName: "INMOTUS RX", logoOnDarkUrl: DARK })}
        surface="dark"
      />,
    );
    expect(imgSrcs(html)).toEqual([]);
    expect(html).toContain("INMOTUS RX");
  });

  it("disabled + light surface: same Activity tile, name in text-foreground, subtitle in text-muted-foreground", () => {
    const html = renderToStaticMarkup(
      <OrgIdentity
        branding={toViewModel(DEFAULT_BRANDING)}
        surface="light"
        subtitle="Trainer Portal"
      />,
    );
    expect(imgSrcs(html)).toEqual([]);
    expect(html).toContain(
      '<div class="flex h-8 w-8 items-center justify-center rounded-xl bg-muted shadow-sm"><svg',
    );
    expect(html).toContain("lucide-activity");
    expect(html).toContain(
      '<span class="text-[15px] font-bold tracking-tight text-foreground">INMOTUS RX</span>',
    );
    expect(html).toContain(
      '<p class="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Trainer Portal</p>',
    );
    expect(html).not.toContain("text-sidebar-foreground");
  });
});

describe("OrgMark", () => {
  it("renders the mark image with fixed square dimensions", () => {
    const html = renderToStaticMarkup(<OrgMark branding={vm({ markUrl: MARK })} size={32} />);
    expect(imgSrcs(html)).toEqual([MARK]);
    expect(html).toContain('width="32"');
    expect(html).toContain('height="32"');
    expect(html).toContain('alt="Teal Physio"');
    expect(html).toContain('decoding="async"');
  });

  it("renders an initial tile in the primary color when there is no mark", () => {
    const html = renderToStaticMarkup(<OrgMark branding={vm({ displayName: "  teal physio" })} />);
    expect(imgSrcs(html)).toEqual([]);
    expect(html).toContain("bg-primary text-primary-foreground");
    expect(html).toContain(">T<");
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("firstGrapheme", () => {
  it("upper-cases the first letter and trims whitespace", () => {
    expect(firstGrapheme("  teal physio ")).toBe("T");
  });

  it("keeps a multi-code-point emoji intact", () => {
    expect(firstGrapheme("👩‍⚕️ Care")).toBe("👩‍⚕️");
    expect(firstGrapheme("🏋️Gym")).toBe("🏋️");
  });

  it("handles accented and non-Latin names", () => {
    expect(firstGrapheme("élan")).toBe("É");
    expect(firstGrapheme("理学療法")).toBe("理");
  });

  it("falls back to a neutral placeholder for blank names", () => {
    expect(firstGrapheme("   ")).toBe("?");
  });
});

describe("toViewModel", () => {
  it("keeps only the serialisable client-safe subset", () => {
    const full: ResolvedBranding = {
      ...DEFAULT_BRANDING,
      enabled: true,
      orgId: "org_teal",
      displayName: "Teal Physio",
      tagline: "Move well",
      primaryHex: "#0f766e",
      logoOnLightUrl: LIGHT,
      logoOnDarkUrl: DARK,
      markUrl: MARK,
      faviconUrl: `${ASSET}/d-favicon-32.png`,
      appleIconUrl: `${ASSET}/d-apple-180.png`,
      css: ":root{}",
      themeColor: "#0f766e",
    };
    const vm = toViewModel(full);
    expect(vm).toEqual({
      enabled: true,
      displayName: "Teal Physio",
      logoOnLightUrl: LIGHT,
      logoOnDarkUrl: DARK,
      markUrl: MARK,
    });
    expect("primaryHex" in vm).toBe(false);
  });
});
