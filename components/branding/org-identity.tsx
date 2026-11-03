import { cn } from "@/lib/utils";
import type { BrandingViewModel } from "@/lib/branding/types";
import { OrgMark } from "./org-mark";
import { ProductLogo } from "./product-logo";

/**
 * Fixed logo boxes (spec §6.1: explicit width/height, no layout shift).
 * "default" fits the sidebar / mobile header rows; "lg" is the auth brand panel.
 */
const LOGO_BOX = {
  default: { w: 176, h: 32, className: "h-8 w-44" },
  lg: { w: 240, h: 56, className: "h-14 w-60" },
} as const;
type LogoSize = keyof typeof LOGO_BOX;

interface OrgIdentityProps {
  branding: BrandingViewModel;
  /** "dark" = the always-dark sidebar; "light" = card/header surfaces. */
  surface: "dark" | "light";
  subtitle?: string;
  /** Logo box size. Only affects uploaded logos, not the mark + name fallback. */
  size?: LogoSize;
}

function Logo({ src, alt, size }: { src: string; alt: string; size: LogoSize }) {
  const box = LOGO_BOX[size];
  return (
    // Plain <img> for all brand images (see OrgMark for why).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={box.w}
      height={box.h}
      decoding="async"
      className={cn("block max-w-full object-contain object-left", box.className)}
    />
  );
}

/**
 * Org identity lockup implementing the spec §6.1 fallback table:
 * - dark:  logo-on-dark ‖ logo-on-light on a `bg-card` plate ‖ mark + name
 * - light: logo-on-light ‖ mark + name
 * Renders the MIA Performance logo when branding is disabled.
 *
 * Returns inline children for a flex row (the caller owns the `h-16` row).
 */
export function OrgIdentity({ branding, surface, subtitle, size = "default" }: OrgIdentityProps) {
  const dark = surface === "dark";
  const subtitleEl = subtitle ? (
    <p
      className={cn(
        "text-[10px] font-medium uppercase tracking-widest",
        dark ? "text-sidebar-foreground/40" : "text-muted-foreground",
      )}
    >
      {subtitle}
    </p>
  ) : null;

  if (!branding.enabled) {
    return (
      <div className="min-w-0">
        <ProductLogo surface={surface} className="h-5" />
        {subtitle ? <div className="mt-1.5">{subtitleEl}</div> : null}
      </div>
    );
  }

  const { displayName, logoOnDarkUrl, logoOnLightUrl } = branding;

  let logo: React.ReactNode = null;
  if (dark && logoOnDarkUrl) {
    logo = <Logo src={logoOnDarkUrl} alt={displayName} size={size} />;
  } else if (dark && logoOnLightUrl) {
    logo = (
      <span className="block w-fit bg-card rounded-md px-1.5 py-0.5">
        <Logo src={logoOnLightUrl} alt={displayName} size={size} />
      </span>
    );
  } else if (!dark && logoOnLightUrl) {
    logo = <Logo src={logoOnLightUrl} alt={displayName} size={size} />;
  }

  if (logo) {
    return (
      <div className="min-w-0">
        {logo}
        {subtitleEl}
      </div>
    );
  }

  return (
    <>
      <OrgMark branding={branding} size={32} />
      <div className="min-w-0">
        <span
          className={cn(
            "block truncate text-[15px] font-bold tracking-tight",
            dark ? "text-sidebar-foreground" : "text-foreground",
          )}
        >
          {displayName}
        </span>
        {subtitleEl}
      </div>
    </>
  );
}
