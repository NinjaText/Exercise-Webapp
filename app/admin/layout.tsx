import { requireSuperAdmin } from "@/lib/current-user";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminTopBar } from "@/components/admin/admin-top-bar";
import { BreadcrumbProvider } from "@/components/layout/breadcrumb-context";
import { ensureClubAlertSubscriber, getTotalClubAttention } from "@/lib/services/club-alerts.service";
import { StatusBadge } from "@/components/shared/status-badge";

export const metadata = { title: "Super Admin — INMOTUS RX" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();

  // Alert subscription + sidebar badge must never break the admin shell.
  const [, clubAttention] = await Promise.all([
    ensureClubAlertSubscriber(user).catch((err) => console.error("[admin] alert subscriber upsert failed:", err)),
    getTotalClubAttention().catch((err) => {
      console.error("[admin] club attention count failed:", err);
      return 0;
    }),
  ]);

  return (
    <BreadcrumbProvider>
      <div data-app-shell className="flex h-dvh overflow-hidden bg-canvas">
        <AdminSidebar
          userName={`${user.firstName} ${user.lastName}`}
          userEmail={user.email}
          clubAttention={clubAttention}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Top bar: same 56px bar and gutter as the platform shell. */}
          <header
            className="shrink-0 border-b border-border bg-surface"
            style={{ paddingTop: "var(--safe-top)" }}
          >
            <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 lg:px-6 2xl:px-8">
              <AdminMobileNav
                userName={`${user.firstName} ${user.lastName}`}
                userEmail={user.email}
                userImageUrl={user.imageUrl}
                clubAttention={clubAttention}
              />
              <StatusBadge status="admin" role="brand" label="Super Admin" size="sm" />
              <AdminTopBar />
              <p className="hidden text-caption tabular-nums sm:block">
                {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </header>
          {/* Spec §2.1 gutter: 16 mobile / 24 ≥1024 / 32 ≥1536 (no tab bar in admin). */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6 2xl:p-8">
            <div className="page-enter">{children}</div>
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
