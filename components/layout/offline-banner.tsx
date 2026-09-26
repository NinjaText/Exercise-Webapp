"use client";

import { WifiOff } from "lucide-react";
import { useNative } from "@/hooks/use-native";

/**
 * Thin in-session banner (spec §9). Cold-start offline is handled by the shell's offline page.
 *
 * z-[60]: every fixed/sticky page-chrome element in the app (site navbar, in-app
 * header, mobile tab bar) tops out at z-50, and this banner must always paint above
 * them, so it needs a strictly higher value (a tie at z-50 loses to whichever fixed
 * header happens to sit later in the DOM, which is how it went invisible on `/` and
 * `/about`). components/ui dialogs, sheets, dropdowns, popovers and tooltips also
 * cap at z-50 for both their backdrop and their content, so there is no numeric gap
 * between "above chrome" and "below an open modal" to land in; any value that beats
 * chrome will also sit above them. In practice this only matters for full-height
 * Sheets (e.g. the left nav in components/layout/header.tsx), whose close button is
 * `top-3 right-3` (~12-40px from the top) against this banner's ~28px height, so at
 * most the button's upper half is briefly covered while the lower half stays
 * clickable. That partial, rare (offline + a sheet open at once) overlap is accepted
 * over the alternative of the banner being permanently invisible behind page chrome.
 */
export function OfflineBanner() {
  const { isOnline } = useNative();
  if (isOnline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 border-b border-warning-border bg-warning-soft px-4 pb-1.5 text-xs font-medium text-warning-foreground"
      style={{ paddingTop: "calc(var(--safe-top) + 0.375rem)" }}
    >
      <WifiOff className="size-3.5" aria-hidden />
      No internet connection
    </div>
  );
}
