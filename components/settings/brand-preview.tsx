"use client";

import { useMemo, type CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, LayoutDashboard, Users, Dumbbell, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { DEFAULT_LIGHT_TOKENS } from "@/lib/branding/defaults";
import { deriveBrandTokens } from "@/lib/branding/tokens";
import { BrandColorError, type BrandTokens, type LightToken } from "@/lib/branding/types";

interface BrandPreviewProps {
  /** Normalized brand hex, or null for the product default. */
  hex: string | null;
  displayName: string;
  /**
   * True while the color text box holds something that isn't a color yet.
   * `hex` still carries the last valid value then, so without this the panel
   * would keep showing (or warning about) a color the user has typed over.
   */
  incomplete?: boolean;
}

type Derived =
  | { kind: "default" }
  | { kind: "incomplete" }
  | { kind: "ok"; tokens: BrandTokens }
  | { kind: "error"; message: string };

function derive(hex: string | null, incomplete: boolean): Derived {
  if (incomplete) return { kind: "incomplete" };
  if (!hex) return { kind: "default" };
  try {
    return { kind: "ok", tokens: deriveBrandTokens(hex) };
  } catch (err) {
    const message = err instanceof BrandColorError ? err.message : "This color can't be used";
    return { kind: "error", message };
  }
}

/**
 * Light tokens as inline custom properties. Tailwind's `@theme inline`
 * mapping (app/globals.css) makes utilities such as `bg-primary` read
 * `var(--primary)` directly, so these override the whole subtree — and only
 * the subtree: nothing global changes while editing.
 */
function tokenStyle(light: Record<LightToken, string>): CSSProperties {
  return Object.fromEntries(
    Object.entries(light).map(([name, value]) => [`--${name}`, value]),
  ) as CSSProperties;
}

/**
 * Always set, even with no valid color: otherwise the panel would inherit the
 * org's live injected brand (`<style id="org-brand">`) while saying it shows
 * the default look.
 */
const DEFAULT_STYLE = tokenStyle(DEFAULT_LIGHT_TOKENS);

/** Floors to one decimal so a ratio just under a threshold is never shown as passing. */
function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 10) / 10).toFixed(1);
}

const NAV_ROWS = [
  { label: "Dashboard", icon: LayoutDashboard, active: false },
  { label: "Clients", icon: Users, active: true },
  { label: "Programs", icon: Dumbbell, active: false },
];

export function BrandPreview({ hex, displayName, incomplete = false }: BrandPreviewProps) {
  const derived = useMemo(() => derive(hex, incomplete), [hex, incomplete]);
  const style = useMemo(
    () => (derived.kind === "ok" ? tokenStyle(derived.tokens.light) : DEFAULT_STYLE),
    [derived],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Light preview. A second panel from `tokens.dark` belongs beside it once
          the app ships a theme toggle (spec §8, Preview) — until then dark mode is unreachable. */}
      <div
        style={style}
        className="overflow-hidden rounded-xl border border-border bg-background text-foreground"
      >
        {/* Demo only: inert so its buttons and link are not focusable or announced. */}
        <div inert className="flex min-h-56">
          <div
            className="flex w-40 shrink-0 flex-col gap-3 bg-sidebar-gradient p-3"
          >
            <p className="truncate px-2 text-sm font-bold tracking-tight text-sidebar-foreground">
              {displayName}
            </p>
            <div className="flex flex-col gap-0.5">
              {NAV_ROWS.map(({ label, icon: Icon, active }) => (
                <div
                  key={label}
                  className={
                    active
                      ? "flex h-8 items-center gap-2 rounded-lg bg-sidebar-primary/15 px-2 text-xs font-medium text-sidebar-primary"
                      : "flex h-8 items-center gap-2 rounded-lg px-2 text-xs font-medium text-sidebar-foreground/60"
                  }
                >
                  <Icon className="size-3.5 shrink-0" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Jordan Lee</p>
              <StatusBadge status="brand" role="brand" label="Active plan" size="sm" />
            </div>
            <div className="rounded-lg border border-brand-border bg-brand-soft px-3 py-2 text-xs text-brand-foreground">
              Week 3 of 8 — next session on Thursday.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" tabIndex={-1}>
                Assign program
              </Button>
              <Button size="sm" variant="outline" tabIndex={-1}>
                Message
              </Button>
            </div>
            <span className="text-xs font-medium text-primary underline underline-offset-4">
              View progress
            </span>
          </div>
        </div>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {derived.kind === "default" && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="size-4 shrink-0" aria-hidden />
            Showing the default look. Pick a color to preview your branding.
          </p>
        )}

        {derived.kind === "incomplete" && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="size-4 shrink-0" aria-hidden />
            Finish entering a color like #1d4ed8 to preview it.
          </p>
        )}

        {derived.kind === "ok" && (
          <>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              {derived.tokens.meta.primaryForeground === "light" ? "White" : "Dark"} text on your color:{" "}
              {formatRatio(derived.tokens.meta.contrastOnPrimary)}:1 — passes AA
            </p>
            {derived.tokens.meta.adjusted && (
              <p className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
                <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
                <span>
                  We darkened your color slightly ({derived.tokens.meta.adjustedFromHex} →{" "}
                  {derived.tokens.meta.primaryHex}) so text stays readable.
                </span>
              </p>
            )}
          </>
        )}

        {/* Plain text: the Color field owns the alert (and aria-describedby) for this message. */}
        {derived.kind === "error" && (
          <p className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger-foreground">
            <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
            <span>{derived.message}</span>
          </p>
        )}
      </div>
    </div>
  );
}
