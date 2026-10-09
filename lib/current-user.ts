import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { isStaleHouseCoach } from "@/lib/clubs/house-coach-guard";
import { isSuperAdminEmail } from "@/lib/auth/super-admin-emails";

export async function getCurrentUser(): Promise<User> {
  const { userId, orgId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  let user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) {
    // New Clerk user: orgId present = came via org invitation = client path
    if (orgId) redirect("/onboarding/client");
    redirect("/onboarding");
  }

  if (!user.isActive) redirect("/account-deactivated");

  // Backstop for the proxy guard (spec H9).
  if (await isStaleHouseCoach(user, sessionClaims)) redirect("/club-session/ended");

  // Auto-sync clerkOrgId from the live Clerk session into the DB.
  // This handles accounts created before Clerk Organizations were configured —
  // the DB field stays null until the user logs in again, at which point it's fixed.
  if (orgId && !user.clerkOrgId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { clerkOrgId: orgId },
    });
  }

  if (!user.onboarded) {
    if (user.role === "CLIENT") redirect("/onboarding/client");
    redirect("/onboarding");
  }

  return user;
}

export async function getCurrentUserOrNull(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { clerkId: userId } });
}

export async function requireRole(role: "TRAINER" | "CLIENT"): Promise<User> {
  const user = await getCurrentUser();
  if (user.role !== role) redirect("/dashboard");
  return user;
}

export async function requireSuperAdmin(): Promise<User> {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) redirect("/sign-in");

  // Clerk publicMetadata path (used once Clerk dashboard is configured)
  const meta = sessionClaims?.publicMetadata as { superAdmin?: boolean } | undefined;
  const hasClerkFlag = meta?.superAdmin === true;

  // Env-var fallback — add SUPER_ADMIN_EMAILS=you@example.com to .env
  const hasEmailFlag = isSuperAdminEmail(user.email);

  if (!hasClerkFlag && !hasEmailFlag) redirect("/dashboard");
  return user;
}

export async function isSuperAdmin(): Promise<boolean> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return false;

  const meta = sessionClaims?.publicMetadata as { superAdmin?: boolean } | undefined;
  if (meta?.superAdmin === true) return true;

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) return false;

  return isSuperAdminEmail(user.email);
}
