"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SIDEBAR_DRAWER_CLASS } from "./sidebar-primitives";

/**
 * Below-lg navigation drawer shared by the platform and Super Admin shells.
 *
 * The drawer closes itself as soon as a link inside it is tapped, and again
 * whenever the route changes (back/forward, search, redirects) — otherwise it
 * stays open over the new page and needs a second tap on the backdrop.
 */
export function MobileNavDrawer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on route change (adjust-state-during-render, no effect needed).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open navigation"
        className="-ml-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors select-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent
        side="left"
        className={SIDEBAR_DRAWER_CLASS}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a[href]")) setOpen(false);
        }}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
