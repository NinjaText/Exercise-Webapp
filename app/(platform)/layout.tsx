import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/current-user";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getUnreadVoiceNoteCount } from "@/lib/services/inbox.service";
import { SearchProvider } from "@/components/search/search-provider";
import { CommandPalette } from "@/components/search/command-palette";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    if (orgId) redirect("/onboarding/client");
    redirect("/onboarding");
  }
  if (!user.onboarded) {
    if (user.role === "CLIENT") redirect("/onboarding/client");
    redirect("/onboarding");
  }

  // Billing gate: redirect trainers who have no active subscription
  if (user.role === "TRAINER") {
    const sub = await prisma.trainerSubscription.findUnique({
      where: { trainerId: user.id },
    });

    const now = new Date();
    const isTrialExpired =
      !sub ||
      sub.status === "CANCELED" ||
      (sub.status === "TRIALING" && sub.trialEndsAt < now);
    const isPaymentFailed =
      sub?.status === "PAST_DUE" || sub?.status === "UNPAID";

    if (isTrialExpired) redirect("/billing?reason=trial_expired");
    if (isPaymentFailed) redirect("/billing?reason=payment_failed");
  }

  const [
    unreadChatCount,
    unreadVoiceNoteCount,
    unreadNotificationCount,
    initialNotifications,
    adminAccess,
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
  ]);

  // Workout voice notes now live inside the normal message threads, so the nav
  // shows one combined unread badge rather than a second voice-only badge.
  const unreadMessageCount = unreadChatCount + unreadVoiceNoteCount;

  return (
    <SearchProvider>
      <div className="flex h-dvh overflow-hidden bg-[oklch(0.97_0.005_247)]">
        <Sidebar
          role={user.role}
          currentPath=""
          unreadMessageCount={unreadMessageCount}
          userName={`${user.firstName} ${user.lastName}`}
          userEmail={user.email}
          userImageUrl={user.imageUrl}
          isAdmin={adminAccess}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            user={user}
            unreadMessageCount={unreadMessageCount}
            unreadNotificationCount={unreadNotificationCount}
            initialNotifications={initialNotifications}
          />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="page-enter">{children}</div>
          </main>
        </div>
        <CommandPalette role={user.role} />
      </div>
    </SearchProvider>
  );
}
