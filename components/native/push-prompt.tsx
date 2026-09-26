"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { resolveNativeInfo } from "@/lib/native/platform";
import { requestPushPermission, shouldShowPushPrompt } from "@/lib/native/push";

const VISITS_KEY = "inmotus:push-prompt-visits";
const DISMISSED_KEY = "inmotus:push-prompt-dismissed";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Without storage the prompt simply never reaches its second visit.
  }
}

/**
 * The soft pre-permission ask, shown from the second dashboard visit inside
 * the native shell while the OS permission is still undecided. "Turn on"
 * raises the real OS dialog; "Not now" (or closing the sheet) stops asking.
 */
export function PushPrompt() {
  const [open, setOpen] = useState(false);
  const counted = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // Count each mount once, even under strict mode's double effect.
    let visits = Number(readStorage(VISITS_KEY)) || 0;
    if (!counted.current) {
      counted.current = true;
      visits += 1;
      writeStorage(VISITS_KEY, String(visits));
    }
    const dismissed = readStorage(DISMISSED_KEY) === "1";
    let cancelled = false;
    import("@capacitor/push-notifications")
      .then(({ PushNotifications }) => PushNotifications.checkPermissions())
      .then(({ receive }) => {
        if (!cancelled && shouldShowPushPrompt({ isNative: true, permission: receive, dismissed, visits })) {
          setOpen(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    writeStorage(DISMISSED_KEY, "1");
    setOpen(false);
  }

  async function turnOn() {
    setOpen(false);
    const platform = resolveNativeInfo({ capacitorPlatform: Capacitor.getPlatform(), allowOverride: false }).platform;
    if (!platform) return;
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await requestPushPermission({ plugin: PushNotifications, platform });
    } catch {
      // The OS dialog is the source of truth; nothing to report here.
    }
  }

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
      <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl pb-[calc(1rem_+_var(--safe-bottom))]">
        <SheetHeader>
          <SheetTitle>Get reminders for workouts and messages</SheetTitle>
          <SheetDescription>
            Inmotus RX can notify you about new messages, check-ins and upcoming sessions.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button onClick={turnOn}>Turn on</Button>
          <Button variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
