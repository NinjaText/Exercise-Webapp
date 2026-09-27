import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrandingViewModel } from "@/lib/branding/types";
import { OrgMark } from "./org-mark";

/** Fixed logo box (spec §6.1: `h-8` + explicit width/height, no layout shift). */
const LOGO_W = 144;
const LOGO_H = 28;

interface OrgIdentityProps {
  branding: BrandingViewModel;
  /** "dark" = the always-dark sidebar; "light" = card/header surfaces. */
  surface: "dark" | "light";
  subtitle?: string;
}

function Logo({ src, alt }: { src: string; alt: string }) {
  return (
    // Plain <img> for all brand images (see OrgMark for why).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={LOGO_W}
      height={LOGO_H}
      decoding="async"
      className="block h-7 w-36 object-contain object-left"
    />
  );
}

/**
 * Org identity lockup implementing the spec §6.1 fallback table:
 * - dark:  logo-on-dark ‖ logo-on-light on a `bg-card` plate ‖ mark + name
 * - light: logo-on-light ‖ mark + name
 * Renders the unchanged product identity when branding is disabled.
 *
 * Returns inline children for a flex row (the caller owns the `h-16` row).
 */
export function OrgIdentity({ branding, surface, subtitle }: OrgIdentityProps) {
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
    if (dark) {
      // Byte-for-byte the pre-branding sidebar identity (class order included).
      return (
        <>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted shadow-sm">
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">
              INMOTUS RX
            </span>
            {subtitle ? (
              <p className="text-[10px] font-medium text-sidebar-foreground/40 uppercase tracking-widest">
                {subtitle}
              </p>
            ) : null}
          </div>
        </>
      );
    }

    // Same Activity tile on a light surface: name in text-foreground, subtitle in text-muted-foreground.
    return (
      <>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted shadow-sm">
          <Activity className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            INMOTUS RX
          </span>
          {subtitle ? (
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
              {subtitle}
            </p>
          ) : null}
        </div>
      </>
    );
  }

  const { displayName, logoOnDarkUrl, logoOnLightUrl } = branding;

  let logo: React.ReactNode = null;
  if (dark && logoOnDarkUrl) {
    logo = <Logo src={logoOnDarkUrl} alt={displayName} />;
  } else if (dark && logoOnLightUrl) {
    logo = (
      <span className="block w-fit bg-card rounded-md px-1.5 py-0.5">
        <Logo src={logoOnLightUrl} alt={displayName} />
      </span>
    );
  } else if (!dark && logoOnLightUrl) {
    logo = <Logo src={logoOnLightUrl} alt={displayName} />;
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
