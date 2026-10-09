import type { Metadata, Viewport } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/current-user";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getUnreadVoiceNoteCount } from "@/lib/services/inbox.service";
import { SearchProvider } from "@/components/search/search-provider";
import { CommandPalette } from "@/components/search/command-palette";
import { BreadcrumbProvider } from "@/components/layout/breadcrumb-context";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { MemberTrialBanner } from "@/components/billing/member-trial-banner";
import { BrandStyle } from "@/components/branding/brand-style";
import { getCurrentBranding, getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { brandIconsMetadata, brandViewport } from "@/lib/branding/metadata";
import { evaluateAccess, evaluateMemberAccess, memberTrialBannerDays } from "@/lib/billing/access";
import { hiddenNavHrefs } from "@/lib/org-capabilities";
import { getCapabilitiesForUser, getOrgForUser } from "@/lib/org-capabilities.server";
import { isHouseCoach } from "@/lib/services/house-coach.service";
import { getActingAdmin } from "@/lib/clubs/admin-session";
import { ClubAdminBanner } from "@/components/clubs/club-admin-banner";

// Both deduped with the layout's own read via React.cache in branding.service.
export async function generateMetadata(): Promise<Metadata> {
  const b = await getCurrentBranding();
  return {
    // `absolute`, not `default`: a layout's own title is still run through the
    // root template ("%s | INMOTUS RX"), which gave "Yahya Clinic | INMOTUS RX"
    // on every page without a title of its own.
    title: { template: `%s | ${b.displayName}`, absolute: b.displayName },
    // Full replacement of the root PRODUCT_ICONS when branded; no key at all
    // when unbranded so the product favicon is inherited.
    ...brandIconsMetadata(b),
  };
}

export async function generateViewport(): Promise<Viewport> {
  const b = await getCurrentBranding();
  return brandViewport(b);
}

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    if (orgId) redirect("/onboarding/client");
    redirect("/onboarding");
  }
  // Deactivated accounts (e.g. a removed trainer) never reach the billing gate.
  if (user.isActive === false) redirect("/account-deactivated");
  if (!user.onboarded) {
    if (user.role === "CLIENT") redirect("/onboarding/client");
    redirect("/onboarding");
  }

  // Billing gate. Who pays depends on the org: trainers in trainer orgs,
  // each member in club orgs. A club's house coach (a TRAINER inside a
  // member-billed org) is never gated. Per-user caps: `billing` depends only on the org, the
  // feature flags also on role and (club members) coaching status.
  const caps = await getCapabilitiesForUser(user);
  const now = new Date();
  let memberTrialDays: number | null = null;

  if (user.role === "TRAINER" && caps.billing === "trainer") {
    const sub = await prisma.trainerSubscription.findUnique({ where: { trainerId: user.id } });
    const verdict = evaluateAccess(sub, now);
    if (verdict !== "ok") redirect(`/billing?reason=${verdict}`);
  }

  if (user.role === "CLIENT" && caps.billing === "member") {
    const sub = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
    const verdict = evaluateMemberAccess(sub, now);
    if (verdict !== "ok") redirect(`/billing?reason=${verdict}`);
    memberTrialDays = memberTrialBannerDays(sub, now);
  }

  const hiddenHrefs = hiddenNavHrefs(caps);

  // A house coach is only ever reached through an admin's club session (getCurrentUser
  // enforces it). The marker must belong to *this* user: a stale cookie on an
  // admin's own session must not show the banner.
  const clubOrg = await getOrgForUser(user);
  const houseCoach = await isHouseCoach(user, clubOrg);
  const marker = houseCoach ? await getActingAdmin() : null;
  const actingAdmin = marker && marker.houseCoachClerkId === user.clerkId ? marker : null;

  const [
    unreadChatCount,
    unreadVoiceNoteCount,
    unreadNotificationCount,
    initialNotifications,
    adminAccess,
    branding,
  ] = await Promise.all([
    prisma.message.count({
      where: { recipientId: user.id, isRead: false },
    }),
    getUnreadVoiceNoteCount(user.id, user.role),
    prisma.notification.count({
      where: { userId: user.id, isRead: false },
    }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    isSuperAdmin(),
    // DB user's clerkOrgId is canonical (clients inherit their trainer's org).
    getOrgBranding(user.clerkOrgId ?? null),
  ]);

  // Workout voice notes now live inside the normal message threads, so the nav
  // shows one combined unread badge rather than a second voice-only badge.
  const unreadMessageCount = unreadChatCount + unreadVoiceNoteCount;
  // Only the serialisable, client-safe subset crosses into client components.
  const brandingVm = toViewModel(branding);

  return (
    <SearchProvider>
      <BreadcrumbProvider>
        <div data-app-shell className="flex h-dvh flex-col overflow-hidden bg-canvas">
          <BrandStyle branding={branding} />
          {actingAdmin && clubOrg && (
            <ClubAdminBanner clubName={clubOrg.name} adminName={actingAdmin.adminName} />
          )}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <Sidebar
              role={user.role}
              currentPath=""
              unreadMessageCount={unreadMessageCount}
              userName={`${user.firstName} ${user.lastName}`}
              userEmail={user.email}
              userImageUrl={user.imageUrl}
              isAdmin={adminAccess}
              hiddenHrefs={hiddenHrefs}
              branding={brandingVm}
              houseCoach={houseCoach}
            />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <Header
                user={user}
                unreadMessageCount={unreadMessageCount}
                unreadNotificationCount={unreadNotificationCount}
                initialNotifications={initialNotifications}
                branding={brandingVm}
                hiddenHrefs={hiddenHrefs}
                houseCoach={houseCoach}
              />
              {/* Spec §2.1 gutter: 16 mobile / 24 ≥1024 / 32 ≥1536. Below lg the bottom
                  padding also clears the fixed tab bar and the safe area. */}
              <main className="flex-1 overflow-y-auto p-4 pb-[calc(1rem_+_var(--tab-bar-height)_+_var(--safe-bottom))] lg:p-6 2xl:p-8">
                {memberTrialDays !== null && <MemberTrialBanner daysLeft={memberTrialDays} />}
                <div className="page-enter">{children}</div>
              </main>
              <MobileTabBar
                role={user.role}
                unreadMessageCount={unreadMessageCount}
                isAdmin={adminAccess}
                hiddenHrefs={hiddenHrefs}
              />
            </div>
            <CommandPalette role={user.role} />
          </div>
        </div>
      </BreadcrumbProvider>
    </SearchProvider>
  );
}
