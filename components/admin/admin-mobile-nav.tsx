"use client";

import { AdminSidebar } from "./admin-sidebar";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";

interface AdminMobileNavProps {
  userName: string;
  userEmail: string;
  userImageUrl?: string | null;
  clubAttention?: number;
}

export function AdminMobileNav({ userName, userEmail, clubAttention }: AdminMobileNavProps) {
  return (
    <MobileNavDrawer>
      <AdminSidebar userName={userName} userEmail={userEmail} clubAttention={clubAttention} mobileMode />
    </MobileNavDrawer>
  );
}
