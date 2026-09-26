import { cn } from "@/lib/utils";
import type { BrandingViewModel } from "@/lib/branding/types";

/**
 * First user-perceived character of `name`, upper-cased: whole grapheme
 * clusters via `Intl.Segmenter` (so emoji ZWJ sequences / combining marks stay
 * intact), else the first code point. Blank names give "?".
 */
export function firstGrapheme(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  let first: string | undefined;
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    first = seg.segment(trimmed)[Symbol.iterator]().next().value?.segment;
  }
  first ??= Array.from(trimmed)[0];
  return (first ?? "?").toLocaleUpperCase();
}

interface OrgMarkProps {
  branding: Pick<BrandingViewModel, "displayName" | "markUrl">;
  /** Square edge in px (default 32 = `size-8`). */
  size?: number;
  className?: string;
}

/**
 * The org's square mark, or an initial-letter tile in `--primary` (which is the
 * brand color whenever branding is enabled). The tile is `aria-hidden` because
 * every caller renders the display name beside it.
 */
export function OrgMark({ branding, size = 32, className }: OrgMarkProps) {
  const box = { width: size, height: size };

  if (branding.markUrl) {
    return (
      // Plain <img>, not next/image: small immutable own-bucket PNGs, and the
      // R2 host is not in next.config images. Explicit size → no layout shift.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={branding.markUrl}
        alt={branding.displayName}
        width={size}
        height={size}
        decoding="async"
        style={box}
        className={cn("shrink-0 rounded-lg object-contain", className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ ...box, fontSize: Math.round(size * 0.45) }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold leading-none shadow-sm",
        className,
      )}
    >
      {firstGrapheme(branding.displayName)}
    </span>
  );
}
