import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "@/lib/brand";

/**
 * Intrinsic pixel sizes of the PNGs in public/brand/ (the width/height attrs
 * reserve the aspect ratio so there is no layout shift; CSS sets the height).
 */
const ASSETS = {
  lockup: { w: 1896, h: 220, file: "mia-logo" },
  mark: { w: 658, h: 191, file: "mia-mark" },
} as const;

interface ProductLogoProps {
  /** "lockup" = MIA | PERFORMANCE; "mark" = MIA only. */
  variant?: keyof typeof ASSETS;
  /** Surface the logo sits on: "dark" renders the white logo, "light" the black one. */
  surface: "dark" | "light";
  /** Sets the rendered height (width follows the aspect ratio), e.g. "h-5". */
  className?: string;
}

/** The MIA Performance logo. Plain <img> like the other brand images (see OrgMark). */
export function ProductLogo({ variant = "lockup", surface, className }: ProductLogoProps) {
  const asset = ASSETS[variant];
  const tone = surface === "dark" ? "light" : "dark";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/${asset.file}-${tone}.png`}
      alt={PRODUCT_NAME}
      width={asset.w}
      height={asset.h}
      decoding="async"
      className={cn("block h-5 w-auto shrink-0 select-none", className)}
      draggable={false}
    />
  );
}
