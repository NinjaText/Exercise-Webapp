import { requireSuperAdmin } from "@/lib/current-user";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminTopBar } from "@/components/admin/admin-top-bar";
import { BreadcrumbProvider } from "@/components/layout/breadcrumb-context";
import { StatusBadge } from "@/components/shared/status-badge";

export const metadata = { title: "Super Admin — INMOTUS RX" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();

  return (
    <BreadcrumbProvider>
      <div className="flex h-dvh overflow-hidden bg-[oklch(0.97_0.005_247)]">
        <AdminSidebar
          userName={`${user.firstName} ${user.lastName}`}
          userEmail={user.email}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-16 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
            <AdminMobileNav
              userName={`${user.firstName} ${user.lastName}`}
              userEmail={user.email}
              userImageUrl={user.imageUrl}
            />
            <StatusBadge status="admin" role="brand" label="Super Admin" size="sm" />
            <AdminTopBar />
            <p className="hidden text-[11px] text-muted-foreground font-mono sm:block">
              {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </header>
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="page-enter">{children}</div>
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
