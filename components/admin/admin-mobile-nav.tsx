"use client";

import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { AdminSidebar } from "./admin-sidebar";
import { SIDEBAR_DRAWER_CLASS } from "@/components/layout/sidebar-primitives";

interface AdminMobileNavProps {
  userName: string;
  userEmail: string;
  userImageUrl?: string | null;
}

export function AdminMobileNav({ userName, userEmail }: AdminMobileNavProps) {
  return (
    <Sheet>
      <SheetTrigger
        aria-label="Open navigation"
        className="-ml-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors select-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" className={SIDEBAR_DRAWER_CLASS}>
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <AdminSidebar
          userName={userName}
          userEmail={userEmail}
          mobileMode
        />
      </SheetContent>
    </Sheet>
  );
}
