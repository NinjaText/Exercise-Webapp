"use client";

import { WifiOff } from "lucide-react";
import { useNative } from "@/hooks/use-native";

/** Thin in-session banner (spec §9). Cold-start offline is handled by the shell's offline page. */
export function OfflineBanner() {
  const { isOnline } = useNative();
  if (isOnline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-warning-border bg-warning-soft px-4 pb-1.5 text-xs font-medium text-warning-foreground"
      style={{ paddingTop: "calc(var(--safe-top) + 0.375rem)" }}
    >
      <WifiOff className="size-3.5" aria-hidden />
      No internet connection
    </div>
  );
}
