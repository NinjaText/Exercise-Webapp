import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrandingViewModel } from "@/lib/branding/types";
import { OrgIdentity } from "@/components/branding/org-identity";

/** Form column caps (spec §2.4): 520px, or 640px for multi-field forms. */
export const AUTH_FORM_WIDTH_CLASS = {
  default: "max-w-[520px]",
  wide: "max-w-[640px]",
} as const;

export type AuthShellSize = keyof typeof AUTH_FORM_WIDTH_CLASS;

interface AuthShellProps {
  /** Org/club identity for the brand panel and mobile header. */
  branding: BrandingViewModel;
  /** The page's h1. */
  headline: React.ReactNode;
  subhead?: React.ReactNode;
  /** Up to ~3 short feature points shown in the brand panel (desktop only). */
  bullets?: React.ReactNode[];
  size?: AuthShellSize;
  /**
   * "page" (default): the headline is the page's h1 (brand panel on desktop,
   * mobile heading block below). "form": the embedded form (e.g. Clerk) owns
   * the heading, so the headline renders as plain brand-panel text and the
   * mobile heading block is omitted.
   */
  headingMode?: "page" | "form";
  /**
   * Pinned to the bottom of the right panel. Omit for the default
   * Privacy / Terms links; pass `null` to render no footer.
   */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

function LegalLinks() {
  return (
    <nav aria-label="Legal" className="flex items-center gap-4">
      <Link
        href="/privacy"
        className="inline-flex h-8 items-center rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Privacy
      </Link>
      <Link
        href="/terms"
        className="inline-flex h-8 items-center rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Terms
      </Link>
    </nav>
  );
}

/**
 * Full-height split layout for sign-in/up, onboarding, club join, billing and
 * account-status pages (spec §2.4).
 *
 * - ≥1024px: a 2/5 brand panel (sidebar surface, so org branding and its
 *   contrast guard apply) beside a 3/5 form panel. The form column is
 *   top-aligned with a fixed offset — never vertically centred — and the
 *   footer sits at the bottom of the right panel, so there are no dead bands.
 * - <1024px: one column with a compact logo header; the brand panel is hidden.
 *
 * Server-safe (no hooks): usable from server and client pages alike.
 */
export function AuthShell({
  branding,
  headline,
  subhead,
  bullets,
  size = "default",
  headingMode = "page",
  footer,
  children,
}: AuthShellProps) {
  const widthClass = AUTH_FORM_WIDTH_CLASS[size];
  const footerContent = footer === undefined ? <LegalLinks /> : footer;

  return (
    <div data-slot="auth-shell" className="grid min-h-dvh bg-surface lg:grid-cols-5">
      <div
        data-slot="auth-brand-panel"
        className="relative hidden min-h-dvh bg-sidebar-gradient text-sidebar-foreground lg:col-span-2 lg:flex"
      >
        {/* Decorative glows in the brand accent, clipped by their own wrapper:
            overflow on the panel itself would make it the sticky container. */}
        <div
          data-slot="auth-brand-decoration"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute -top-32 -right-32 size-96 rounded-full bg-sidebar-primary/20 blur-3xl" />
          <div className="absolute -bottom-40 -left-24 size-80 rounded-full bg-sidebar-primary/10 blur-3xl" />
        </div>

        {/* min-h (never a fixed h) so tall content grows instead of clipping;
            self-start so the sticky box is shorter than the stretched panel
            and follows the scroll on long (wide) forms. */}
        <div
          data-slot="auth-brand-content"
          className="flex min-h-dvh w-full flex-col self-start px-10 py-10 lg:sticky lg:top-0 xl:px-14"
        >
          <div className="flex h-10 items-center gap-3">
            <OrgIdentity branding={branding} surface="dark" />
          </div>

          <div className="flex flex-1 flex-col justify-center py-12">
            <div className="max-w-md">
              {headingMode === "page" ? (
                <h1 className="text-display text-balance text-sidebar-foreground">{headline}</h1>
              ) : (
                <p data-slot="auth-brand-headline" className="text-display text-balance text-sidebar-foreground">
                  {headline}
                </p>
              )}
              {subhead ? (
                <p className="mt-4 text-base leading-7 text-pretty text-sidebar-foreground/75">
                  {subhead}
                </p>
              ) : null}
              {bullets && bullets.length > 0 ? (
                <ul className="mt-10 flex flex-col gap-4">
                  {bullets.map((bullet, i) => (
                    <li key={i} className="flex items-start gap-3 text-body text-sidebar-foreground/90">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground"
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <p className="text-caption text-sidebar-foreground/70">© {branding.displayName}</p>
        </div>
      </div>

      <div
        data-slot="auth-panel"
        className="flex min-h-dvh flex-col bg-surface lg:col-span-3"
        style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}
      >
        <header
          data-slot="auth-mobile-header"
          className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6 lg:hidden"
        >
          <OrgIdentity branding={branding} surface="light" />
        </header>

        <main className="flex-1 px-4 pt-8 pb-10 sm:px-6 sm:pt-12 lg:px-12 lg:pt-20 xl:pt-24">
          <div data-slot="auth-form-column" data-size={size} className={cn("mx-auto w-full", widthClass)}>
            {/* Mobile carries the headline here; on desktop it lives in the brand panel. */}
            {headingMode === "page" ? (
              <div data-slot="auth-mobile-heading" className="mb-8 lg:hidden">
                <h1 className="text-title text-balance text-foreground">{headline}</h1>
                {subhead ? <p className="mt-2 text-body text-muted-foreground">{subhead}</p> : null}
              </div>
            ) : null}
            {children}
          </div>
        </main>

        {footerContent !== null && footerContent !== false ? (
          <footer
            data-slot="auth-footer"
            className="shrink-0 px-4 py-6 text-caption sm:px-6 lg:px-12"
          >
            <div className={cn("mx-auto flex w-full flex-wrap items-center gap-x-4 gap-y-2", widthClass)}>
              {footerContent}
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
