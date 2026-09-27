import type { ResolvedBranding } from "@/lib/branding/types";

/**
 * Server-rendered org theme override (spec §5.4). Emits
 * `:root:not(.dark){…}:root.dark{…}`
 * so it applies document-wide — including Radix portals mounted on <body>.
 * Renders nothing for product defaults / disabled branding.
 */
export function BrandStyle({ branding }: { branding: ResolvedBranding }) {
  if (!branding.css) return null;
  // The only dangerouslySetInnerHTML in the branding feature. `css` is produced
  // by buildBrandCss() from numeric oklch values and is grammar-checked in
  // lib/branding/__tests__/css.test.ts; no user string can reach it.
  return <style id="org-brand" dangerouslySetInnerHTML={{ __html: branding.css }} />;
}
