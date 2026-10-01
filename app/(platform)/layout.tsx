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
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";

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
  // Deactivated accounts (e.g. a removed club trainer) never reach the billing gate.
  if (user.isActive === false) redirect("/account-deactivated");
  if (!user.onboarded) {
    if (user.role === "CLIENT") redirect("/onboarding/client");
    // A TRAINER in a member-billed org is an invited club trainer: never the
    // trainer-org signup (which would create a second org and a trial).
    if ((await getCapabilitiesForUser(user)).billing === "member") redirect("/onboarding/club-trainer");
    redirect("/onboarding");
  }

  // Billing gate. Who pays depends on the org: trainers in trainer orgs,
  // each member in club orgs. The club trainer (a TRAINER inside a
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
        <div data-app-shell className="flex h-dvh overflow-hidden bg-[oklch(0.97_0.005_247)]">
          <BrandStyle branding={branding} />
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
          />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header
              user={user}
              unreadMessageCount={unreadMessageCount}
              unreadNotificationCount={unreadNotificationCount}
              initialNotifications={initialNotifications}
              branding={brandingVm}
              hiddenHrefs={hiddenHrefs}
            />
            <main className="flex-1 overflow-y-auto p-4 pb-[calc(1rem_+_var(--tab-bar-height)_+_var(--safe-bottom))] sm:p-6 sm:pb-[calc(1.5rem_+_var(--tab-bar-height)_+_var(--safe-bottom))] lg:pb-6">
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
      </BreadcrumbProvider>
    </SearchProvider>
  );
}
