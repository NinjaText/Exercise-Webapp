import type { Metadata, Viewport } from "next";
import type { ResolvedBranding } from "./types";

/**
 * Product favicon, declared as config metadata in the root layout (the file
 * lives at public/favicon.ico, NOT app/favicon.ico). A file-convention
 * app/favicon.ico is always prepended to icons.icon by Next, even when a
 * nested layout sets `icons`; config icons are replaced wholesale instead.
 */
export const PRODUCT_ICONS = {
  icon: [{ url: "/favicon.ico", sizes: "any" }],
} satisfies Metadata["icons"];

/**
 * `icons` metadata for a branded org, as a spreadable fragment. Returns `{}`
 * (no `icons` key at all) when there is no brand favicon: Next merges every key
 * present on the object, and `icons: undefined` would resolve to null and wipe
 * the root's product favicon.
 */
export function brandIconsMetadata(b: ResolvedBranding): Pick<Metadata, "icons"> {
  if (!b.faviconUrl) return {};
  return {
    icons: {
      icon: [{ url: b.faviconUrl, sizes: "32x32", type: "image/png" }],
      apple: b.appleIconUrl ? [{ url: b.appleIconUrl, sizes: "180x180" }] : undefined,
    },
  };
}

/**
 * `<meta name="theme-color">` for the platform layout, as a spreadable
 * `Viewport` fragment. Returns `{}` (no `themeColor` key) unless branding is
 * enabled AND a brand color actually produced tokens — an unbranded org, or
 * one that enabled branding but never set a color, keeps the product's own
 * theme-color (i.e. none set here at all, so nothing changes on their mobile
 * browser chrome).
 */
export function brandViewport(b: ResolvedBranding): Pick<Viewport, "themeColor"> {
  if (!b.enabled || !b.tokens) return {};
  return { themeColor: b.themeColor };
}
