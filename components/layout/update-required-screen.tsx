"use client";

import { useEffect, useRef } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Full-screen block for the native shell when the installed app version is
 * below the remotely configured minimum (spec: mobile store rules). Sits
 * above the offline banner (z-[60]) and all page chrome (z-50), since there
 * is nothing useful to do underneath it.
 */
export function UpdateRequiredScreen({
  platform,
  storeUrl,
  onOpenStore,
}: {
  platform: "ios" | "android";
  storeUrl: string | null;
  onOpenStore(url: string): void;
}) {
  const store = platform === "ios" ? "the App Store" : "Google Play";
  const dialogRef = useRef<HTMLDivElement>(null);

  // No other focusable content should be reachable while this blocks the
  // app (the app behind it is also made inert — see NativeProvider), so
  // move focus here on mount and announce it to screen readers.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-required-title"
      aria-describedby="update-required-description"
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background px-6 outline-none"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <Download className="size-10 text-primary" aria-hidden />
        <h1 id="update-required-title" className="text-xl font-semibold text-foreground">Update required</h1>
        <p id="update-required-description" className="text-sm text-muted-foreground">
          A newer version of Inmotus RX is available. Please update from {store} to keep using the app.
        </p>
        {storeUrl && <Button onClick={() => onOpenStore(storeUrl)}>Open {store}</Button>}
      </div>
    </div>
  );
}
