"use client";

import { AdminSidebar } from "./admin-sidebar";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";

interface AdminMobileNavProps {
  userName: string;
  userEmail: string;
  userImageUrl?: string | null;
}

export function AdminMobileNav({ userName, userEmail }: AdminMobileNavProps) {
  return (
    <MobileNavDrawer>
      <AdminSidebar userName={userName} userEmail={userEmail} mobileMode />
    </MobileNavDrawer>
  );
}
