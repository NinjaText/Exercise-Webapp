"use client";

import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { AdminSidebar } from "./admin-sidebar";

interface AdminMobileNavProps {
  userName: string;
  userEmail: string;
  userImageUrl?: string | null;
}

export function AdminMobileNav({ userName, userEmail, userImageUrl }: AdminMobileNavProps) {
  return (
    <Sheet>
      <SheetTrigger
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-medium transition-all outline-none select-none hover:bg-muted hover:text-foreground size-8 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <AdminSidebar
          userName={userName}
          userEmail={userEmail}
          userImageUrl={userImageUrl}
          mobileMode
        />
      </SheetContent>
    </Sheet>
  );
}
