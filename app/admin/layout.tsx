import { requireSuperAdmin } from "@/lib/current-user";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";

export const metadata = { title: "Super Admin — INMOTUS RX" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();

  return (
    <div className="flex h-screen overflow-hidden bg-[oklch(0.97_0.005_247)]">
      <AdminSidebar
        userName={`${user.firstName} ${user.lastName}`}
        userEmail={user.email}
        userImageUrl={user.imageUrl}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <AdminMobileNav
              userName={`${user.firstName} ${user.lastName}`}
              userEmail={user.email}
              userImageUrl={user.imageUrl}
            />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Super Admin
            </span>
          </div>
          <p className="hidden text-[11px] text-muted-foreground font-mono sm:block">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
