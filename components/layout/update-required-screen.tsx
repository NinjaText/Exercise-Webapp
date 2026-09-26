"use client";

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
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-required-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background px-6"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <Download className="size-10 text-primary" aria-hidden />
        <h1 id="update-required-title" className="text-xl font-semibold text-foreground">Update required</h1>
        <p className="text-sm text-muted-foreground">
          A newer version of Inmotus RX is available. Please update from {store} to keep using the app.
        </p>
        {storeUrl && <Button onClick={() => onOpenStore(storeUrl)}>Open {store}</Button>}
      </div>
    </div>
  );
}
